use chrono::{DateTime, Utc};
use std::collections::HashMap;
use std::fmt;

use crate::db::models::{LogEntry, LogLevel};

/// Syslog facilities as defined in RFC 5424
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum SyslogFacility {
    Kern = 0,      // kernel messages
    User = 1,      // user-level messages
    Mail = 2,      // mail system
    Daemon = 3,    // system daemons
    Auth = 4,      // security/authorization messages
    Syslog = 5,    // messages generated internally by syslogd
    Lpr = 6,       // line printer subsystem
    News = 7,      // network news subsystem
    Uucp = 8,      // UUCP subsystem
    Cron = 9,      // clock daemon
    Authpriv = 10, // security/authorization messages (private)
    Ftp = 11,      // FTP daemon
    Ntp = 12,      // NTP subsystem
    Audit = 13,    // log audit
    Alert = 14,    // log alert
    Clock = 15,    // clock daemon (note 2)
    Local0 = 16,   // local use 0
    Local1 = 17,   // local use 1
    Local2 = 18,   // local use 2
    Local3 = 19,   // local use 3
    Local4 = 20,   // local use 4
    Local5 = 21,   // local use 5
    Local6 = 22,   // local use 6
    Local7 = 23,   // local use 7
}

impl SyslogFacility {
    pub fn from_code(code: u8) -> Option<Self> {
        match code {
            0 => Some(SyslogFacility::Kern),
            1 => Some(SyslogFacility::User),
            2 => Some(SyslogFacility::Mail),
            3 => Some(SyslogFacility::Daemon),
            4 => Some(SyslogFacility::Auth),
            5 => Some(SyslogFacility::Syslog),
            6 => Some(SyslogFacility::Lpr),
            7 => Some(SyslogFacility::News),
            8 => Some(SyslogFacility::Uucp),
            9 => Some(SyslogFacility::Cron),
            10 => Some(SyslogFacility::Authpriv),
            11 => Some(SyslogFacility::Ftp),
            12 => Some(SyslogFacility::Ntp),
            13 => Some(SyslogFacility::Audit),
            14 => Some(SyslogFacility::Alert),
            15 => Some(SyslogFacility::Clock),
            16 => Some(SyslogFacility::Local0),
            17 => Some(SyslogFacility::Local1),
            18 => Some(SyslogFacility::Local2),
            19 => Some(SyslogFacility::Local3),
            20 => Some(SyslogFacility::Local4),
            21 => Some(SyslogFacility::Local5),
            22 => Some(SyslogFacility::Local6),
            23 => Some(SyslogFacility::Local7),
            _ => None,
        }
    }
}

impl fmt::Display for SyslogFacility {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let name = match self {
            SyslogFacility::Kern => "kern",
            SyslogFacility::User => "user",
            SyslogFacility::Mail => "mail",
            SyslogFacility::Daemon => "daemon",
            SyslogFacility::Auth => "auth",
            SyslogFacility::Syslog => "syslog",
            SyslogFacility::Lpr => "lpr",
            SyslogFacility::News => "news",
            SyslogFacility::Uucp => "uucp",
            SyslogFacility::Cron => "cron",
            SyslogFacility::Authpriv => "authpriv",
            SyslogFacility::Ftp => "ftp",
            SyslogFacility::Ntp => "ntp",
            SyslogFacility::Audit => "audit",
            SyslogFacility::Alert => "alert",
            SyslogFacility::Clock => "clock",
            SyslogFacility::Local0 => "local0",
            SyslogFacility::Local1 => "local1",
            SyslogFacility::Local2 => "local2",
            SyslogFacility::Local3 => "local3",
            SyslogFacility::Local4 => "local4",
            SyslogFacility::Local5 => "local5",
            SyslogFacility::Local6 => "local6",
            SyslogFacility::Local7 => "local7",
        };
        write!(f, "{}", name)
    }
}

/// Syslog severity levels as defined in RFC 5424
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
#[repr(u8)]
pub enum SyslogSeverity {
    Emergency = 0, // system is unusable
    Alert = 1,     // action must be taken immediately
    Critical = 2,  // critical conditions
    Error = 3,     // error conditions
    Warning = 4,   // warning conditions
    Notice = 5,    // normal but significant condition
    Info = 6,      // informational messages
    Debug = 7,     // debug-level messages
}

impl SyslogSeverity {
    pub fn from_code(code: u8) -> Option<Self> {
        match code {
            0 => Some(SyslogSeverity::Emergency),
            1 => Some(SyslogSeverity::Alert),
            2 => Some(SyslogSeverity::Critical),
            3 => Some(SyslogSeverity::Error),
            4 => Some(SyslogSeverity::Warning),
            5 => Some(SyslogSeverity::Notice),
            6 => Some(SyslogSeverity::Info),
            7 => Some(SyslogSeverity::Debug),
            _ => None,
        }
    }

    /// Convert syslog severity to internal LogLevel
    pub fn to_log_level(self) -> LogLevel {
        match self {
            SyslogSeverity::Emergency | SyslogSeverity::Alert => LogLevel::Fatal,
            SyslogSeverity::Critical | SyslogSeverity::Error => LogLevel::Error,
            SyslogSeverity::Warning => LogLevel::Warn,
            SyslogSeverity::Notice | SyslogSeverity::Info => LogLevel::Info,
            SyslogSeverity::Debug => LogLevel::Debug,
        }
    }
}

impl fmt::Display for SyslogSeverity {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let name = match self {
            SyslogSeverity::Emergency => "emergency",
            SyslogSeverity::Alert => "alert",
            SyslogSeverity::Critical => "critical",
            SyslogSeverity::Error => "error",
            SyslogSeverity::Warning => "warning",
            SyslogSeverity::Notice => "notice",
            SyslogSeverity::Info => "info",
            SyslogSeverity::Debug => "debug",
        };
        write!(f, "{}", name)
    }
}

/// RFC version detected during parsing
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SyslogRfcVersion {
    Rfc3164, // BSD syslog
    Rfc5424, // Modern syslog
}

/// Structured data element from RFC 5424
#[derive(Debug, Clone)]
pub struct StructuredDataElement {
    pub id: String,
    pub params: HashMap<String, String>,
}

/// Parsed syslog message
#[derive(Debug, Clone)]
pub struct SyslogMessage {
    pub rfc_version: SyslogRfcVersion,
    pub facility: SyslogFacility,
    pub severity: SyslogSeverity,
    pub timestamp: Option<DateTime<Utc>>,
    pub hostname: Option<String>,
    pub app_name: Option<String>,
    pub proc_id: Option<String>,
    pub msg_id: Option<String>,
    pub structured_data: Vec<StructuredDataElement>,
    pub message: String,
}

impl SyslogMessage {
    /// Convert to internal LogEntry format
    pub fn into_log_entry(self, source_ip: String) -> LogEntry {
        let timestamp = self.timestamp.unwrap_or_else(Utc::now);
        let level = self.severity.to_log_level();

        // Use app_name, hostname, or facility as service name
        let service = self
            .app_name
            .clone()
            .or_else(|| self.hostname.clone())
            .unwrap_or_else(|| self.facility.to_string());

        // Build metadata from syslog fields
        let mut metadata: HashMap<String, serde_json::Value> = HashMap::new();

        metadata.insert(
            "syslog_facility".to_string(),
            serde_json::Value::String(self.facility.to_string()),
        );
        metadata.insert(
            "syslog_facility_code".to_string(),
            serde_json::json!(self.facility as u8),
        );
        metadata.insert(
            "syslog_severity".to_string(),
            serde_json::Value::String(self.severity.to_string()),
        );
        metadata.insert(
            "syslog_severity_code".to_string(),
            serde_json::json!(self.severity as u8),
        );
        metadata.insert(
            "syslog_rfc_version".to_string(),
            serde_json::Value::String(match self.rfc_version {
                SyslogRfcVersion::Rfc3164 => "RFC3164".to_string(),
                SyslogRfcVersion::Rfc5424 => "RFC5424".to_string(),
            }),
        );

        if let Some(hostname) = &self.hostname {
            metadata.insert(
                "syslog_hostname".to_string(),
                serde_json::Value::String(hostname.clone()),
            );
        }

        if let Some(app_name) = &self.app_name {
            metadata.insert(
                "syslog_app_name".to_string(),
                serde_json::Value::String(app_name.clone()),
            );
        }

        if let Some(proc_id) = &self.proc_id {
            metadata.insert(
                "syslog_proc_id".to_string(),
                serde_json::Value::String(proc_id.clone()),
            );
        }

        if let Some(msg_id) = &self.msg_id {
            metadata.insert(
                "syslog_msg_id".to_string(),
                serde_json::Value::String(msg_id.clone()),
            );
        }

        // Add structured data elements to metadata
        for sd in &self.structured_data {
            let sd_key = format!("sd_{}", sd.id);
            let sd_value: HashMap<String, serde_json::Value> = sd
                .params
                .iter()
                .map(|(k, v)| (k.clone(), serde_json::Value::String(v.clone())))
                .collect();
            metadata.insert(sd_key, serde_json::json!(sd_value));
        }

        LogEntry {
            id: None,
            timestamp,
            level,
            service,
            message: self.message,
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
