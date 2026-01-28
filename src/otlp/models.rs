use bson::oid::ObjectId;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Span kind represents the type of span
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SpanKind {
    Unspecified,
    Internal,
    Server,
    Client,
    Producer,
    Consumer,
}

impl Default for SpanKind {
    fn default() -> Self {
        Self::Unspecified
    }
}

impl From<i32> for SpanKind {
    fn from(value: i32) -> Self {
        match value {
            1 => SpanKind::Internal,
            2 => SpanKind::Server,
            3 => SpanKind::Client,
            4 => SpanKind::Producer,
            5 => SpanKind::Consumer,
            _ => SpanKind::Unspecified,
        }
    }
}

/// Status code for a span
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SpanStatusCode {
    Unset,
    Ok,
    Error,
}

impl Default for SpanStatusCode {
    fn default() -> Self {
        Self::Unset
    }
}

impl From<i32> for SpanStatusCode {
    fn from(value: i32) -> Self {
        match value {
            1 => SpanStatusCode::Ok,
            2 => SpanStatusCode::Error,
            _ => SpanStatusCode::Unset,
        }
    }
}

/// Status of a span
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpanStatus {
    pub code: SpanStatusCode,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

impl Default for SpanStatus {
    fn default() -> Self {
        Self {
            code: SpanStatusCode::Unset,
            message: None,
        }
    }
}

/// An event that occurred during a span
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpanEvent {
    pub name: String,
    pub timestamp: DateTime<Utc>,
    pub time_unix_nano: u64,
    #[serde(default)]
    pub attributes: HashMap<String, serde_json::Value>,
}

/// A link to another span
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpanLink {
    pub trace_id: String,
    pub span_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trace_state: Option<String>,
    #[serde(default)]
    pub attributes: HashMap<String, serde_json::Value>,
}

/// A span represents a unit of work within a trace
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Span {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub trace_id: String,
    pub span_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_span_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trace_state: Option<String>,
    pub name: String,
    pub service: String,
    pub kind: SpanKind,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub start_time_unix_nano: u64,
    pub end_time_unix_nano: u64,
    pub duration_ms: f64,
    pub status: SpanStatus,
    #[serde(default)]
    pub attributes: HashMap<String, serde_json::Value>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub events: Vec<SpanEvent>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub links: Vec<SpanLink>,
    #[serde(default)]
    pub resource_attributes: HashMap<String, serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scope_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scope_version: Option<String>,
    pub source_ip: String,
    pub created_at: DateTime<Utc>,
}

impl Span {
    pub fn is_root(&self) -> bool {
        self.parent_span_id.is_none()
    }
}

/// A summary of a trace for listing purposes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TraceSummary {
    pub trace_id: String,
    pub root_span_name: String,
    pub service: String,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub duration_ms: f64,
    pub span_count: i64,
    pub error_count: i64,
    pub status: SpanStatusCode,
}

/// A full trace with all spans and correlated logs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TraceDetail {
    pub trace_id: String,
    pub spans: Vec<Span>,
    pub logs: Vec<crate::db::models::LogEntry>,
}

/// Query parameters for traces
#[derive(Debug, Clone, Deserialize)]
pub struct TraceQueryParams {
    pub service: Option<String>,
    pub start_time: Option<DateTime<Utc>>,
    pub end_time: Option<DateTime<Utc>>,
    pub min_duration_ms: Option<f64>,
    pub max_duration_ms: Option<f64>,
    pub status: Option<String>,
    #[serde(default = "default_trace_limit")]
    pub limit: i64,
    #[serde(default)]
    pub skip: u64,
}

fn default_trace_limit() -> i64 {
    50
}
