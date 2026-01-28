use anyhow::{anyhow, Result};
use chrono::{DateTime, Datelike, NaiveDateTime, TimeZone, Utc};
use std::collections::HashMap;

use super::models::{
    StructuredDataElement, SyslogFacility, SyslogMessage, SyslogRfcVersion, SyslogSeverity,
};
use crate::db::models::LogEntry;

/// Parse a syslog message from raw bytes (auto-detects RFC version)
pub fn parse_syslog_message(data: &[u8], source_ip: String) -> Result<LogEntry> {
    let message_str = std::str::from_utf8(data)
        .map_err(|e| anyhow!("Invalid UTF-8 in syslog message: {}", e))?
        .trim();

    let syslog_msg = parse_syslog(message_str)?;
    Ok(syslog_msg.into_log_entry(source_ip))
}

/// Parse a syslog message string (auto-detects RFC version)
pub fn parse_syslog(message: &str) -> Result<SyslogMessage> {
    // Both RFC 3164 and RFC 5424 start with <PRI>
    if !message.starts_with('<') {
        return Err(anyhow!("Invalid syslog message: missing PRI"));
    }

    // Find the end of PRI
    let pri_end = message
        .find('>')
        .ok_or_else(|| anyhow!("Invalid syslog message: malformed PRI"))?;

    let pri_str = &message[1..pri_end];
    let pri: u8 = pri_str
        .parse()
        .map_err(|_| anyhow!("Invalid syslog PRI value: {}", pri_str))?;

    // Extract facility and severity from PRI
    let facility_code = pri >> 3;
    let severity_code = pri & 0x07;

    let facility = SyslogFacility::from_code(facility_code)
        .ok_or_else(|| anyhow!("Invalid facility code: {}", facility_code))?;
    let severity = SyslogSeverity::from_code(severity_code)
        .ok_or_else(|| anyhow!("Invalid severity code: {}", severity_code))?;

    let remaining = &message[pri_end + 1..];

    // Auto-detect RFC version:
    // RFC 5424 starts with version number after PRI (e.g., "<PRI>1 ")
    if remaining.starts_with("1 ") {
        parse_rfc5424(remaining, facility, severity)
    } else {
        parse_rfc3164(remaining, facility, severity)
    }
}

/// Parse RFC 3164 (BSD) syslog format
/// Format: <PRI>Mmm dd hh:mm:ss HOSTNAME TAG: MESSAGE
fn parse_rfc3164(
    message: &str,
    facility: SyslogFacility,
    severity: SyslogSeverity,
) -> Result<SyslogMessage> {
    let mut pos = 0;
    let bytes = message.as_bytes();

    // Try to parse timestamp (Mmm dd hh:mm:ss or Mmm  d hh:mm:ss)
    let timestamp = parse_rfc3164_timestamp(message, &mut pos);

    // Skip whitespace
    while pos < bytes.len() && bytes[pos] == b' ' {
        pos += 1;
    }

    // Parse hostname (until space or colon)
    let hostname_start = pos;
    while pos < bytes.len() && bytes[pos] != b' ' && bytes[pos] != b':' {
        pos += 1;
    }
    let hostname = if pos > hostname_start {
        Some(message[hostname_start..pos].to_string())
    } else {
        None
    };

    // Skip whitespace
    while pos < bytes.len() && bytes[pos] == b' ' {
        pos += 1;
    }

    // The rest is TAG: MESSAGE or just MESSAGE
    let remaining = &message[pos..];

    // Try to extract TAG (app_name) from "TAG: MESSAGE" or "TAG[PID]: MESSAGE"
    let (app_name, proc_id, msg) = parse_rfc3164_tag_message(remaining);

    Ok(SyslogMessage {
        rfc_version: SyslogRfcVersion::Rfc3164,
        facility,
        severity,
        timestamp,
        hostname,
        app_name,
        proc_id,
        msg_id: None,
        structured_data: Vec::new(),
        message: msg,
    })
}

/// Parse RFC 3164 timestamp (Mmm dd hh:mm:ss)
fn parse_rfc3164_timestamp(message: &str, pos: &mut usize) -> Option<DateTime<Utc>> {
    // Month names
    const MONTHS: [&str; 12] = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];

    if message.len() < *pos + 15 {
        return None;
    }

    let slice = &message[*pos..];

    // Try to match month
    let month_str = &slice[0..3];
    let month = MONTHS.iter().position(|&m| m == month_str)? as u32 + 1;

    // Skip month and space(s)
    let day_start = if slice.as_bytes().get(3) == Some(&b' ') {
        if slice.as_bytes().get(4) == Some(&b' ') {
            5 // "Mmm  d" format
        } else {
            4 // "Mmm dd" format
        }
    } else {
        return None;
    };

    // Find end of day
    let mut day_end = day_start;
    while day_end < slice.len() && slice.as_bytes()[day_end] != b' ' {
        day_end += 1;
    }

    let day: u32 = slice[day_start..day_end].parse().ok()?;

    // Skip space after day
    if day_end >= slice.len() || slice.as_bytes()[day_end] != b' ' {
        return None;
    }
    let time_start = day_end + 1;

    // Parse time (hh:mm:ss)
    if time_start + 8 > slice.len() {
        return None;
    }

    let time_str = &slice[time_start..time_start + 8];
    let parts: Vec<&str> = time_str.split(':').collect();
    if parts.len() != 3 {
        return None;
    }

    let hour: u32 = parts[0].parse().ok()?;
    let minute: u32 = parts[1].parse().ok()?;
    let second: u32 = parts[2].parse().ok()?;

    // Update position
    *pos += time_start + 8;

    // Use current year (RFC 3164 doesn't include year)
    let now = Utc::now();
    let year = now.year();

    let naive = NaiveDateTime::parse_from_str(
        &format!("{}-{:02}-{:02} {:02}:{:02}:{:02}", year, month, day, hour, minute, second),
        "%Y-%m-%d %H:%M:%S",
    )
    .ok()?;

    Some(Utc.from_utc_datetime(&naive))
}

/// Parse TAG and MESSAGE from RFC 3164
/// Handles formats like:
/// - "TAG: message"
/// - "TAG[PID]: message"
/// - "TAG message" (no colon)
fn parse_rfc3164_tag_message(input: &str) -> (Option<String>, Option<String>, String) {
    // Try to find TAG[PID]: pattern
    if let Some(bracket_pos) = input.find('[') {
        if let Some(bracket_end) = input[bracket_pos..].find(']') {
            let tag = input[..bracket_pos].to_string();
            let pid = input[bracket_pos + 1..bracket_pos + bracket_end].to_string();

            // Find colon after ]
            let after_bracket = bracket_pos + bracket_end + 1;
            let msg_start = if input[after_bracket..].starts_with(':') {
                after_bracket + 1
            } else {
                after_bracket
            };

            let message = input[msg_start..].trim_start().to_string();
            return (Some(tag), Some(pid), message);
        }
    }

    // Try to find TAG: pattern
    if let Some(colon_pos) = input.find(':') {
        // Check if there's no space before colon (valid TAG)
        let potential_tag = &input[..colon_pos];
        if !potential_tag.contains(' ') && !potential_tag.is_empty() {
            let message = input[colon_pos + 1..].trim_start().to_string();
            return (Some(potential_tag.to_string()), None, message);
        }
    }

    // No clear TAG, treat entire input as message
    (None, None, input.to_string())
}

/// Parse RFC 5424 (modern) syslog format
/// Format: <PRI>VERSION TIMESTAMP HOSTNAME APP-NAME PROCID MSGID [SD] MSG
fn parse_rfc5424(
    message: &str,
    facility: SyslogFacility,
    severity: SyslogSeverity,
) -> Result<SyslogMessage> {
    // Skip version "1 "
    let message = &message[2..];

    let parts: Vec<&str> = message.splitn(7, ' ').collect();
    if parts.len() < 6 {
        return Err(anyhow!("Invalid RFC 5424 message: not enough fields"));
    }

    // Parse timestamp
    let timestamp = parse_rfc5424_timestamp(parts[0])?;

    // Parse NILVALUE fields (represented as "-")
    let hostname = parse_nilvalue(parts[1]);
    let app_name = parse_nilvalue(parts[2]);
    let proc_id = parse_nilvalue(parts[3]);
    let msg_id = parse_nilvalue(parts[4]);

    // Parse structured data and message
    let sd_and_msg = if parts.len() >= 6 {
        parts[5..].join(" ")
    } else {
        String::new()
    };

    let (structured_data, msg) = parse_structured_data_and_message(&sd_and_msg);

    Ok(SyslogMessage {
        rfc_version: SyslogRfcVersion::Rfc5424,
        facility,
        severity,
        timestamp: Some(timestamp),
        hostname,
        app_name,
        proc_id,
        msg_id,
        structured_data,
        message: msg,
    })
}

/// Parse RFC 5424 timestamp
fn parse_rfc5424_timestamp(ts: &str) -> Result<DateTime<Utc>> {
    if ts == "-" {
        return Ok(Utc::now());
    }

    // Try ISO 8601 formats
    // Full: 2024-01-28T10:30:00.123456Z
    // With offset: 2024-01-28T10:30:00+00:00
    DateTime::parse_from_rfc3339(ts)
        .map(|dt| dt.with_timezone(&Utc))
        .or_else(|_| {
            // Try without fractional seconds
            DateTime::parse_from_str(ts, "%Y-%m-%dT%H:%M:%S%z")
                .map(|dt| dt.with_timezone(&Utc))
        })
        .or_else(|_| {
            // Try with Z suffix
            NaiveDateTime::parse_from_str(ts.trim_end_matches('Z'), "%Y-%m-%dT%H:%M:%S")
                .map(|ndt| Utc.from_utc_datetime(&ndt))
        })
        .map_err(|e| anyhow!("Failed to parse RFC 5424 timestamp '{}': {}", ts, e))
}

/// Parse NILVALUE field ("-" means nil)
fn parse_nilvalue(value: &str) -> Option<String> {
    if value == "-" {
        None
    } else {
        Some(value.to_string())
    }
}

/// Parse structured data and message from RFC 5424
/// Structured data: [SD-ID param="value" ...][SD-ID2 ...]
fn parse_structured_data_and_message(input: &str) -> (Vec<StructuredDataElement>, String) {
    let input = input.trim();

    if input.starts_with('-') {
        // NILVALUE for structured data
        let msg = input[1..].trim_start().to_string();
        return (Vec::new(), msg);
    }

    if !input.starts_with('[') {
        // No structured data, entire input is message
        return (Vec::new(), input.to_string());
    }

    let mut structured_data = Vec::new();
    let mut pos = 0;
    let bytes = input.as_bytes();

    while pos < bytes.len() && bytes[pos] == b'[' {
        // Find matching ]
        let start = pos + 1;
        let mut depth = 1;
        let mut end = start;

        while end < bytes.len() && depth > 0 {
            match bytes[end] {
                b'[' => depth += 1,
                b']' => depth -= 1,
                b'\\' if end + 1 < bytes.len() => {
                    end += 1; // Skip escaped character
                }
                _ => {}
            }
            end += 1;
        }

        if depth != 0 {
            // Malformed, treat rest as message
            break;
        }

        let sd_content = &input[start..end - 1];
        if let Some(sd_element) = parse_sd_element(sd_content) {
            structured_data.push(sd_element);
        }

        pos = end;
    }

    // Rest is the message
    let message = input[pos..].trim_start().to_string();

    (structured_data, message)
}

/// Parse a single structured data element
/// Format: SD-ID param="value" param2="value2"
fn parse_sd_element(content: &str) -> Option<StructuredDataElement> {
    let mut parts = content.splitn(2, ' ');
    let id = parts.next()?.to_string();

    let mut params = HashMap::new();

    if let Some(params_str) = parts.next() {
        // Parse param="value" pairs
        let mut remaining = params_str;
        while !remaining.is_empty() {
            remaining = remaining.trim_start();
            if remaining.is_empty() {
                break;
            }

            // Find param name (until =)
            if let Some(eq_pos) = remaining.find('=') {
                let param_name = remaining[..eq_pos].to_string();
                remaining = &remaining[eq_pos + 1..];

                // Parse quoted value
                if remaining.starts_with('"') {
                    remaining = &remaining[1..];
                    let mut value = String::new();
                    let bytes = remaining.as_bytes();
                    let mut i = 0;

                    while i < bytes.len() {
                        let c = bytes[i];
                        if c == b'\\' && i + 1 < bytes.len() {
                            // Handle escape sequences
                            let next = bytes[i + 1];
                            match next {
                                b'"' | b'\\' | b']' => {
                                    value.push(next as char);
                                    i += 2;
                                }
                                _ => {
                                    value.push(c as char);
                                    i += 1;
                                }
                            }
                        } else if c == b'"' {
                            i += 1;
                            break;
                        } else {
                            value.push(c as char);
                            i += 1;
                        }
                    }

                    params.insert(param_name, value);
                    remaining = &remaining[i..];
                } else {
                    break;
                }
            } else {
                break;
            }
        }
    }

    Some(StructuredDataElement { id, params })
}

/// Parse octet-counted framing (RFC 5425)
/// Format: MSG-LEN SP MSG
pub fn parse_octet_counted(data: &[u8]) -> Result<(usize, &[u8])> {
    // Find the space separator
    let space_pos = data
        .iter()
        .position(|&b| b == b' ')
        .ok_or_else(|| anyhow!("Invalid octet-counted frame: no space separator"))?;

    let len_str = std::str::from_utf8(&data[..space_pos])
        .map_err(|e| anyhow!("Invalid octet-counted frame length: {}", e))?;

    let msg_len: usize = len_str
        .parse()
        .map_err(|e| anyhow!("Invalid octet-counted frame length '{}': {}", len_str, e))?;

    let msg_start = space_pos + 1;
    let msg_end = msg_start + msg_len;

    if msg_end > data.len() {
        return Err(anyhow!(
            "Incomplete octet-counted frame: expected {} bytes, got {}",
            msg_len,
            data.len() - msg_start
        ));
    }

    Ok((msg_end, &data[msg_start..msg_end]))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::models::LogLevel;

    #[test]
    fn test_parse_rfc3164_basic() {
        let msg = "<134>Jan 28 10:30:00 testhost myapp: Test message";
        let result = parse_syslog(msg).unwrap();

        assert_eq!(result.rfc_version, SyslogRfcVersion::Rfc3164);
        assert_eq!(result.facility, SyslogFacility::Local0);
        assert_eq!(result.severity, SyslogSeverity::Info);
        assert_eq!(result.hostname, Some("testhost".to_string()));
        assert_eq!(result.app_name, Some("myapp".to_string()));
        assert_eq!(result.message, "Test message");
    }

    #[test]
    fn test_parse_rfc3164_with_pid() {
        let msg = "<134>Jan 28 10:30:00 testhost myapp[1234]: Test message";
        let result = parse_syslog(msg).unwrap();

        assert_eq!(result.app_name, Some("myapp".to_string()));
        assert_eq!(result.proc_id, Some("1234".to_string()));
        assert_eq!(result.message, "Test message");
    }

    #[test]
    fn test_parse_rfc5424_basic() {
        let msg = "<134>1 2024-01-28T10:30:00Z testhost myapp 1234 - - Test message";
        let result = parse_syslog(msg).unwrap();

        assert_eq!(result.rfc_version, SyslogRfcVersion::Rfc5424);
        assert_eq!(result.facility, SyslogFacility::Local0);
        assert_eq!(result.severity, SyslogSeverity::Info);
        assert_eq!(result.hostname, Some("testhost".to_string()));
        assert_eq!(result.app_name, Some("myapp".to_string()));
        assert_eq!(result.proc_id, Some("1234".to_string()));
        assert_eq!(result.message, "Test message");
    }

    #[test]
    fn test_parse_rfc5424_with_structured_data() {
        let msg = "<134>1 2024-01-28T10:30:00Z host app - - [exampleSDID@32473 iut=\"3\" eventSource=\"Application\"] Test";
        let result = parse_syslog(msg).unwrap();

        assert_eq!(result.structured_data.len(), 1);
        assert_eq!(result.structured_data[0].id, "exampleSDID@32473");
        assert_eq!(
            result.structured_data[0].params.get("iut"),
            Some(&"3".to_string())
        );
        assert_eq!(
            result.structured_data[0].params.get("eventSource"),
            Some(&"Application".to_string())
        );
        assert_eq!(result.message, "Test");
    }

    #[test]
    fn test_parse_rfc5424_nilvalues() {
        let msg = "<134>1 - - - - - - Test message";
        let result = parse_syslog(msg).unwrap();

        assert_eq!(result.hostname, None);
        assert_eq!(result.app_name, None);
        assert_eq!(result.proc_id, None);
        assert_eq!(result.msg_id, None);
        assert_eq!(result.message, "Test message");
    }

    #[test]
    fn test_facility_severity_decode() {
        // PRI 134 = facility 16 (local0), severity 6 (info)
        // 134 = 16 * 8 + 6
        let msg = "<134>1 2024-01-28T10:30:00Z host app - - - Test";
        let result = parse_syslog(msg).unwrap();

        assert_eq!(result.facility, SyslogFacility::Local0);
        assert_eq!(result.severity, SyslogSeverity::Info);
    }

    #[test]
    fn test_severity_mapping() {
        assert_eq!(SyslogSeverity::Emergency.to_log_level(), LogLevel::Fatal);
        assert_eq!(SyslogSeverity::Alert.to_log_level(), LogLevel::Fatal);
        assert_eq!(SyslogSeverity::Critical.to_log_level(), LogLevel::Error);
        assert_eq!(SyslogSeverity::Error.to_log_level(), LogLevel::Error);
        assert_eq!(SyslogSeverity::Warning.to_log_level(), LogLevel::Warn);
        assert_eq!(SyslogSeverity::Notice.to_log_level(), LogLevel::Info);
        assert_eq!(SyslogSeverity::Info.to_log_level(), LogLevel::Info);
        assert_eq!(SyslogSeverity::Debug.to_log_level(), LogLevel::Debug);
    }

    #[test]
    fn test_octet_counted_parsing() {
        let data = b"11 <134>1 test";
        let (end, msg) = parse_octet_counted(data).unwrap();

        assert_eq!(end, 14);
        assert_eq!(msg, b"<134>1 test");
    }
}
