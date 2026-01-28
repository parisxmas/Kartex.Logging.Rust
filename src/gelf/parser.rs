use anyhow::{anyhow, Result};
use chrono::{DateTime, TimeZone, Utc};
use serde::Deserialize;
use std::collections::HashMap;
use std::io::Read;

use crate::db::models::{LogEntry, LogLevel};

/// GELF magic bytes for chunked messages
const GELF_MAGIC: [u8; 2] = [0x1e, 0x0f];

/// Maximum size of a single GELF message (8KB for UDP)
const MAX_CHUNK_SIZE: usize = 8192;

/// GELF message structure
#[derive(Debug, Deserialize)]
pub struct GelfMessage {
    /// GELF version (required, should be "1.1")
    pub version: String,
    /// Hostname (required)
    pub host: String,
    /// Short message (required)
    pub short_message: String,
    /// Full message (optional)
    #[serde(default)]
    pub full_message: Option<String>,
    /// Unix timestamp with optional milliseconds
    #[serde(default)]
    pub timestamp: Option<f64>,
    /// Syslog level (0-7, optional, default 1)
    #[serde(default = "default_level")]
    pub level: u8,
    /// Facility (optional)
    #[serde(default)]
    pub facility: Option<String>,
    /// Line number (optional)
    #[serde(default)]
    pub line: Option<u32>,
    /// File name (optional)
    #[serde(default)]
    pub file: Option<String>,
    /// Additional fields (all fields starting with _)
    #[serde(flatten)]
    pub additional_fields: HashMap<String, serde_json::Value>,
}

fn default_level() -> u8 {
    6 // Informational
}

impl GelfMessage {
    /// Convert GELF syslog level to internal LogLevel
    fn to_log_level(&self) -> LogLevel {
        match self.level {
            0 => LogLevel::Fatal,  // Emergency
            1 => LogLevel::Fatal,  // Alert
            2 => LogLevel::Fatal,  // Critical
            3 => LogLevel::Error,  // Error
            4 => LogLevel::Warn,   // Warning
            5 => LogLevel::Info,   // Notice
            6 => LogLevel::Info,   // Informational
            7 => LogLevel::Debug,  // Debug
            _ => LogLevel::Info,
        }
    }

    /// Convert to internal LogEntry
    pub fn into_log_entry(self, source_ip: String) -> LogEntry {
        let timestamp = self
            .timestamp
            .map(|ts| {
                let secs = ts.trunc() as i64;
                let nanos = ((ts.fract()) * 1_000_000_000.0) as u32;
                match Utc.timestamp_opt(secs, nanos) {
                    chrono::LocalResult::Single(dt) => dt,
                    _ => Utc::now(),
                }
            })
            .unwrap_or_else(Utc::now);

        let level = self.to_log_level();

        // Use facility as service name, or fall back to host
        let service = self
            .facility
            .clone()
            .unwrap_or_else(|| self.host.clone());

        // Build the message
        let message = self.short_message.clone();

        // Build metadata from additional fields
        let mut metadata: HashMap<String, serde_json::Value> = self
            .additional_fields
            .into_iter()
            .filter(|(k, _)| k.starts_with('_'))
            .map(|(k, v)| (k.trim_start_matches('_').to_string(), v))
            .collect();

        // Add optional fields to metadata
        if let Some(full_msg) = &self.full_message {
            metadata.insert("full_message".to_string(), serde_json::Value::String(full_msg.clone()));
        }
        if let Some(file) = &self.file {
            metadata.insert("file".to_string(), serde_json::Value::String(file.clone()));
        }
        if let Some(line) = self.line {
            metadata.insert("line".to_string(), serde_json::json!(line));
        }
        if let Some(facility) = &self.facility {
            metadata.insert("facility".to_string(), serde_json::Value::String(facility.clone()));
        }
        metadata.insert("gelf_host".to_string(), serde_json::Value::String(self.host));
        metadata.insert("gelf_version".to_string(), serde_json::Value::String(self.version));

        LogEntry {
            id: None,
            timestamp,
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
            created_at: Utc::now(),
        }
    }
}

/// Check if data is gzip compressed
fn is_gzip(data: &[u8]) -> bool {
    data.len() >= 2 && data[0] == 0x1f && data[1] == 0x8b
}

/// Check if data is zlib compressed
fn is_zlib(data: &[u8]) -> bool {
    if data.len() < 2 {
        return false;
    }
    // Zlib header: first byte is compression method (0x78 for deflate)
    // Second byte depends on compression level
    data[0] == 0x78 && (data[1] == 0x01 || data[1] == 0x5e || data[1] == 0x9c || data[1] == 0xda)
}

/// Check if data is a chunked GELF message
fn is_chunked(data: &[u8]) -> bool {
    data.len() >= 2 && data[0] == GELF_MAGIC[0] && data[1] == GELF_MAGIC[1]
}

/// Decompress gzip data
fn decompress_gzip(data: &[u8]) -> Result<Vec<u8>> {
    let mut decoder = flate2::read::GzDecoder::new(data);
    let mut decompressed = Vec::new();
    decoder.read_to_end(&mut decompressed)?;
    Ok(decompressed)
}

/// Decompress zlib data
fn decompress_zlib(data: &[u8]) -> Result<Vec<u8>> {
    let mut decoder = flate2::read::ZlibDecoder::new(data);
    let mut decompressed = Vec::new();
    decoder.read_to_end(&mut decompressed)?;
    Ok(decompressed)
}

/// Parse a GELF message from raw bytes
/// Handles:
/// - Raw JSON
/// - Gzip compressed JSON
/// - Zlib compressed JSON
pub fn parse_gelf_message(data: &[u8], source_ip: String) -> Result<LogEntry> {
    // Check for chunked messages (not supported in this simple implementation)
    if is_chunked(data) {
        return Err(anyhow!("Chunked GELF messages are not supported yet"));
    }

    // Decompress if needed
    let json_data = if is_gzip(data) {
        decompress_gzip(data)?
    } else if is_zlib(data) {
        decompress_zlib(data)?
    } else {
        data.to_vec()
    };

    // Parse JSON
    let gelf_message: GelfMessage = serde_json::from_slice(&json_data)
        .map_err(|e| anyhow!("Failed to parse GELF JSON: {}", e))?;

    // Validate version
    if gelf_message.version != "1.1" && gelf_message.version != "1.0" {
        return Err(anyhow!("Unsupported GELF version: {}", gelf_message.version));
    }

    Ok(gelf_message.into_log_entry(source_ip))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_basic_gelf() {
        let gelf_json = r#"{
            "version": "1.1",
            "host": "example.org",
            "short_message": "A short message",
            "level": 3,
            "_user_id": 42
        }"#;

        let log = parse_gelf_message(gelf_json.as_bytes(), "127.0.0.1".to_string()).unwrap();

        assert_eq!(log.message, "A short message");
        assert_eq!(log.level, LogLevel::Error);
        assert_eq!(log.service, "example.org");
    }

    #[test]
    fn test_parse_gelf_with_facility() {
        let gelf_json = r#"{
            "version": "1.1",
            "host": "example.org",
            "short_message": "Test message",
            "facility": "my-service"
        }"#;

        let log = parse_gelf_message(gelf_json.as_bytes(), "127.0.0.1".to_string()).unwrap();

        assert_eq!(log.service, "my-service");
    }
}
