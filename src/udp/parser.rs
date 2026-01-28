use crate::db::models::{IncomingLog, LogEntry, LogLevel, SerilogLog};
use std::collections::HashMap;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ParseError {
    #[error("Invalid JSON payload: {0}")]
    InvalidJson(#[from] serde_json::Error),
    #[error("Empty payload")]
    EmptyPayload,
}

/// Detects if the payload is in Serilog CLEF format by checking for @t field
fn is_serilog_format(payload: &[u8]) -> bool {
    // Quick check for "@t" which is required in CLEF format
    payload.windows(4).any(|w| w == b"\"@t\"")
}

/// Parse a log payload, automatically detecting Serilog CLEF or standard format
pub fn parse_log_payload(payload: &[u8], source_ip: String) -> Result<LogEntry, ParseError> {
    if payload.is_empty() {
        return Err(ParseError::EmptyPayload);
    }

    if is_serilog_format(payload) {
        parse_serilog_payload(payload, source_ip)
    } else {
        parse_standard_payload(payload, source_ip)
    }
}

/// Parse Serilog Compact Log Event Format (CLEF)
fn parse_serilog_payload(payload: &[u8], source_ip: String) -> Result<LogEntry, ParseError> {
    let serilog: SerilogLog = serde_json::from_slice(payload)?;
    Ok(serilog.into_log_entry(source_ip))
}

/// Parse standard log format
fn parse_standard_payload(payload: &[u8], source_ip: String) -> Result<LogEntry, ParseError> {
    let incoming: IncomingLog = serde_json::from_slice(payload)?;

    Ok(LogEntry {
        id: None,
        timestamp: incoming.timestamp,
        level: incoming.level,
        service: incoming.service,
        message: incoming.message,
        message_template: incoming.message_template,
        exception: incoming.exception,
        event_id: None,
        trace_id: None,
        span_id: None,
        metadata: incoming.metadata,
        source_ip,
        created_at: chrono::Utc::now(),
    })
}

/// Creates a sample log entry for testing
pub fn create_sample_log() -> LogEntry {
    let mut metadata = HashMap::new();
    metadata.insert("test".to_string(), serde_json::json!(true));

    LogEntry {
        id: None,
        timestamp: chrono::Utc::now(),
        level: LogLevel::Info,
        service: "test-service".to_string(),
        message: "Test log message".to_string(),
        message_template: None,
        exception: None,
        event_id: None,
        trace_id: None,
        span_id: None,
        metadata,
        source_ip: "127.0.0.1".to_string(),
        created_at: chrono::Utc::now(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_serilog_format() {
        let serilog_payload = r#"{
            "@t": "2024-01-15T10:30:00Z",
            "@m": "User logged in successfully",
            "@mt": "User {Username} logged in successfully",
            "@l": "Information",
            "@i": "12345678",
            "@tr": "abc123",
            "@sp": "def456",
            "SourceContext": "MyApp.AuthService",
            "Username": "john.doe",
            "RequestId": "req-123"
        }"#;

        let result = parse_log_payload(serilog_payload.as_bytes(), "192.168.1.1".to_string());
        assert!(result.is_ok());

        let entry = result.unwrap();
        assert_eq!(entry.level, LogLevel::Info);
        assert_eq!(entry.service, "MyApp.AuthService");
        assert_eq!(entry.message, "User logged in successfully");
        assert_eq!(
            entry.message_template,
            Some("User {Username} logged in successfully".to_string())
        );
        assert_eq!(entry.event_id, Some("12345678".to_string()));
        assert_eq!(entry.trace_id, Some("abc123".to_string()));
        assert_eq!(entry.span_id, Some("def456".to_string()));
        assert!(entry.metadata.contains_key("Username"));
        assert!(entry.metadata.contains_key("RequestId"));
    }

    #[test]
    fn test_parse_serilog_with_exception() {
        let serilog_payload = r#"{
            "@t": "2024-01-15T10:30:00Z",
            "@m": "An error occurred",
            "@l": "Error",
            "@x": "System.NullReferenceException: Object reference not set\n   at MyApp.Service.DoWork()",
            "SourceContext": "MyApp.ErrorHandler"
        }"#;

        let result = parse_log_payload(serilog_payload.as_bytes(), "10.0.0.1".to_string());
        assert!(result.is_ok());

        let entry = result.unwrap();
        assert_eq!(entry.level, LogLevel::Error);
        assert!(entry.exception.is_some());
        assert!(entry.exception.unwrap().contains("NullReferenceException"));
    }

    #[test]
    fn test_parse_serilog_verbose_level() {
        let serilog_payload = r#"{
            "@t": "2024-01-15T10:30:00Z",
            "@m": "Verbose trace message",
            "@l": "Verbose",
            "SourceContext": "MyApp.Diagnostics"
        }"#;

        let result = parse_log_payload(serilog_payload.as_bytes(), "127.0.0.1".to_string());
        assert!(result.is_ok());

        let entry = result.unwrap();
        assert_eq!(entry.level, LogLevel::Trace); // Verbose maps to Trace
    }

    #[test]
    fn test_parse_standard_format() {
        let standard_payload = r#"{
            "timestamp": "2024-01-15T10:30:00Z",
            "level": "INFO",
            "service": "my-service",
            "message": "Standard log message",
            "metadata": {"key": "value"}
        }"#;

        let result = parse_log_payload(standard_payload.as_bytes(), "192.168.1.1".to_string());
        assert!(result.is_ok());

        let entry = result.unwrap();
        assert_eq!(entry.level, LogLevel::Info);
        assert_eq!(entry.service, "my-service");
        assert_eq!(entry.message, "Standard log message");
    }

    #[test]
    fn test_detect_serilog_format() {
        let serilog = r#"{"@t": "2024-01-15T10:30:00Z", "@m": "test"}"#;
        let standard = r#"{"timestamp": "2024-01-15T10:30:00Z", "level": "INFO"}"#;

        assert!(is_serilog_format(serilog.as_bytes()));
        assert!(!is_serilog_format(standard.as_bytes()));
    }
}
