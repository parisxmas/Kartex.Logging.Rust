use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, BufReader};
use tokio::net::{TcpListener, TcpStream};
use tracing::{error, info, warn};

use super::parser::{parse_octet_counted, parse_syslog_message};
use crate::db::LogBatcher;
use crate::realtime::{MetricsTracker, WsBroadcaster};

/// Syslog TCP Server (RFC 5425 with octet-counting and newline framing)
pub struct SyslogTcpServer {
    listener: TcpListener,
    batcher: LogBatcher,
    metrics: Arc<MetricsTracker>,
    broadcaster: Arc<WsBroadcaster>,
    max_message_size: usize,
}

impl SyslogTcpServer {
    pub async fn new(
        port: u16,
        batcher: LogBatcher,
        metrics: Arc<MetricsTracker>,
        broadcaster: Arc<WsBroadcaster>,
        max_message_size: usize,
    ) -> anyhow::Result<Self> {
        let addr = format!("0.0.0.0:{}", port);
        let listener = TcpListener::bind(&addr).await?;
        info!("Syslog TCP server listening on {}", addr);

        Ok(Self {
            listener,
            batcher,
            metrics,
            broadcaster,
            max_message_size,
        })
    }

    pub async fn run(self) -> anyhow::Result<()> {
        loop {
            match self.listener.accept().await {
                Ok((stream, addr)) => {
                    let source_ip = addr.ip().to_string();
                    let batcher = self.batcher.clone();
                    let metrics = self.metrics.clone();
                    let broadcaster = self.broadcaster.clone();
                    let max_message_size = self.max_message_size;

                    tokio::spawn(async move {
                        if let Err(e) = handle_connection(
                            stream,
                            source_ip.clone(),
                            batcher,
                            metrics,
                            broadcaster,
                            max_message_size,
                        )
                        .await
                        {
                            warn!("Error handling syslog TCP connection from {}: {}", source_ip, e);
                        }
                    });
                }
                Err(e) => {
                    error!("Error accepting syslog TCP connection: {}", e);
                }
            }
        }
    }
}

/// Handle a single TCP connection
async fn handle_connection(
    stream: TcpStream,
    source_ip: String,
    batcher: LogBatcher,
    metrics: Arc<MetricsTracker>,
    broadcaster: Arc<WsBroadcaster>,
    max_message_size: usize,
) -> anyhow::Result<()> {
    let mut reader = BufReader::new(stream);

    // Peek at the first byte to determine framing method
    let mut peek_buf = [0u8; 1];
    let n = reader.read(&mut peek_buf).await?;
    if n == 0 {
        return Ok(()); // Connection closed
    }

    // Check if first byte is a digit (octet-counting) or '<' (newline framing)
    let use_octet_counting = peek_buf[0].is_ascii_digit();

    if use_octet_counting {
        handle_octet_counted(&mut reader, &peek_buf, source_ip, batcher, metrics, broadcaster, max_message_size).await
    } else {
        handle_newline_framed(&mut reader, &peek_buf, source_ip, batcher, metrics, broadcaster, max_message_size).await
    }
}

/// Handle octet-counted framing (RFC 5425)
/// Format: MSG-LEN SP MSG MSG-LEN SP MSG ...
async fn handle_octet_counted(
    reader: &mut BufReader<TcpStream>,
    first_byte: &[u8],
    source_ip: String,
    batcher: LogBatcher,
    metrics: Arc<MetricsTracker>,
    broadcaster: Arc<WsBroadcaster>,
    max_message_size: usize,
) -> anyhow::Result<()> {
    let mut buffer = Vec::with_capacity(max_message_size);
    buffer.extend_from_slice(first_byte);

    loop {
        // Read more data
        let mut temp_buf = vec![0u8; 4096];
        match reader.read(&mut temp_buf).await {
            Ok(0) => break, // EOF
            Ok(n) => buffer.extend_from_slice(&temp_buf[..n]),
            Err(e) => {
                error!("Error reading from syslog TCP stream: {}", e);
                break;
            }
        }

        // Try to parse complete messages
        while !buffer.is_empty() {
            match parse_octet_counted(&buffer) {
                Ok((end_pos, msg_bytes)) => {
                    // Process the message
                    process_message(
                        msg_bytes,
                        source_ip.clone(),
                        &batcher,
                        metrics.clone(),
                        broadcaster.clone(),
                    )
                    .await;

                    // Remove processed data from buffer
                    buffer.drain(..end_pos);
                }
                Err(_) => {
                    // Incomplete message, wait for more data
                    break;
                }
            }
        }
    }

    Ok(())
}

/// Handle newline-delimited framing (common fallback)
async fn handle_newline_framed(
    reader: &mut BufReader<TcpStream>,
    first_byte: &[u8],
    source_ip: String,
    batcher: LogBatcher,
    metrics: Arc<MetricsTracker>,
    broadcaster: Arc<WsBroadcaster>,
    max_message_size: usize,
) -> anyhow::Result<()> {
    // Create a line buffer starting with the first byte
    let mut line = String::with_capacity(max_message_size);
    if !first_byte.is_empty() {
        line.push(first_byte[0] as char);
    }

    // Read the rest of the first line
    let mut remaining = String::new();
    reader.read_line(&mut remaining).await?;
    line.push_str(&remaining);

    // Process first message
    if !line.trim().is_empty() {
        process_message(
            line.trim().as_bytes(),
            source_ip.clone(),
            &batcher,
            metrics.clone(),
            broadcaster.clone(),
        )
        .await;
    }

    // Continue reading lines
    loop {
        line.clear();
        match reader.read_line(&mut line).await {
            Ok(0) => break, // EOF
            Ok(_) => {
                let trimmed = line.trim();
                if !trimmed.is_empty() {
                    process_message(
                        trimmed.as_bytes(),
                        source_ip.clone(),
                        &batcher,
                        metrics.clone(),
                        broadcaster.clone(),
                    )
                    .await;
                }
            }
            Err(e) => {
                error!("Error reading from syslog TCP stream: {}", e);
                break;
            }
        }
    }

    Ok(())
}

/// Process a single syslog message
async fn process_message(
    data: &[u8],
    source_ip: String,
    batcher: &LogBatcher,
    metrics: Arc<MetricsTracker>,
    broadcaster: Arc<WsBroadcaster>,
) {
    match parse_syslog_message(data, source_ip.clone()) {
        Ok(log_entry) => {
            let level = format!("{:?}", log_entry.level).to_uppercase();

            // Record metrics
            metrics.record_log_by_level(&level).await;

            // Broadcast to WebSocket clients
            broadcaster.broadcast_log(log_entry.clone());

            // Add to batch queue (non-blocking)
            if let Err(e) = batcher.try_add(log_entry) {
                error!("Failed to queue syslog from {}: {}", source_ip, e);
            }
        }
        Err(e) => {
            warn!("Failed to parse syslog message from {}: {}", source_ip, e);
        }
    }
}

/// Start the Syslog TCP server
pub async fn start_syslog_tcp_server(
    port: u16,
    batcher: LogBatcher,
    metrics: Arc<MetricsTracker>,
    broadcaster: Arc<WsBroadcaster>,
    max_message_size: usize,
) -> anyhow::Result<()> {
    let server =
        SyslogTcpServer::new(port, batcher, metrics, broadcaster, max_message_size).await?;
    server.run().await
}
