use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, Query, State, Extension,
    },
    http::StatusCode,
    response::Response,
    Json,
};
use chrono::{DateTime, Utc};
use futures::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::collections::HashMap;
use tokio::sync::broadcast;
use tracing::{error, info};

use super::AppState;
use super::auth::AuthenticatedUser;
use crate::db::models::{LogEntry, LogLevel, LogStats};
use crate::db::dashboard::{
    Dashboard, Widget, WidgetType, WidgetConfig, LayoutItem,
    WidgetDataRequest, WidgetDataResponse, WidgetData, CustomMetricType,
};
use crate::otlp::{TraceDetail, TraceQueryParams, TraceSummary};
use crate::realtime::{AlertRule, RealtimeMetrics, WsMessage};

#[derive(Debug, Deserialize)]
pub struct LogQueryParams {
    pub level: Option<String>,
    pub service: Option<String>,
    pub start_time: Option<DateTime<Utc>>,
    pub end_time: Option<DateTime<Utc>>,
    pub search: Option<String>,
    /// Enable regex search mode
    #[serde(default)]
    pub regex: bool,
    /// Field to search with regex (message, service, exception). Defaults to message.
    pub regex_field: Option<String>,
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
            params.regex,
            params.regex_field,
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

// ===== Dashboard Handlers =====

#[derive(Debug, Serialize)]
pub struct DashboardsResponse {
    pub dashboards: Vec<Dashboard>,
    pub count: usize,
}

#[derive(Debug, Serialize)]
pub struct CreateDashboardResponse {
    pub id: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateDashboardRequest {
    pub name: String,
    #[serde(default)]
    pub is_default: bool,
    #[serde(default)]
    pub layout: Vec<LayoutItem>,
    #[serde(default)]
    pub widgets: Vec<Widget>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateDashboardRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_default: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub layout: Option<Vec<LayoutItem>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub widgets: Option<Vec<Widget>>,
}

pub async fn get_dashboards(
    State(state): State<AppState>,
    Extension(user): Extension<AuthenticatedUser>,
) -> Result<Json<DashboardsResponse>, (StatusCode, Json<ErrorResponse>)> {
    match state.dashboard_repository.get_by_user(&user.username).await {
        Ok(dashboards) => {
            let count = dashboards.len();
            Ok(Json(DashboardsResponse { dashboards, count }))
        }
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: e.to_string(),
            }),
        )),
    }
}

pub async fn get_dashboard(
    State(state): State<AppState>,
    Extension(user): Extension<AuthenticatedUser>,
    Path(id): Path<String>,
) -> Result<Json<Dashboard>, (StatusCode, Json<ErrorResponse>)> {
    match state
        .dashboard_repository
        .get_by_id_and_user(&id, &user.username)
        .await
    {
        Ok(Some(dashboard)) => Ok(Json(dashboard)),
        Ok(None) => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Dashboard not found".to_string(),
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

pub async fn get_default_dashboard(
    State(state): State<AppState>,
    Extension(user): Extension<AuthenticatedUser>,
) -> Result<Json<Dashboard>, (StatusCode, Json<ErrorResponse>)> {
    match state
        .dashboard_repository
        .get_or_create_default(&user.username)
        .await
    {
        Ok(dashboard) => Ok(Json(dashboard)),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: e.to_string(),
            }),
        )),
    }
}

pub async fn create_dashboard(
    State(state): State<AppState>,
    Extension(user): Extension<AuthenticatedUser>,
    Json(req): Json<CreateDashboardRequest>,
) -> Result<Json<CreateDashboardResponse>, (StatusCode, Json<ErrorResponse>)> {
    let mut dashboard = Dashboard::new(user.username.clone(), req.name);
    dashboard.is_default = req.is_default;
    dashboard.layout = req.layout;
    dashboard.widgets = req.widgets;

    // If this is being set as default, unset other defaults first
    if dashboard.is_default {
        let _ = state.dashboard_repository.set_as_default("", &user.username).await;
    }

    match state.dashboard_repository.create(dashboard).await {
        Ok(id) => Ok(Json(CreateDashboardResponse { id })),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: e.to_string(),
            }),
        )),
    }
}

pub async fn update_dashboard(
    State(state): State<AppState>,
    Extension(user): Extension<AuthenticatedUser>,
    Path(id): Path<String>,
    Json(req): Json<UpdateDashboardRequest>,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    // First get the existing dashboard
    let existing = match state
        .dashboard_repository
        .get_by_id_and_user(&id, &user.username)
        .await
    {
        Ok(Some(d)) => d,
        Ok(None) => {
            return Err((
                StatusCode::NOT_FOUND,
                Json(ErrorResponse {
                    error: "Dashboard not found".to_string(),
                }),
            ))
        }
        Err(e) => {
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: e.to_string(),
                }),
            ))
        }
    };

    // Apply updates
    let mut updated = existing;
    if let Some(name) = req.name {
        updated.name = name;
    }
    if let Some(is_default) = req.is_default {
        updated.is_default = is_default;
    }
    if let Some(layout) = req.layout {
        updated.layout = layout;
    }
    if let Some(widgets) = req.widgets {
        updated.widgets = widgets;
    }

    // If setting as default, handle other defaults
    if updated.is_default {
        let _ = state.dashboard_repository.set_as_default(&id, &user.username).await;
    }

    match state
        .dashboard_repository
        .update(&id, &user.username, updated)
        .await
    {
        Ok(true) => Ok(StatusCode::OK),
        Ok(false) => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Dashboard not found".to_string(),
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

pub async fn delete_dashboard(
    State(state): State<AppState>,
    Extension(user): Extension<AuthenticatedUser>,
    Path(id): Path<String>,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    match state
        .dashboard_repository
        .delete(&id, &user.username)
        .await
    {
        Ok(true) => Ok(StatusCode::NO_CONTENT),
        Ok(false) => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Dashboard not found".to_string(),
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

// ===== Widget Data Endpoint =====

pub async fn get_widget_data(
    State(state): State<AppState>,
    Json(req): Json<WidgetDataRequest>,
) -> Result<Json<WidgetDataResponse>, (StatusCode, Json<ErrorResponse>)> {
    let mut results = Vec::new();

    for widget_query in req.widgets {
        let data = fetch_widget_data(&state, &widget_query.widget_type, &widget_query.config).await;

        match data {
            Ok(value) => results.push(WidgetData {
                widget_id: widget_query.widget_id,
                data: value,
                error: None,
            }),
            Err(e) => results.push(WidgetData {
                widget_id: widget_query.widget_id,
                data: serde_json::Value::Null,
                error: Some(e.to_string()),
            }),
        }
    }

    Ok(Json(WidgetDataResponse { data: results }))
}

async fn fetch_widget_data(
    state: &AppState,
    widget_type: &WidgetType,
    config: &WidgetConfig,
) -> anyhow::Result<serde_json::Value> {
    match (widget_type, config) {
        (WidgetType::LogCount, WidgetConfig::LogCount { level, service, time_range }) => {
            let start_time = if *time_range > 0 {
                Some(Utc::now() - chrono::Duration::seconds(*time_range as i64))
            } else {
                None
            };

            let log_level = level.as_ref().and_then(|l| match l.to_uppercase().as_str() {
                "TRACE" => Some(LogLevel::Trace),
                "DEBUG" => Some(LogLevel::Debug),
                "INFO" => Some(LogLevel::Info),
                "WARN" => Some(LogLevel::Warn),
                "ERROR" => Some(LogLevel::Error),
                "FATAL" => Some(LogLevel::Fatal),
                _ => None,
            });

            let logs = state
                .repository
                .query_logs(log_level, service.clone(), start_time, None, None, false, None, 0, 0)
                .await?;

            Ok(serde_json::json!({ "count": logs.len() }))
        }

        (WidgetType::ErrorRateChart, WidgetConfig::ErrorRateChart { time_range, bucket_size, service }) => {
            let start_time = Utc::now() - chrono::Duration::seconds(*time_range as i64);
            let bucket_size_secs = *bucket_size as i64;

            // Fetch all logs in the time range
            let all_logs = state
                .repository
                .query_logs(None, service.clone(), Some(start_time), None, None, false, None, 10000, 0)
                .await?;

            // Bucket the logs by time
            let mut buckets: HashMap<i64, (u64, u64)> = HashMap::new(); // (total, errors)

            for log in &all_logs {
                let bucket_key = (log.timestamp.timestamp() / bucket_size_secs) * bucket_size_secs;
                let entry = buckets.entry(bucket_key).or_insert((0, 0));
                entry.0 += 1;
                if log.level == LogLevel::Error || log.level == LogLevel::Fatal {
                    entry.1 += 1;
                }
            }

            // Convert to sorted array
            let mut data_points: Vec<_> = buckets
                .into_iter()
                .map(|(timestamp, (total, errors))| {
                    let error_rate = if total > 0 {
                        errors as f64 / total as f64
                    } else {
                        0.0
                    };
                    serde_json::json!({
                        "timestamp": timestamp * 1000, // Convert to milliseconds for JS
                        "total": total,
                        "errors": errors,
                        "error_rate": error_rate
                    })
                })
                .collect();

            data_points.sort_by_key(|v| v["timestamp"].as_i64().unwrap_or(0));

            Ok(serde_json::json!({ "data": data_points }))
        }

        (WidgetType::RecentLogs, WidgetConfig::RecentLogs { limit, level, service }) => {
            let log_level = level.as_ref().and_then(|l| match l.to_uppercase().as_str() {
                "TRACE" => Some(LogLevel::Trace),
                "DEBUG" => Some(LogLevel::Debug),
                "INFO" => Some(LogLevel::Info),
                "WARN" => Some(LogLevel::Warn),
                "ERROR" => Some(LogLevel::Error),
                "FATAL" => Some(LogLevel::Fatal),
                _ => None,
            });

            let logs = state
                .repository
                .query_logs(log_level, service.clone(), None, None, None, false, None, *limit as i64, 0)
                .await?;

            Ok(serde_json::json!({ "logs": logs }))
        }

        (WidgetType::TraceLatencyHistogram, WidgetConfig::TraceLatencyHistogram { time_range, service, buckets }) => {
            let start_time = Utc::now() - chrono::Duration::seconds(*time_range as i64);

            let params = TraceQueryParams {
                service: service.clone(),
                status: None,
                start_time: Some(start_time),
                end_time: None,
                min_duration_ms: None,
                max_duration_ms: None,
                search: None,
                limit: 1000,
                skip: 0,
            };

            let traces = state.span_repository.query_traces(params).await?;

            if traces.is_empty() {
                return Ok(serde_json::json!({ "histogram": [], "stats": { "min": 0, "max": 0, "avg": 0, "p50": 0, "p95": 0, "p99": 0 } }));
            }

            // Calculate latency distribution
            let mut durations: Vec<f64> = traces.iter().map(|t| t.duration_ms).collect();
            durations.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

            let min_duration = durations.first().copied().unwrap_or(0.0);
            let max_duration = durations.last().copied().unwrap_or(0.0);
            let avg_duration = durations.iter().sum::<f64>() / durations.len() as f64;

            // Calculate percentiles
            let p50_idx = (durations.len() as f64 * 0.50) as usize;
            let p95_idx = (durations.len() as f64 * 0.95) as usize;
            let p99_idx = (durations.len() as f64 * 0.99) as usize;

            let p50 = durations.get(p50_idx).copied().unwrap_or(0.0);
            let p95 = durations.get(p95_idx.min(durations.len() - 1)).copied().unwrap_or(0.0);
            let p99 = durations.get(p99_idx.min(durations.len() - 1)).copied().unwrap_or(0.0);

            // Create histogram buckets
            let bucket_size = (max_duration - min_duration) / *buckets as f64;
            let mut histogram: Vec<serde_json::Value> = Vec::new();

            if bucket_size > 0.0 {
                for i in 0..*buckets {
                    let bucket_start = min_duration + (i as f64 * bucket_size);
                    let bucket_end = bucket_start + bucket_size;
                    let count = durations
                        .iter()
                        .filter(|&&d| d >= bucket_start && (i == *buckets - 1 || d < bucket_end))
                        .count();

                    histogram.push(serde_json::json!({
                        "range": format!("{:.0}-{:.0}ms", bucket_start, bucket_end),
                        "min": bucket_start,
                        "max": bucket_end,
                        "count": count
                    }));
                }
            }

            Ok(serde_json::json!({
                "histogram": histogram,
                "stats": {
                    "min": min_duration,
                    "max": max_duration,
                    "avg": avg_duration,
                    "p50": p50,
                    "p95": p95,
                    "p99": p99,
                    "total": durations.len()
                }
            }))
        }

        (WidgetType::ServiceHealth, WidgetConfig::ServiceHealth { time_window, error_threshold }) => {
            let start_time = Utc::now() - chrono::Duration::seconds(*time_window as i64);

            // Get stats for all services
            let stats = state.repository.get_stats().await?;

            // Fetch recent logs to calculate error rates per service
            let logs = state
                .repository
                .query_logs(None, None, Some(start_time), None, None, false, None, 10000, 0)
                .await?;

            let mut service_stats: HashMap<String, (u64, u64)> = HashMap::new(); // (total, errors)

            for log in &logs {
                let entry = service_stats.entry(log.service.clone()).or_insert((0, 0));
                entry.0 += 1;
                if log.level == LogLevel::Error || log.level == LogLevel::Fatal {
                    entry.1 += 1;
                }
            }

            let services: Vec<serde_json::Value> = stats
                .counts_by_service
                .keys()
                .map(|service| {
                    let (total, errors) = service_stats.get(service).copied().unwrap_or((0, 0));
                    let error_rate = if total > 0 {
                        errors as f64 / total as f64
                    } else {
                        0.0
                    };
                    let status = if error_rate > *error_threshold {
                        "unhealthy"
                    } else if error_rate > error_threshold / 2.0 {
                        "degraded"
                    } else {
                        "healthy"
                    };

                    serde_json::json!({
                        "service": service,
                        "status": status,
                        "error_rate": error_rate,
                        "total_logs": total,
                        "error_count": errors
                    })
                })
                .collect();

            Ok(serde_json::json!({ "services": services }))
        }

        (WidgetType::CustomMetric, WidgetConfig::CustomMetric { metric_type }) => {
            let metrics = state.metrics.get_metrics().await;

            let value = match metric_type {
                CustomMetricType::LogsPerSecond => metrics.logs_per_second,
                CustomMetricType::ErrorsPerSecond => metrics.errors_per_second,
                CustomMetricType::ErrorRate => metrics.error_rate,
                CustomMetricType::LogsLastMinute => metrics.logs_last_minute as f64,
                CustomMetricType::TotalLogs => {
                    let stats = state.repository.get_stats().await?;
                    stats.total_count as f64
                }
            };

            Ok(serde_json::json!({
                "metric_type": metric_type,
                "value": value
            }))
        }

        // LiveStream widget uses WebSocket directly, no backend data needed
        (WidgetType::LiveStream, WidgetConfig::LiveStream { .. }) => {
            Ok(serde_json::json!({
                "status": "streaming",
                "message": "Data streams via WebSocket"
            }))
        }

        // Plugin widget - frontend loads and executes the plugin
        (WidgetType::Plugin, WidgetConfig::Plugin { url, plugin_type, plugin_config, .. }) => {
            Ok(serde_json::json!({
                "status": "plugin",
                "url": url,
                "plugin_type": plugin_type,
                "plugin_config": plugin_config,
                "message": "Plugin loaded by frontend"
            }))
        }

        _ => Err(anyhow::anyhow!("Widget type and config mismatch")),
    }
}
