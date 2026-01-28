use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, Query, State,
    },
    http::StatusCode,
    response::Response,
    Json,
};
use chrono::{DateTime, Utc};
use futures::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::broadcast;
use tracing::{error, info};

use super::AppState;
use crate::db::models::{LogEntry, LogLevel, LogStats};
use crate::otlp::{TraceDetail, TraceQueryParams, TraceSummary};
use crate::realtime::{AlertRule, RealtimeMetrics, WsMessage};

#[derive(Debug, Deserialize)]
pub struct LogQueryParams {
    pub level: Option<String>,
    pub service: Option<String>,
    pub start_time: Option<DateTime<Utc>>,
    pub end_time: Option<DateTime<Utc>>,
    pub search: Option<String>,
    #[serde(default = "default_limit")]
    pub limit: i64,
    #[serde(default)]
    pub skip: u64,
}

fn default_limit() -> i64 {
    50
}

#[derive(Debug, Serialize)]
pub struct LogsResponse {
    pub logs: Vec<LogEntry>,
    pub count: usize,
}

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

pub async fn get_logs(
    State(state): State<AppState>,
    Query(params): Query<LogQueryParams>,
) -> Result<Json<LogsResponse>, (StatusCode, Json<ErrorResponse>)> {
    let level = params.level.and_then(|l| match l.to_uppercase().as_str() {
        "TRACE" => Some(LogLevel::Trace),
        "DEBUG" => Some(LogLevel::Debug),
        "INFO" => Some(LogLevel::Info),
        "WARN" => Some(LogLevel::Warn),
        "ERROR" => Some(LogLevel::Error),
        "FATAL" => Some(LogLevel::Fatal),
        _ => None,
    });

    let limit = params.limit.min(1000).max(1);

    match state
        .repository
        .query_logs(
            level,
            params.service,
            params.start_time,
            params.end_time,
            params.search,
            limit,
            params.skip,
        )
        .await
    {
        Ok(logs) => {
            let count = logs.len();
            Ok(Json(LogsResponse { logs, count }))
        }
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: e.to_string(),
            }),
        )),
    }
}

pub async fn get_log_by_id(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<LogEntry>, (StatusCode, Json<ErrorResponse>)> {
    match state.repository.get_log_by_id(&id).await {
        Ok(Some(log)) => Ok(Json(log)),
        Ok(None) => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Log not found".to_string(),
            }),
        )),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: e.to_string(),
            }),
        )),
    }
}

pub async fn get_stats(
    State(state): State<AppState>,
) -> Result<Json<LogStats>, (StatusCode, Json<ErrorResponse>)> {
    match state.repository.get_stats().await {
        Ok(stats) => Ok(Json(stats)),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: e.to_string(),
            }),
        )),
    }
}

pub async fn health_check() -> StatusCode {
    StatusCode::OK
}

// ===== Realtime Metrics =====

pub async fn get_realtime_metrics(
    State(state): State<AppState>,
) -> Json<RealtimeMetrics> {
    let metrics = state.metrics.get_metrics().await;
    Json(metrics)
}

// ===== WebSocket Handler =====

pub async fn ws_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> Response {
    ws.on_upgrade(move |socket| handle_socket(socket, state.broadcaster))
}

async fn handle_socket(socket: WebSocket, broadcaster: Arc<crate::realtime::WsBroadcaster>) {
    let (mut sender, mut receiver) = socket.split();

    // Subscribe to broadcast channel
    let mut rx = broadcaster.subscribe();

    // Send connected message
    let connected_msg = WsMessage::Connected {
        message: "Connected to Kartex log stream".to_string(),
    };
    if let Ok(json) = serde_json::to_string(&connected_msg) {
        let _ = sender.send(Message::Text(json.into())).await;
    }

    info!(
        "WebSocket client connected. Total clients: {}",
        broadcaster.subscriber_count()
    );

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
                        if sender.send(Message::Text(json.into())).await.is_err() {
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
                        let _ = sender.send(Message::Text(json.into())).await;
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

// ===== Alert Management =====

pub async fn get_alerts(
    State(state): State<AppState>,
) -> Result<Json<Vec<AlertRule>>, (StatusCode, Json<ErrorResponse>)> {
    match state.alert_manager.get_alerts().await {
        Ok(alerts) => Ok(Json(alerts)),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: e.to_string(),
            }),
        )),
    }
}

pub async fn get_alert(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<AlertRule>, (StatusCode, Json<ErrorResponse>)> {
    match state.alert_manager.get_alert(&id).await {
        Ok(Some(alert)) => Ok(Json(alert)),
        Ok(None) => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Alert not found".to_string(),
            }),
        )),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: e.to_string(),
            }),
        )),
    }
}

pub async fn create_alert(
    State(state): State<AppState>,
    Json(alert): Json<AlertRule>,
) -> Result<Json<CreateAlertResponse>, (StatusCode, Json<ErrorResponse>)> {
    match state.alert_manager.create_alert(alert).await {
        Ok(id) => Ok(Json(CreateAlertResponse { id })),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: e.to_string(),
            }),
        )),
    }
}

#[derive(Serialize)]
pub struct CreateAlertResponse {
    pub id: String,
}

pub async fn update_alert(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(alert): Json<AlertRule>,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    match state.alert_manager.update_alert(&id, alert).await {
        Ok(true) => Ok(StatusCode::OK),
        Ok(false) => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Alert not found".to_string(),
            }),
        )),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: e.to_string(),
            }),
        )),
    }
}

pub async fn delete_alert(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    match state.alert_manager.delete_alert(&id).await {
        Ok(true) => Ok(StatusCode::NO_CONTENT),
        Ok(false) => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Alert not found".to_string(),
            }),
        )),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: e.to_string(),
            }),
        )),
    }
}

// ===== Trace Handlers =====

#[derive(Debug, Serialize)]
pub struct TracesResponse {
    pub traces: Vec<TraceSummary>,
    pub count: usize,
}

pub async fn get_traces(
    State(state): State<AppState>,
    Query(params): Query<TraceQueryParams>,
) -> Result<Json<TracesResponse>, (StatusCode, Json<ErrorResponse>)> {
    match state.span_repository.query_traces(params).await {
        Ok(traces) => {
            let count = traces.len();
            Ok(Json(TracesResponse { traces, count }))
        }
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: e.to_string(),
            }),
        )),
    }
}

pub async fn get_trace_by_id(
    State(state): State<AppState>,
    Path(trace_id): Path<String>,
) -> Result<Json<TraceDetail>, (StatusCode, Json<ErrorResponse>)> {
    match state.span_repository.get_trace_detail(&trace_id).await {
        Ok(Some(trace)) => Ok(Json(trace)),
        Ok(None) => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Trace not found".to_string(),
            }),
        )),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: e.to_string(),
            }),
        )),
    }
}

pub async fn get_trace_for_log(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<TraceDetail>, (StatusCode, Json<ErrorResponse>)> {
    match state.span_repository.get_trace_for_log(&id).await {
        Ok(Some(trace)) => Ok(Json(trace)),
        Ok(None) => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "No trace found for this log entry".to_string(),
            }),
        )),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: e.to_string(),
            }),
        )),
    }
}
