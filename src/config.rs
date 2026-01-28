use anyhow::Result;
use serde::Deserialize;
use std::fs;

#[derive(Debug, Deserialize, Clone)]
#[allow(dead_code)]
pub struct Config {
    pub server: ServerConfig,
    pub mongodb: MongoDbConfig,
    pub tls: TlsConfig,
    pub logging: LoggingConfig,
    #[serde(default)]
    pub gelf: GelfConfig,
    #[serde(default)]
    pub otlp: OtlpConfig,
    #[serde(default)]
    pub syslog: SyslogConfig,
    #[serde(default)]
    pub batch: BatchingConfig,
    #[serde(default)]
    pub users: Vec<User>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct User {
    pub username: String,
    pub password: String,
    #[serde(default = "default_role")]
    pub role: String,
}

fn default_role() -> String {
    "user".to_string()
}

#[derive(Debug, Deserialize, Clone)]
pub struct ServerConfig {
    pub udp_port: u16,
    pub https_port: u16,
    pub auth_secret: String,
    pub api_keys: Vec<String>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct MongoDbConfig {
    pub connection_string: String,
    pub database_name: String,
    pub collection_name: String,
}

#[derive(Debug, Deserialize, Clone)]
#[allow(dead_code)]
pub struct TlsConfig {
    pub cert_path: String,
    pub key_path: String,
}

#[derive(Debug, Deserialize, Clone)]
#[allow(dead_code)]
pub struct LoggingConfig {
    pub level: String,
    pub retention_days: u32,
}

#[derive(Debug, Deserialize, Clone)]
pub struct GelfConfig {
    #[serde(default = "default_gelf_enabled")]
    pub enabled: bool,
    #[serde(default = "default_gelf_udp_port")]
    pub udp_port: u16,
}

fn default_gelf_enabled() -> bool {
    true
}

fn default_gelf_udp_port() -> u16 {
    12201
}

impl Default for GelfConfig {
    fn default() -> Self {
        Self {
            enabled: default_gelf_enabled(),
            udp_port: default_gelf_udp_port(),
        }
    }
}

#[derive(Debug, Deserialize, Clone)]
pub struct OtlpConfig {
    #[serde(default = "default_otlp_enabled")]
    pub enabled: bool,
    #[serde(default = "default_grpc_port")]
    pub grpc_port: u16,
    #[serde(default = "default_http_port")]
    pub http_port: u16,
    #[serde(default = "default_enable_grpc")]
    pub enable_grpc: bool,
    #[serde(default = "default_enable_http")]
    pub enable_http: bool,
    #[serde(default = "default_spans_collection")]
    pub spans_collection: String,
}

fn default_otlp_enabled() -> bool {
    true
}

fn default_grpc_port() -> u16 {
    4317
}

fn default_http_port() -> u16 {
    4318
}

fn default_enable_grpc() -> bool {
    true
}

fn default_enable_http() -> bool {
    true
}

fn default_spans_collection() -> String {
    "spans".to_string()
}

impl Default for OtlpConfig {
    fn default() -> Self {
        Self {
            enabled: default_otlp_enabled(),
            grpc_port: default_grpc_port(),
            http_port: default_http_port(),
            enable_grpc: default_enable_grpc(),
            enable_http: default_enable_http(),
            spans_collection: default_spans_collection(),
        }
    }
}

#[derive(Debug, Deserialize, Clone)]
pub struct SyslogConfig {
    #[serde(default = "default_syslog_enabled")]
    pub enabled: bool,
    #[serde(default = "default_syslog_udp_enabled")]
    pub udp_enabled: bool,
    #[serde(default = "default_syslog_tcp_enabled")]
    pub tcp_enabled: bool,
    #[serde(default = "default_syslog_udp_port")]
    pub udp_port: u16,
    #[serde(default = "default_syslog_tcp_port")]
    pub tcp_port: u16,
    #[serde(default = "default_syslog_max_message_size")]
    pub max_message_size: usize,
}

fn default_syslog_enabled() -> bool {
    true
}

fn default_syslog_udp_enabled() -> bool {
    true
}

fn default_syslog_tcp_enabled() -> bool {
    true
}

fn default_syslog_udp_port() -> u16 {
    514
}

fn default_syslog_tcp_port() -> u16 {
    1514
}

fn default_syslog_max_message_size() -> usize {
    65535
}

impl Default for SyslogConfig {
    fn default() -> Self {
        Self {
            enabled: default_syslog_enabled(),
            udp_enabled: default_syslog_udp_enabled(),
            tcp_enabled: default_syslog_tcp_enabled(),
            udp_port: default_syslog_udp_port(),
            tcp_port: default_syslog_tcp_port(),
            max_message_size: default_syslog_max_message_size(),
        }
    }
}

#[derive(Debug, Deserialize, Clone)]
pub struct BatchingConfig {
    #[serde(default = "default_batch_enabled")]
    pub enabled: bool,
    #[serde(default = "default_max_batch_size")]
    pub max_batch_size: usize,
    #[serde(default = "default_flush_interval_ms")]
    pub flush_interval_ms: u64,
    #[serde(default = "default_channel_buffer_size")]
    pub channel_buffer_size: usize,
}

fn default_batch_enabled() -> bool {
    true
}

fn default_max_batch_size() -> usize {
    100
}

fn default_flush_interval_ms() -> u64 {
    100
}

fn default_channel_buffer_size() -> usize {
    10000
}

impl Default for BatchingConfig {
    fn default() -> Self {
        Self {
            enabled: default_batch_enabled(),
            max_batch_size: default_max_batch_size(),
            flush_interval_ms: default_flush_interval_ms(),
            channel_buffer_size: default_channel_buffer_size(),
        }
    }
}

impl Config {
    pub fn load(path: &str) -> Result<Self> {
        let content = fs::read_to_string(path)?;
        let mut config: Config = toml::from_str(&content)?;
        
        // Override MongoDB connection string from environment if set
        if let Ok(mongodb_uri) = std::env::var("MONGODB_URI") {
            config.mongodb.connection_string = mongodb_uri;
        }
        
        Ok(config)
    }
}
