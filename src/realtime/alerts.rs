use anyhow::Result;
use bson::{doc, oid::ObjectId, Document};
use chrono::{DateTime, Utc};
use mongodb::Collection;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{error, info, warn};

use super::metrics::MetricsTracker;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlertRule {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub name: String,
    pub enabled: bool,
    pub condition: AlertCondition,
    pub action: AlertAction,
    #[serde(default)]
    pub last_triggered: Option<DateTime<Utc>>,
    #[serde(default)]
    pub trigger_count: u64,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum AlertCondition {
    /// Trigger when error rate exceeds threshold (0.0 - 1.0)
    #[serde(rename = "error_rate")]
    ErrorRate { threshold: f64 },
    /// Trigger when errors per second exceeds threshold
    #[serde(rename = "errors_per_second")]
    ErrorsPerSecond { threshold: f64 },
    /// Trigger when logs per second exceeds threshold
    #[serde(rename = "logs_per_second")]
    LogsPerSecond { threshold: f64 },
    /// Trigger when a specific log level count exceeds threshold
    #[serde(rename = "level_count")]
    LevelCount { level: String, threshold: u64 },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum AlertAction {
    /// Send webhook notification
    #[serde(rename = "webhook")]
    Webhook { url: String, method: Option<String> },
    /// Log to console (for testing)
    #[serde(rename = "log")]
    Log,
}

#[derive(Debug, Serialize)]
pub struct AlertNotification {
    pub alert_name: String,
    pub condition: String,
    pub current_value: f64,
    pub threshold: f64,
    pub timestamp: DateTime<Utc>,
    pub message: String,
}

pub struct AlertManager {
    collection: Collection<Document>,
    http_client: reqwest::Client,
    metrics: Arc<MetricsTracker>,
    /// Cooldown period in seconds to prevent alert spam
    cooldown_secs: i64,
    /// Cache of last trigger times
    last_triggers: RwLock<std::collections::HashMap<String, DateTime<Utc>>>,
}

impl AlertManager {
    pub fn new(
        collection: Collection<Document>,
        metrics: Arc<MetricsTracker>,
        cooldown_secs: i64,
    ) -> Arc<Self> {
        Arc::new(Self {
            collection,
            http_client: reqwest::Client::new(),
            metrics,
            cooldown_secs,
            last_triggers: RwLock::new(std::collections::HashMap::new()),
        })
    }

    /// Create a new alert rule
    pub async fn create_alert(&self, mut alert: AlertRule) -> Result<String> {
        alert.created_at = Utc::now();
        alert.trigger_count = 0;
        alert.last_triggered = None;

        let doc = bson::to_document(&alert)?;
        let result = self.collection.insert_one(doc).await?;
        Ok(result.inserted_id.as_object_id().unwrap().to_hex())
    }

    /// Get all alert rules
    pub async fn get_alerts(&self) -> Result<Vec<AlertRule>> {
        use futures::TryStreamExt;

        let cursor = self.collection.find(doc! {}).await?;
        let docs: Vec<Document> = cursor.try_collect().await?;

        let alerts: Vec<AlertRule> = docs
            .into_iter()
            .filter_map(|doc| bson::from_document(doc).ok())
            .collect();

        Ok(alerts)
    }

    /// Get alert by ID
    pub async fn get_alert(&self, id: &str) -> Result<Option<AlertRule>> {
        let object_id = ObjectId::parse_str(id)?;
        let doc = self.collection.find_one(doc! { "_id": object_id }).await?;
        Ok(doc.and_then(|d| bson::from_document(d).ok()))
    }

    /// Update alert rule
    pub async fn update_alert(&self, id: &str, alert: AlertRule) -> Result<bool> {
        let object_id = ObjectId::parse_str(id)?;
        let doc = bson::to_document(&alert)?;
        let result = self
            .collection
            .replace_one(doc! { "_id": object_id }, doc)
            .await?;
        Ok(result.modified_count > 0)
    }

    /// Delete alert rule
    pub async fn delete_alert(&self, id: &str) -> Result<bool> {
        let object_id = ObjectId::parse_str(id)?;
        let result = self
            .collection
            .delete_one(doc! { "_id": object_id })
            .await?;
        Ok(result.deleted_count > 0)
    }

    /// Check all alerts and trigger if conditions are met
    pub async fn check_alerts(&self) -> Result<Vec<String>> {
        let alerts = self.get_alerts().await?;
        let metrics = self.metrics.get_metrics().await;
        let now = Utc::now();

        let mut triggered = Vec::new();

        for alert in alerts {
            if !alert.enabled {
                continue;
            }

            // Check cooldown
            let alert_id = alert
                .id
                .map(|id| id.to_hex())
                .unwrap_or_else(|| alert.name.clone());

            {
                let last_triggers = self.last_triggers.read().await;
                if let Some(last_trigger) = last_triggers.get(&alert_id) {
                    let elapsed = now.signed_duration_since(*last_trigger).num_seconds();
                    if elapsed < self.cooldown_secs {
                        continue;
                    }
                }
            }

            let (should_trigger, current_value, threshold, condition_desc) = match &alert.condition
            {
                AlertCondition::ErrorRate { threshold } => (
                    metrics.error_rate > *threshold,
                    metrics.error_rate,
                    *threshold,
                    "Error Rate".to_string(),
                ),
                AlertCondition::ErrorsPerSecond { threshold } => (
                    metrics.errors_per_second > *threshold,
                    metrics.errors_per_second,
                    *threshold,
                    "Errors/sec".to_string(),
                ),
                AlertCondition::LogsPerSecond { threshold } => (
                    metrics.logs_per_second > *threshold,
                    metrics.logs_per_second,
                    *threshold,
                    "Logs/sec".to_string(),
                ),
                AlertCondition::LevelCount { level, threshold } => {
                    let count = match level.to_uppercase().as_str() {
                        "TRACE" => metrics.logs_by_level.trace,
                        "DEBUG" => metrics.logs_by_level.debug,
                        "INFO" => metrics.logs_by_level.info,
                        "WARN" => metrics.logs_by_level.warn,
                        "ERROR" => metrics.logs_by_level.error,
                        "FATAL" => metrics.logs_by_level.fatal,
                        _ => 0,
                    };
                    (
                        count > *threshold,
                        count as f64,
                        *threshold as f64,
                        format!("{} count", level),
                    )
                }
            };

            if should_trigger {
                let condition_type_str = match &alert.condition {
                    AlertCondition::ErrorRate { .. } => "Error rate".to_string(),
                    AlertCondition::ErrorsPerSecond { .. } => "Errors/sec".to_string(),
                    AlertCondition::LogsPerSecond { .. } => "Logs/sec".to_string(),
                    AlertCondition::LevelCount { level, .. } => format!("{} count", level),
                };

                let notification = AlertNotification {
                    alert_name: alert.name.clone(),
                    condition: condition_desc,
                    current_value,
                    threshold,
                    timestamp: now,
                    message: format!(
                        "Alert '{}' triggered: {} ({:.2}) exceeded threshold ({:.2})",
                        alert.name,
                        condition_type_str,
                        current_value,
                        threshold
                    ),
                };

                // Execute action
                if let Err(e) = self.execute_action(&alert.action, &notification).await {
                    error!("Failed to execute alert action: {}", e);
                }

                // Update last trigger time
                {
                    let mut last_triggers = self.last_triggers.write().await;
                    last_triggers.insert(alert_id.clone(), now);
                }

                // Update alert in database
                if let Some(id) = &alert.id {
                    let _ = self
                        .collection
                        .update_one(
                            doc! { "_id": id },
                            doc! {
                                "$set": { "last_triggered": bson::DateTime::from_chrono(now) },
                                "$inc": { "trigger_count": 1 }
                            },
                        )
                        .await;
                }

                triggered.push(alert.name);
            }
        }

        Ok(triggered)
    }

    async fn execute_action(
        &self,
        action: &AlertAction,
        notification: &AlertNotification,
    ) -> Result<()> {
        match action {
            AlertAction::Webhook { url, method } => {
                let method = method.as_deref().unwrap_or("POST");
                info!("Sending webhook to {}: {}", url, notification.message);

                let response = match method.to_uppercase().as_str() {
                    "GET" => self.http_client.get(url).send().await?,
                    _ => self.http_client.post(url).json(notification).send().await?,
                };

                if !response.status().is_success() {
                    warn!(
                        "Webhook returned non-success status: {}",
                        response.status()
                    );
                }
            }
            AlertAction::Log => {
                warn!("ALERT: {}", notification.message);
            }
        }

        Ok(())
    }
}

/// Background task to check alerts periodically
pub async fn alert_checker_task(alert_manager: Arc<AlertManager>, interval_secs: u64) {
    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(interval_secs));

    loop {
        interval.tick().await;

        match alert_manager.check_alerts().await {
            Ok(triggered) => {
                if !triggered.is_empty() {
                    info!("Triggered alerts: {:?}", triggered);
                }
            }
            Err(e) => {
                error!("Error checking alerts: {}", e);
            }
        }
    }
}
