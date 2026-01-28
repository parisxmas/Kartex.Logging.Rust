pub mod auth;
pub mod parser;

use std::sync::Arc;
use tokio::net::UdpSocket;
use tracing::{error, info, warn};

use crate::db::repository::LogRepository;
use crate::realtime::{MetricsTracker, WsBroadcaster};
use auth::AuthValidator;
use parser::parse_log_payload;

pub struct UdpServer {
    socket: UdpSocket,
    auth_validator: AuthValidator,
    repository: Arc<LogRepository>,
    metrics: Arc<MetricsTracker>,
    broadcaster: Arc<WsBroadcaster>,
}

impl UdpServer {
    pub async fn new(
        port: u16,
        auth_secret: &str,
        repository: Arc<LogRepository>,
        metrics: Arc<MetricsTracker>,
        broadcaster: Arc<WsBroadcaster>,
    ) -> anyhow::Result<Self> {
        let addr = format!("0.0.0.0:{}", port);
        let socket = UdpSocket::bind(&addr).await?;
        info!("UDP server listening on {}", addr);

        Ok(Self {
            socket,
            auth_validator: AuthValidator::new(auth_secret),
            repository,
            metrics,
            broadcaster,
        })
    }

    pub async fn run(self) -> anyhow::Result<()> {
        let mut buf = vec![0u8; 65535]; // Max UDP packet size

        loop {
            match self.socket.recv_from(&mut buf).await {
                Ok((len, addr)) => {
                    let packet = buf[..len].to_vec();
                    let repo = self.repository.clone();
                    let source_ip = addr.ip().to_string();

                    // Validate authentication
                    match self.auth_validator.validate(&packet) {
                        Ok(payload) => {
                            // Parse and store the log
                            match parse_log_payload(payload, source_ip.clone()) {
                                Ok(log_entry) => {
                                    let repo = repo.clone();
                                    let metrics = self.metrics.clone();
                                    let broadcaster = self.broadcaster.clone();
                                    let level = format!("{:?}", log_entry.level).to_uppercase();
                                    let log_for_broadcast = log_entry.clone();

                                    tokio::spawn(async move {
                                        // Record metrics
                                        metrics.record_log_by_level(&level).await;

                                        // Broadcast to WebSocket clients
                                        broadcaster.broadcast_log(log_for_broadcast);

                                        // Store in database
                                        if let Err(e) = repo.insert_log(log_entry).await {
                                            error!("Failed to store log from {}: {}", source_ip, e);
                                        }
                                    });
                                }
                                Err(e) => {
                                    warn!("Failed to parse log from {}: {}", addr, e);
                                }
                            }
                        }
                        Err(e) => {
                            warn!("Authentication failed from {}: {}", addr, e);
                        }
                    }
                }
                Err(e) => {
                    error!("Error receiving UDP packet: {}", e);
                }
            }
        }
    }
}
