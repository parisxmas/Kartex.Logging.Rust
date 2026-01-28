use std::sync::Arc;
use tokio::net::UdpSocket;
use tracing::{error, info, warn};

use super::parser::parse_gelf_message;
use crate::db::repository::LogRepository;
use crate::realtime::{MetricsTracker, WsBroadcaster};

/// GELF UDP Server
pub struct GelfServer {
    socket: UdpSocket,
    repository: Arc<LogRepository>,
    metrics: Arc<MetricsTracker>,
    broadcaster: Arc<WsBroadcaster>,
}

impl GelfServer {
    pub async fn new(
        port: u16,
        repository: Arc<LogRepository>,
        metrics: Arc<MetricsTracker>,
        broadcaster: Arc<WsBroadcaster>,
    ) -> anyhow::Result<Self> {
        let addr = format!("0.0.0.0:{}", port);
        let socket = UdpSocket::bind(&addr).await?;
        info!("GELF UDP server listening on {}", addr);

        Ok(Self {
            socket,
            repository,
            metrics,
            broadcaster,
        })
    }

    pub async fn run(self) -> anyhow::Result<()> {
        // GELF messages can be up to 8192 bytes for UDP (or chunked for larger)
        let mut buf = vec![0u8; 8192];

        loop {
            match self.socket.recv_from(&mut buf).await {
                Ok((len, addr)) => {
                    let packet = buf[..len].to_vec();
                    let source_ip = addr.ip().to_string();
                    let repo = self.repository.clone();
                    let metrics = self.metrics.clone();
                    let broadcaster = self.broadcaster.clone();

                    tokio::spawn(async move {
                        match parse_gelf_message(&packet, source_ip.clone()) {
                            Ok(log_entry) => {
                                let level = format!("{:?}", log_entry.level).to_uppercase();

                                // Record metrics
                                metrics.record_log_by_level(&level).await;

                                // Broadcast to WebSocket clients
                                broadcaster.broadcast_log(log_entry.clone());

                                // Store in database
                                if let Err(e) = repo.insert_log(log_entry).await {
                                    error!("Failed to store GELF log from {}: {}", source_ip, e);
                                }
                            }
                            Err(e) => {
                                warn!("Failed to parse GELF message from {}: {}", addr, e);
                            }
                        }
                    });
                }
                Err(e) => {
                    error!("Error receiving GELF UDP packet: {}", e);
                }
            }
        }
    }
}

/// Start the GELF UDP server
pub async fn start_gelf_server(
    port: u16,
    repository: Arc<LogRepository>,
    metrics: Arc<MetricsTracker>,
    broadcaster: Arc<WsBroadcaster>,
) -> anyhow::Result<()> {
    let server = GelfServer::new(port, repository, metrics, broadcaster).await?;
    server.run().await
}
