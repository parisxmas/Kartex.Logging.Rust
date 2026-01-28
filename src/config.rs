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
