use chrono::{DateTime, Utc};
use mongodb::bson::oid::ObjectId;
use serde::{Deserialize, Serialize};

/// Notification channel stored in database
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotificationChannel {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub name: String,
    pub channel_type: ChannelType,
    pub config: ChannelConfig,
    pub enabled: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Type of notification channel
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ChannelType {
    Slack,
    Discord,
    PagerDuty,
    Email,
    Webhook,
}

/// Configuration for each channel type
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum ChannelConfig {
    Slack {
        webhook_url: String,
        channel: Option<String>,
        username: Option<String>,
        icon_emoji: Option<String>,
    },
    Discord {
        webhook_url: String,
        username: Option<String>,
        avatar_url: Option<String>,
    },
    #[serde(rename = "pagerduty")]
    PagerDuty {
        routing_key: String,
        severity: Option<String>, // critical, error, warning, info
    },
    Email {
        smtp_host: String,
        smtp_port: u16,
        smtp_username: Option<String>,
        smtp_password: Option<String>,
        from_address: String,
        to_addresses: Vec<String>,
        use_tls: bool,
    },
    Webhook {
        url: String,
        method: Option<String>,
        headers: Option<std::collections::HashMap<String, String>>,
    },
}

impl NotificationChannel {
    pub fn new(name: String, channel_type: ChannelType, config: ChannelConfig) -> Self {
        let now = Utc::now();
        Self {
            id: None,
            name,
            channel_type,
            config,
            enabled: true,
            created_at: now,
            updated_at: now,
        }
    }
}
