use anyhow::Result;
use bson::{doc, oid::ObjectId, Document};
use chrono::{DateTime, Utc};
use futures::stream::TryStreamExt;
use mongodb::options::FindOptions;
use mongodb::Collection;
use serde::{Deserialize, Serialize};

/// Custom serialization module for DateTime that:
/// - Deserializes from BSON DateTime (for MongoDB reads)
/// - Serializes to ISO 8601 string (for JSON API responses)
mod datetime_as_iso_string {
    use chrono::{DateTime, Utc};
    use serde::{self, Deserialize, Deserializer, Serializer};

    pub fn serialize<S>(date: &DateTime<Utc>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&date.to_rfc3339())
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<DateTime<Utc>, D::Error>
    where
        D: Deserializer<'de>,
    {
        use serde::de::Error;

        #[derive(Deserialize)]
        #[serde(untagged)]
        enum DateTimeFormat {
            BsonDateTime(bson::DateTime),
            IsoString(String),
        }

        match DateTimeFormat::deserialize(deserializer)? {
            DateTimeFormat::BsonDateTime(dt) => Ok(dt.to_chrono()),
            DateTimeFormat::IsoString(s) => DateTime::parse_from_rfc3339(&s)
                .map(|dt| dt.with_timezone(&Utc))
                .or_else(|_| s.parse::<DateTime<Utc>>())
                .map_err(|e| D::Error::custom(format!("Invalid datetime: {}", e))),
        }
    }
}

/// Widget layout position and size for react-grid-layout
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LayoutItem {
    /// Widget ID (matches Widget.id)
    pub i: String,
    /// X position in grid units
    pub x: i32,
    /// Y position in grid units
    pub y: i32,
    /// Width in grid units
    pub w: i32,
    /// Height in grid units
    pub h: i32,
    /// Minimum width (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_w: Option<i32>,
    /// Minimum height (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_h: Option<i32>,
}

/// Widget types for dashboard visualization
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum WidgetType {
    LogCount,
    ErrorRateChart,
    RecentLogs,
    TraceLatencyHistogram,
    ServiceHealth,
    CustomMetric,
}

/// Configuration options for widgets
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WidgetConfig {
    LogCount {
        #[serde(skip_serializing_if = "Option::is_none")]
        level: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        service: Option<String>,
        /// Time range in seconds (e.g., 3600 for 1 hour)
        #[serde(default = "default_time_range")]
        time_range: u32,
    },
    ErrorRateChart {
        /// Time range in seconds (e.g., 86400 for 24 hours)
        #[serde(default = "default_chart_time_range")]
        time_range: u32,
        /// Bucket size in seconds for grouping (e.g., 3600 for 1 hour buckets)
        #[serde(default = "default_bucket_size")]
        bucket_size: u32,
        #[serde(skip_serializing_if = "Option::is_none")]
        service: Option<String>,
    },
    RecentLogs {
        #[serde(default = "default_log_limit")]
        limit: u32,
        #[serde(skip_serializing_if = "Option::is_none")]
        level: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        service: Option<String>,
    },
    TraceLatencyHistogram {
        /// Time range in seconds
        #[serde(default = "default_chart_time_range")]
        time_range: u32,
        #[serde(skip_serializing_if = "Option::is_none")]
        service: Option<String>,
        /// Number of histogram buckets
        #[serde(default = "default_histogram_buckets")]
        buckets: u32,
    },
    ServiceHealth {
        /// Time window to check health (in seconds)
        #[serde(default = "default_health_window")]
        time_window: u32,
        /// Error rate threshold (0.0-1.0) above which service is unhealthy
        #[serde(default = "default_error_threshold")]
        error_threshold: f64,
    },
    CustomMetric {
        /// Metric type to display
        metric_type: CustomMetricType,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum CustomMetricType {
    LogsPerSecond,
    ErrorsPerSecond,
    ErrorRate,
    LogsLastMinute,
    TotalLogs,
}

fn default_time_range() -> u32 {
    3600 // 1 hour
}

fn default_chart_time_range() -> u32 {
    86400 // 24 hours
}

fn default_bucket_size() -> u32 {
    3600 // 1 hour buckets
}

fn default_log_limit() -> u32 {
    10
}

fn default_histogram_buckets() -> u32 {
    10
}

fn default_health_window() -> u32 {
    300 // 5 minutes
}

fn default_error_threshold() -> f64 {
    0.05 // 5%
}

/// A dashboard widget
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Widget {
    /// Unique identifier for the widget
    pub id: String,
    /// Type of widget
    pub widget_type: WidgetType,
    /// Display title
    pub title: String,
    /// Widget-specific configuration
    pub config: WidgetConfig,
    /// Auto-refresh interval in seconds (0 = no auto-refresh)
    #[serde(default)]
    pub refresh_interval: u32,
}

/// A user dashboard containing widgets
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Dashboard {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    /// User who owns this dashboard
    pub user_id: String,
    /// Dashboard name
    pub name: String,
    /// Whether this is the user's default dashboard
    #[serde(default)]
    pub is_default: bool,
    /// Layout positions for all widgets
    pub layout: Vec<LayoutItem>,
    /// Widget configurations
    pub widgets: Vec<Widget>,
    #[serde(with = "datetime_as_iso_string")]
    pub created_at: DateTime<Utc>,
    #[serde(with = "datetime_as_iso_string")]
    pub updated_at: DateTime<Utc>,
}

impl Dashboard {
    /// Create a new dashboard with the given name for a user
    pub fn new(user_id: String, name: String) -> Self {
        let now = Utc::now();
        Self {
            id: None,
            user_id,
            name,
            is_default: false,
            layout: Vec::new(),
            widgets: Vec::new(),
            created_at: now,
            updated_at: now,
        }
    }

    /// Create a default "Overview" dashboard template for new users
    pub fn default_template(user_id: String) -> Self {
        let now = Utc::now();

        let widgets = vec![
            Widget {
                id: "widget-1".to_string(),
                widget_type: WidgetType::LogCount,
                title: "Total Logs".to_string(),
                config: WidgetConfig::LogCount {
                    level: None,
                    service: None,
                    time_range: 86400,
                },
                refresh_interval: 30,
            },
            Widget {
                id: "widget-2".to_string(),
                widget_type: WidgetType::LogCount,
                title: "Errors (24h)".to_string(),
                config: WidgetConfig::LogCount {
                    level: Some("ERROR".to_string()),
                    service: None,
                    time_range: 86400,
                },
                refresh_interval: 30,
            },
            Widget {
                id: "widget-3".to_string(),
                widget_type: WidgetType::ErrorRateChart,
                title: "Error Rate (24h)".to_string(),
                config: WidgetConfig::ErrorRateChart {
                    time_range: 86400,
                    bucket_size: 3600,
                    service: None,
                },
                refresh_interval: 60,
            },
            Widget {
                id: "widget-4".to_string(),
                widget_type: WidgetType::ServiceHealth,
                title: "Service Health".to_string(),
                config: WidgetConfig::ServiceHealth {
                    time_window: 300,
                    error_threshold: 0.05,
                },
                refresh_interval: 30,
            },
            Widget {
                id: "widget-5".to_string(),
                widget_type: WidgetType::RecentLogs,
                title: "Recent Logs".to_string(),
                config: WidgetConfig::RecentLogs {
                    limit: 10,
                    level: None,
                    service: None,
                },
                refresh_interval: 10,
            },
        ];

        let layout = vec![
            LayoutItem { i: "widget-1".to_string(), x: 0, y: 0, w: 3, h: 2, min_w: Some(2), min_h: Some(2) },
            LayoutItem { i: "widget-2".to_string(), x: 3, y: 0, w: 3, h: 2, min_w: Some(2), min_h: Some(2) },
            LayoutItem { i: "widget-3".to_string(), x: 6, y: 0, w: 6, h: 4, min_w: Some(4), min_h: Some(3) },
            LayoutItem { i: "widget-4".to_string(), x: 0, y: 2, w: 6, h: 3, min_w: Some(3), min_h: Some(2) },
            LayoutItem { i: "widget-5".to_string(), x: 0, y: 5, w: 12, h: 4, min_w: Some(6), min_h: Some(3) },
        ];

        Self {
            id: None,
            user_id,
            name: "Overview".to_string(),
            is_default: true,
            layout,
            widgets,
            created_at: now,
            updated_at: now,
        }
    }
}

/// Request to fetch data for multiple widgets at once
#[derive(Debug, Deserialize)]
pub struct WidgetDataRequest {
    pub widgets: Vec<WidgetDataQuery>,
}

#[derive(Debug, Deserialize)]
pub struct WidgetDataQuery {
    pub widget_id: String,
    pub widget_type: WidgetType,
    pub config: WidgetConfig,
}

/// Response containing data for multiple widgets
#[derive(Debug, Serialize)]
pub struct WidgetDataResponse {
    pub data: Vec<WidgetData>,
}

#[derive(Debug, Serialize)]
pub struct WidgetData {
    pub widget_id: String,
    pub data: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Repository for dashboard CRUD operations
pub struct DashboardRepository {
    collection: Collection<Document>,
}

impl DashboardRepository {
    pub fn new(collection: Collection<Document>) -> Self {
        Self { collection }
    }

    /// Create a new dashboard
    pub async fn create(&self, dashboard: Dashboard) -> Result<String> {
        let doc = self.dashboard_to_document(&dashboard)?;
        let result = self.collection.insert_one(doc).await?;
        Ok(result.inserted_id.as_object_id().unwrap().to_hex())
    }

    /// Get all dashboards for a user
    pub async fn get_by_user(&self, user_id: &str) -> Result<Vec<Dashboard>> {
        let filter = doc! { "user_id": user_id };
        let options = FindOptions::builder()
            .sort(doc! { "is_default": -1, "updated_at": -1 })
            .build();

        let cursor = self.collection.find(filter).with_options(options).await?;
        let docs: Vec<Document> = cursor.try_collect().await?;

        let dashboards: Vec<Dashboard> = docs
            .into_iter()
            .filter_map(|doc| bson::from_document(doc).ok())
            .collect();

        Ok(dashboards)
    }

    /// Get a dashboard by ID
    pub async fn get_by_id(&self, id: &str) -> Result<Option<Dashboard>> {
        let object_id = ObjectId::parse_str(id)?;
        let doc = self.collection.find_one(doc! { "_id": object_id }).await?;
        Ok(doc.and_then(|d| bson::from_document(d).ok()))
    }

    /// Get a dashboard by ID, ensuring it belongs to the user
    pub async fn get_by_id_and_user(&self, id: &str, user_id: &str) -> Result<Option<Dashboard>> {
        let object_id = ObjectId::parse_str(id)?;
        let filter = doc! { "_id": object_id, "user_id": user_id };
        let doc = self.collection.find_one(filter).await?;
        Ok(doc.and_then(|d| bson::from_document(d).ok()))
    }

    /// Update a dashboard
    pub async fn update(&self, id: &str, user_id: &str, dashboard: Dashboard) -> Result<bool> {
        let object_id = ObjectId::parse_str(id)?;
        let filter = doc! { "_id": object_id, "user_id": user_id };

        let mut doc = self.dashboard_to_document(&dashboard)?;
        doc.remove("_id"); // Don't update the ID
        doc.remove("created_at"); // Don't update created_at
        doc.insert("updated_at", bson::DateTime::from_chrono(Utc::now()));

        let update = doc! { "$set": doc };
        let result = self.collection.update_one(filter, update).await?;
        Ok(result.modified_count > 0)
    }

    /// Delete a dashboard
    pub async fn delete(&self, id: &str, user_id: &str) -> Result<bool> {
        let object_id = ObjectId::parse_str(id)?;
        let filter = doc! { "_id": object_id, "user_id": user_id };
        let result = self.collection.delete_one(filter).await?;
        Ok(result.deleted_count > 0)
    }

    /// Get or create default dashboard for a user
    pub async fn get_or_create_default(&self, user_id: &str) -> Result<Dashboard> {
        // Check if user has any dashboards
        let dashboards = self.get_by_user(user_id).await?;

        if let Some(default) = dashboards.into_iter().find(|d| d.is_default) {
            return Ok(default);
        }

        // Create default dashboard
        let default = Dashboard::default_template(user_id.to_string());
        let id = self.create(default.clone()).await?;

        // Return with ID set
        let mut dashboard = default;
        dashboard.id = Some(ObjectId::parse_str(&id)?);
        Ok(dashboard)
    }

    /// Ensure only one default dashboard per user
    pub async fn set_as_default(&self, id: &str, user_id: &str) -> Result<bool> {
        // First, unset all other defaults for this user
        let filter = doc! { "user_id": user_id, "is_default": true };
        let update = doc! { "$set": { "is_default": false } };
        self.collection.update_many(filter, update).await?;

        // Set the specified dashboard as default
        let object_id = ObjectId::parse_str(id)?;
        let filter = doc! { "_id": object_id, "user_id": user_id };
        let update = doc! { "$set": { "is_default": true } };
        let result = self.collection.update_one(filter, update).await?;
        Ok(result.modified_count > 0)
    }

    fn dashboard_to_document(&self, dashboard: &Dashboard) -> Result<Document> {
        let mut doc = doc! {
            "user_id": &dashboard.user_id,
            "name": &dashboard.name,
            "is_default": dashboard.is_default,
            "layout": bson::to_bson(&dashboard.layout)?,
            "widgets": bson::to_bson(&dashboard.widgets)?,
            "created_at": bson::DateTime::from_chrono(dashboard.created_at),
            "updated_at": bson::DateTime::from_chrono(dashboard.updated_at),
        };

        if let Some(id) = &dashboard.id {
            doc.insert("_id", id);
        }

        Ok(doc)
    }
}
