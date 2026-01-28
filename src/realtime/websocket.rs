use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::Response,
};
use futures::{SinkExt, StreamExt};
use serde::Serialize;
use std::sync::Arc;
use tokio::sync::broadcast;
use tracing::{error, info};

use crate::db::models::LogEntry;
use crate::otlp::Span;

/// Message sent to WebSocket clients
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type")]
pub enum WsMessage {
    /// New log entry
    #[serde(rename = "log")]
    Log { data: LogEntry },
    /// New span (trace)
    #[serde(rename = "span")]
    Span { data: Span },
    /// Metrics update
    #[serde(rename = "metrics")]
    Metrics { data: super::metrics::RealtimeMetrics },
    /// Connection established
    #[serde(rename = "connected")]
    Connected { message: String },
    /// Error message
    #[serde(rename = "error")]
    Error { message: String },
}

/// Shared state for WebSocket connections
pub struct WsBroadcaster {
    sender: broadcast::Sender<WsMessage>,
}

impl WsBroadcaster {
    pub fn new(capacity: usize) -> Arc<Self> {
        let (sender, _) = broadcast::channel(capacity);
        Arc::new(Self { sender })
    }

    /// Broadcast a log entry to all connected clients
    pub fn broadcast_log(&self, log: LogEntry) {
        let _ = self.sender.send(WsMessage::Log { data: log });
    }

    /// Broadcast a span to all connected clients
    pub fn broadcast_span(&self, span: Span) {
        let _ = self.sender.send(WsMessage::Span { data: span });
    }

    /// Broadcast metrics to all connected clients
    pub fn broadcast_metrics(&self, metrics: super::metrics::RealtimeMetrics) {
        let _ = self.sender.send(WsMessage::Metrics { data: metrics });
    }

    /// Get a receiver for WebSocket messages
    pub fn subscribe(&self) -> broadcast::Receiver<WsMessage> {
        self.sender.subscribe()
    }

    /// Get the number of active subscribers
    pub fn subscriber_count(&self) -> usize {
        self.sender.len()
    }
}

/// WebSocket upgrade handler
#[allow(dead_code)]
pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(broadcaster): State<Arc<WsBroadcaster>>,
) -> Response {
    ws.on_upgrade(move |socket| handle_socket(socket, broadcaster))
}

/// Handle an individual WebSocket connection
#[allow(dead_code)]
async fn handle_socket(socket: WebSocket, broadcaster: Arc<WsBroadcaster>) {
    let (mut sender, mut receiver) = socket.split();

    // Subscribe to broadcast channel
    let mut rx = broadcaster.subscribe();

    // Send connected message
    let connected_msg = WsMessage::Connected {
        message: "Connected to Kartex log stream".to_string(),
    };
    if let Ok(json) = serde_json::to_string(&connected_msg) {
        let _ = sender.send(Message::Text(json)).await;
    }

    info!("WebSocket client connected. Total clients: {}", broadcaster.subscriber_count());

    // Spawn task to handle incoming messages (for keep-alive pings)
    let mut recv_task = tokio::spawn(async move {
        while let Some(result) = receiver.next().await {
            match result {
                Ok(Message::Ping(data)) => {
                    // Pong is handled automatically by axum
                    let _ = data;
                }
                Ok(Message::Close(_)) => {
                    break;
                }
                Err(e) => {
                    error!("WebSocket receive error: {}", e);
                    break;
                }
                _ => {}
            }
        }
    });

    // Send broadcast messages to client
    let mut send_task = tokio::spawn(async move {
        loop {
            match rx.recv().await {
                Ok(msg) => {
                    if let Ok(json) = serde_json::to_string(&msg) {
                        if sender.send(Message::Text(json)).await.is_err() {
                            break;
                        }
                    }
                }
                Err(broadcast::error::RecvError::Lagged(n)) => {
                    // Client is too slow, skip messages
                    let error_msg = WsMessage::Error {
                        message: format!("Skipped {} messages due to slow connection", n),
                    };
                    if let Ok(json) = serde_json::to_string(&error_msg) {
                        let _ = sender.send(Message::Text(json)).await;
                    }
                }
                Err(broadcast::error::RecvError::Closed) => {
                    break;
                }
            }
        }
    });

    // Wait for either task to complete
    tokio::select! {
        _ = &mut recv_task => {
            send_task.abort();
        }
        _ = &mut send_task => {
            recv_task.abort();
        }
    }

    info!("WebSocket client disconnected");
}

/// Background task to broadcast metrics periodically
pub async fn metrics_broadcaster_task(
    broadcaster: Arc<WsBroadcaster>,
    metrics: Arc<super::metrics::MetricsTracker>,
    interval_secs: u64,
) {
    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(interval_secs));

    loop {
        interval.tick().await;

        let current_metrics = metrics.get_metrics().await;
        broadcaster.broadcast_metrics(current_metrics);
    }
}
