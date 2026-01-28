use std::sync::Arc;
use tokio::net::UdpSocket;
use tracing::{error, info, warn};

use super::parser::parse_syslog_message;
use crate::db::LogBatcher;
use crate::realtime::{MetricsTracker, WsBroadcaster};

/// Syslog UDP Server (RFC 3164/5424)
pub struct SyslogUdpServer {
    socket: UdpSocket,
    batcher: LogBatcher,
    metrics: Arc<MetricsTracker>,
    broadcaster: Arc<WsBroadcaster>,
    max_message_size: usize,
}

impl SyslogUdpServer {
    pub async fn new(
        port: u16,
        batcher: LogBatcher,
        metrics: Arc<MetricsTracker>,
        broadcaster: Arc<WsBroadcaster>,
        max_message_size: usize,
    ) -> anyhow::Result<Self> {
        let addr = format!("0.0.0.0:{}", port);
        let socket = UdpSocket::bind(&addr).await?;
        info!("Syslog UDP server listening on {}", addr);

        Ok(Self {
            socket,
            batcher,
            metrics,
            broadcaster,
            max_message_size,
        })
    }

    pub async fn run(self) -> anyhow::Result<()> {
        let mut buf = vec![0u8; self.max_message_size];

        loop {
            match self.socket.recv_from(&mut buf).await {
                Ok((len, addr)) => {
                    let packet = buf[..len].to_vec();
                    let source_ip = addr.ip().to_string();

                    match parse_syslog_message(&packet, source_ip.clone()) {
                        Ok(log_entry) => {
                            let level = format!("{:?}", log_entry.level).to_uppercase();

                            // Record metrics
                            self.metrics.record_log_by_level(&level).await;

                            // Broadcast to WebSocket clients
                            self.broadcaster.broadcast_log(log_entry.clone());

                            // Add to batch queue (non-blocking)
                            if let Err(e) = self.batcher.try_add(log_entry) {
                                error!("Failed to queue syslog from {}: {}", source_ip, e);
                            }
                        }
                        Err(e) => {
                            warn!("Failed to parse syslog message from {}: {}", addr, e);
                        }
                    }
                }
                Err(e) => {
                    error!("Error receiving syslog UDP packet: {}", e);
                }
            }
        }
    }
}

/// Start the Syslog UDP server
pub async fn start_syslog_udp_server(
    port: u16,
    batcher: LogBatcher,
    metrics: Arc<MetricsTracker>,
    broadcaster: Arc<WsBroadcaster>,
    max_message_size: usize,
) -> anyhow::Result<()> {
    let server =
        SyslogUdpServer::new(port, batcher, metrics, broadcaster, max_message_size).await?;
    server.run().await
}
