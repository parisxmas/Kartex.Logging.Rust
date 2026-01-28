use chrono::{DateTime, TimeZone, Utc};
use opentelemetry_proto::tonic::common::v1::{any_value, AnyValue, KeyValue};
use opentelemetry_proto::tonic::trace::v1::{
    span::Event as OtlpEvent, span::Link as OtlpLink, ResourceSpans, Span as OtlpSpan,
    Status as OtlpStatus,
};
use opentelemetry_proto::tonic::logs::v1::{ResourceLogs, LogRecord as OtlpLogRecord, SeverityNumber};
use std::collections::HashMap;

use super::models::{Span, SpanEvent, SpanKind, SpanLink, SpanStatus, SpanStatusCode};
use crate::db::models::{LogEntry, LogLevel};

/// Convert hex bytes to hex string
pub fn bytes_to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

/// Convert nanoseconds timestamp to DateTime<Utc>
pub fn nanos_to_datetime(nanos: u64) -> DateTime<Utc> {
    let secs = (nanos / 1_000_000_000) as i64;
    let nsecs = (nanos % 1_000_000_000) as u32;
    match Utc.timestamp_opt(secs, nsecs) {
        chrono::LocalResult::Single(dt) => dt,
        _ => Utc::now(),
    }
}

/// Convert AnyValue to serde_json::Value
pub fn any_value_to_json(value: &AnyValue) -> serde_json::Value {
    match &value.value {
        Some(any_value::Value::StringValue(s)) => serde_json::Value::String(s.clone()),
        Some(any_value::Value::BoolValue(b)) => serde_json::Value::Bool(*b),
        Some(any_value::Value::IntValue(i)) => serde_json::json!(*i),
        Some(any_value::Value::DoubleValue(d)) => serde_json::json!(*d),
        Some(any_value::Value::ArrayValue(arr)) => {
            let values: Vec<serde_json::Value> = arr
                .values
                .iter()
                .map(any_value_to_json)
                .collect();
            serde_json::Value::Array(values)
        }
        Some(any_value::Value::KvlistValue(kvlist)) => {
            let mut map = serde_json::Map::new();
            for kv in &kvlist.values {
                if let Some(v) = &kv.value {
                    map.insert(kv.key.clone(), any_value_to_json(v));
                }
            }
            serde_json::Value::Object(map)
        }
        Some(any_value::Value::BytesValue(bytes)) => {
            serde_json::Value::String(bytes_to_hex(bytes))
        }
        None => serde_json::Value::Null,
    }
}

/// Convert KeyValue slice to HashMap
pub fn key_values_to_map(kvs: &[KeyValue]) -> HashMap<String, serde_json::Value> {
    kvs.iter()
        .filter_map(|kv| {
            kv.value.as_ref().map(|v| (kv.key.clone(), any_value_to_json(v)))
        })
        .collect()
}

/// Extract service name from resource attributes
pub fn extract_service_name(resource_attrs: &HashMap<String, serde_json::Value>) -> String {
    resource_attrs
        .get("service.name")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| "unknown".to_string())
}

/// Convert OTLP Event to internal SpanEvent
fn convert_event(event: &OtlpEvent) -> SpanEvent {
    SpanEvent {
        name: event.name.clone(),
        timestamp: nanos_to_datetime(event.time_unix_nano),
        time_unix_nano: event.time_unix_nano,
        attributes: key_values_to_map(&event.attributes),
    }
}

/// Convert OTLP Link to internal SpanLink
fn convert_link(link: &OtlpLink) -> SpanLink {
    SpanLink {
        trace_id: bytes_to_hex(&link.trace_id),
        span_id: bytes_to_hex(&link.span_id),
        trace_state: if link.trace_state.is_empty() {
            None
        } else {
            Some(link.trace_state.clone())
        },
        attributes: key_values_to_map(&link.attributes),
    }
}

/// Convert OTLP Status to internal SpanStatus
fn convert_status(status: Option<&OtlpStatus>) -> SpanStatus {
    match status {
        Some(s) => SpanStatus {
            code: SpanStatusCode::from(s.code),
            message: if s.message.is_empty() {
                None
            } else {
                Some(s.message.clone())
            },
        },
        None => SpanStatus::default(),
    }
}

/// Convert a single OTLP span to internal Span
pub fn convert_span(
    otlp_span: &OtlpSpan,
    service: &str,
    resource_attributes: HashMap<String, serde_json::Value>,
    scope_name: Option<String>,
    scope_version: Option<String>,
    source_ip: &str,
) -> Span {
    let trace_id = bytes_to_hex(&otlp_span.trace_id);
    let span_id = bytes_to_hex(&otlp_span.span_id);
    let parent_span_id = if otlp_span.parent_span_id.is_empty() {
        None
    } else {
        Some(bytes_to_hex(&otlp_span.parent_span_id))
    };

    let start_time = nanos_to_datetime(otlp_span.start_time_unix_nano);
    let end_time = nanos_to_datetime(otlp_span.end_time_unix_nano);
    let duration_ms =
        (otlp_span.end_time_unix_nano - otlp_span.start_time_unix_nano) as f64 / 1_000_000.0;

    Span {
        id: None,
        trace_id,
        span_id,
        parent_span_id,
        trace_state: if otlp_span.trace_state.is_empty() {
            None
        } else {
            Some(otlp_span.trace_state.clone())
        },
        name: otlp_span.name.clone(),
        service: service.to_string(),
        kind: SpanKind::from(otlp_span.kind),
        start_time,
        end_time,
        start_time_unix_nano: otlp_span.start_time_unix_nano,
        end_time_unix_nano: otlp_span.end_time_unix_nano,
        duration_ms,
        status: convert_status(otlp_span.status.as_ref()),
        attributes: key_values_to_map(&otlp_span.attributes),
        events: otlp_span.events.iter().map(convert_event).collect(),
        links: otlp_span.links.iter().map(convert_link).collect(),
        resource_attributes,
        scope_name,
        scope_version,
        source_ip: source_ip.to_string(),
        created_at: Utc::now(),
    }
}

/// Convert ResourceSpans to a vector of internal Spans
pub fn convert_resource_spans(resource_spans: &[ResourceSpans], source_ip: &str) -> Vec<Span> {
    let mut spans = Vec::new();

    for rs in resource_spans {
        let resource_attributes = rs
            .resource
            .as_ref()
            .map(|r| key_values_to_map(&r.attributes))
            .unwrap_or_default();

        let service = extract_service_name(&resource_attributes);

        for scope_spans in &rs.scope_spans {
            let scope_name = scope_spans.scope.as_ref().map(|s| s.name.clone());
            let scope_version = scope_spans
                .scope
                .as_ref()
                .and_then(|s| {
                    if s.version.is_empty() {
                        None
                    } else {
                        Some(s.version.clone())
                    }
                });

            for otlp_span in &scope_spans.spans {
                spans.push(convert_span(
                    otlp_span,
                    &service,
                    resource_attributes.clone(),
                    scope_name.clone(),
                    scope_version.clone(),
                    source_ip,
                ));
            }
        }
    }

    spans
}

/// Convert OTLP SeverityNumber to internal LogLevel
fn severity_to_log_level(severity: SeverityNumber) -> LogLevel {
    match severity {
        SeverityNumber::Trace | SeverityNumber::Trace2 | SeverityNumber::Trace3 | SeverityNumber::Trace4 => LogLevel::Trace,
        SeverityNumber::Debug | SeverityNumber::Debug2 | SeverityNumber::Debug3 | SeverityNumber::Debug4 => LogLevel::Debug,
        SeverityNumber::Info | SeverityNumber::Info2 | SeverityNumber::Info3 | SeverityNumber::Info4 => LogLevel::Info,
        SeverityNumber::Warn | SeverityNumber::Warn2 | SeverityNumber::Warn3 | SeverityNumber::Warn4 => LogLevel::Warn,
        SeverityNumber::Error | SeverityNumber::Error2 | SeverityNumber::Error3 | SeverityNumber::Error4 => LogLevel::Error,
        SeverityNumber::Fatal | SeverityNumber::Fatal2 | SeverityNumber::Fatal3 | SeverityNumber::Fatal4 => LogLevel::Fatal,
        SeverityNumber::Unspecified => LogLevel::Info,
    }
}

/// Convert a single OTLP log record to internal LogEntry
pub fn convert_log_record(
    record: &OtlpLogRecord,
    service: &str,
    resource_attributes: &HashMap<String, serde_json::Value>,
    source_ip: &str,
) -> LogEntry {
    let timestamp = if record.time_unix_nano > 0 {
        nanos_to_datetime(record.time_unix_nano)
    } else if record.observed_time_unix_nano > 0 {
        nanos_to_datetime(record.observed_time_unix_nano)
    } else {
        Utc::now()
    };

    let level = severity_to_log_level(record.severity_number());

    let message = record.body.as_ref()
        .map(|v| match &v.value {
            Some(any_value::Value::StringValue(s)) => s.clone(),
            Some(v) => format!("{:?}", v),
            None => String::new(),
        })
        .unwrap_or_default();

    let trace_id = if record.trace_id.is_empty() {
        None
    } else {
        Some(bytes_to_hex(&record.trace_id))
    };

    let span_id = if record.span_id.is_empty() {
        None
    } else {
        Some(bytes_to_hex(&record.span_id))
    };

    let mut metadata = key_values_to_map(&record.attributes);

    // Add resource attributes to metadata with "resource." prefix
    for (k, v) in resource_attributes {
        if k != "service.name" {
            metadata.insert(format!("resource.{}", k), v.clone());
        }
    }

    LogEntry {
        id: None,
        timestamp,
        level,
        service: service.to_string(),
        message,
        message_template: None,
        exception: None,
        event_id: None,
        trace_id,
        span_id,
        metadata,
        source_ip: source_ip.to_string(),
        created_at: Utc::now(),
    }
}

/// Convert ResourceLogs to a vector of internal LogEntries
pub fn convert_resource_logs(resource_logs: &[ResourceLogs], source_ip: &str) -> Vec<LogEntry> {
    let mut logs = Vec::new();

    for rl in resource_logs {
        let resource_attributes = rl
            .resource
            .as_ref()
            .map(|r| key_values_to_map(&r.attributes))
            .unwrap_or_default();

        let service = extract_service_name(&resource_attributes);

        for scope_logs in &rl.scope_logs {
            for log_record in &scope_logs.log_records {
                logs.push(convert_log_record(
                    log_record,
                    &service,
                    &resource_attributes,
                    source_ip,
                ));
            }
        }
    }

    logs
}
