use bson::oid::ObjectId;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Deserializer, Serialize};
use std::collections::HashMap;

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
        // Try to deserialize from BSON DateTime first, then fall back to string
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    #[serde(with = "datetime_as_iso_string")]
    pub timestamp: DateTime<Utc>,
    pub level: LogLevel,
    pub service: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message_template: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exception: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trace_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub span_id: Option<String>,
    #[serde(default)]
    pub metadata: HashMap<String, serde_json::Value>,
    pub source_ip: String,
    #[serde(default = "Utc::now", with = "datetime_as_iso_string")]
    pub created_at: DateTime<Utc>,
}

/// Log levels supporting both standard format and Serilog format.
/// Serilog uses: Verbose, Debug, Information, Warning, Error, Fatal
/// Standard uses: TRACE, DEBUG, INFO, WARN, ERROR, FATAL
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LogLevel {
    Trace,
    Debug,
    Info,
    Warn,
    Error,
    Fatal,
}

impl serde::Serialize for LogLevel {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let s = match self {
            LogLevel::Trace => "TRACE",
            LogLevel::Debug => "DEBUG",
            LogLevel::Info => "INFO",
            LogLevel::Warn => "WARN",
            LogLevel::Error => "ERROR",
            LogLevel::Fatal => "FATAL",
        };
        serializer.serialize_str(s)
    }
}

impl<'de> Deserialize<'de> for LogLevel {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;
        match s.to_lowercase().as_str() {
            // Standard format
            "trace" => Ok(LogLevel::Trace),
            "debug" => Ok(LogLevel::Debug),
            "info" => Ok(LogLevel::Info),
            "warn" | "warning" => Ok(LogLevel::Warn),
            "error" => Ok(LogLevel::Error),
            "fatal" => Ok(LogLevel::Fatal),
            // Serilog format
            "verbose" => Ok(LogLevel::Trace),
            "information" => Ok(LogLevel::Info),
            _ => Err(serde::de::Error::custom(format!(
                "unknown log level: {}",
                s
            ))),
        }
    }
}

#[allow(dead_code)]
impl LogEntry {
    pub fn new(
        level: LogLevel,
        service: String,
        message: String,
        metadata: HashMap<String, serde_json::Value>,
        source_ip: String,
    ) -> Self {
        let now = Utc::now();
        Self {
            id: None,
            timestamp: now,
            level,
            service,
            message,
            message_template: None,
            exception: None,
            event_id: None,
            trace_id: None,
            span_id: None,
            metadata,
            source_ip,
            created_at: now,
        }
    }
}

/// Standard incoming log format
#[derive(Debug, Deserialize)]
pub struct IncomingLog {
    #[serde(default = "Utc::now")]
    pub timestamp: DateTime<Utc>,
    pub level: LogLevel,
    pub service: String,
    pub message: String,
    #[serde(default)]
    pub message_template: Option<String>,
    #[serde(default)]
    pub exception: Option<String>,
    #[serde(default)]
    pub metadata: HashMap<String, serde_json::Value>,
}

/// Serilog Compact Log Event Format (CLEF)
/// See: https://clef-json.org/
#[derive(Debug, Deserialize)]
pub struct SerilogLog {
    /// Timestamp in ISO 8601 format
    #[serde(rename = "@t")]
    pub timestamp: DateTime<Utc>,
    /// Rendered message
    #[serde(rename = "@m", default)]
    pub message: Option<String>,
    /// Message template (with placeholders like {PropertyName})
    #[serde(rename = "@mt", default)]
    pub message_template: Option<String>,
    /// Log level (Verbose, Debug, Information, Warning, Error, Fatal)
    #[serde(rename = "@l", default = "default_serilog_level")]
    pub level: LogLevel,
    /// Exception details
    #[serde(rename = "@x", default)]
    pub exception: Option<String>,
    /// Event ID (numeric hash of message template)
    #[serde(rename = "@i", default)]
    pub event_id: Option<String>,
    /// Trace ID for distributed tracing
    #[serde(rename = "@tr", default)]
    pub trace_id: Option<String>,
    /// Span ID for distributed tracing
    #[serde(rename = "@sp", default)]
    pub span_id: Option<String>,
    /// Source context (typically the class/logger name) - used as service name
    #[serde(rename = "SourceContext", default)]
    pub source_context: Option<String>,
    /// Application name - alternative service identifier
    #[serde(rename = "Application", default)]
    pub application: Option<String>,
    /// All other properties become metadata
    #[serde(flatten)]
    pub properties: HashMap<String, serde_json::Value>,
}

fn default_serilog_level() -> LogLevel {
    LogLevel::Info
}

impl SerilogLog {
    /// Convert to internal LogEntry format
    pub fn into_log_entry(self, source_ip: String) -> LogEntry {
        // Determine the service name from SourceContext, Application, or default
        let service = self
            .source_context
            .or(self.application)
            .unwrap_or_else(|| "unknown".to_string());

        // Use rendered message, or fall back to message template
        let message = self
            .message
            .or_else(|| self.message_template.clone())
            .unwrap_or_default();

        // Filter out Serilog internal properties from metadata
        let metadata: HashMap<String, serde_json::Value> = self
            .properties
            .into_iter()
            .filter(|(k, _)| !k.starts_with('@') && k != "SourceContext" && k != "Application")
            .collect();

        LogEntry {
            id: None,
            timestamp: self.timestamp,
            level: self.level,
            service,
            message,
            message_template: self.message_template,
            exception: self.exception,
            event_id: self.event_id,
            trace_id: self.trace_id,
            span_id: self.span_id,
            metadata,
            source_ip,
            created_at: Utc::now(),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct LogStats {
    pub total_count: u64,
    pub counts_by_level: HashMap<String, u64>,
    pub counts_by_service: HashMap<String, u64>,
}
