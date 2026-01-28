use axum::{
    extract::{ConnectInfo, State},
    http::StatusCode,
    routing::post,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::TcpListener;
use tower_http::cors::{Any, CorsLayer};
use tracing::{error, info};

use opentelemetry_proto::tonic::collector::logs::v1::ExportLogsServiceRequest;
use opentelemetry_proto::tonic::collector::trace::v1::ExportTraceServiceRequest;

use super::converter::{convert_resource_logs, convert_resource_spans};
use super::repository::SpanRepository;
use crate::db::repository::LogRepository;
use crate::realtime::{MetricsTracker, WsBroadcaster};

/// Shared state for OTLP HTTP handlers
#[derive(Clone)]
pub struct OtlpHttpState {
    pub span_repository: Arc<SpanRepository>,
    pub log_repository: Arc<LogRepository>,
    pub broadcaster: Arc<WsBroadcaster>,
    pub metrics: Arc<MetricsTracker>,
}

#[derive(Debug, Serialize)]
pub struct OtlpResponse {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub partial_success: Option<PartialSuccess>,
}

#[derive(Debug, Serialize)]
pub struct PartialSuccess {
    pub rejected_spans: i64,
    pub error_message: String,
}

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

/// Handle OTLP traces via HTTP/JSON
pub async fn handle_traces(
    State(state): State<OtlpHttpState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Json(request): Json<ExportTraceServiceRequest>,
) -> Result<Json<OtlpResponse>, (StatusCode, Json<ErrorResponse>)> {
    let source_ip = addr.ip().to_string();
    let spans = convert_resource_spans(&request.resource_spans, &source_ip);

    if spans.is_empty() {
        return Ok(Json(OtlpResponse {
            partial_success: None,
        }));
    }

    // Record metrics
    for span in &spans {
        state.metrics.record_span(span).await;
    }

    // Broadcast spans to WebSocket clients
    for span in &spans {
        state.broadcaster.broadcast_span(span.clone());
    }

    // Store spans in database
    match state.span_repository.insert_spans(&spans).await {
        Ok(ids) => {
            info!("Stored {} spans via OTLP HTTP", ids.len());
            Ok(Json(OtlpResponse {
                partial_success: None,
            }))
        }
        Err(e) => {
            error!("Failed to store spans: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: format!("Failed to store spans: {}", e),
                }),
            ))
        }
    }
}

/// Handle OTLP logs via HTTP/JSON
pub async fn handle_logs(
    State(state): State<OtlpHttpState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Json(request): Json<ExportLogsServiceRequest>,
) -> Result<Json<OtlpResponse>, (StatusCode, Json<ErrorResponse>)> {
    let source_ip = addr.ip().to_string();
    let logs = convert_resource_logs(&request.resource_logs, &source_ip);

    if logs.is_empty() {
        return Ok(Json(OtlpResponse {
            partial_success: None,
        }));
    }

    // Process each log
    for log in &logs {
        // Record metrics
        state.metrics.record_log(log).await;

        // Broadcast to WebSocket clients
        state.broadcaster.broadcast_log(log.clone());
    }

    // Store logs in database
    match state.log_repository.insert_logs(&logs).await {
        Ok(ids) => {
            info!("Stored {} logs via OTLP HTTP", ids.len());
            Ok(Json(OtlpResponse {
                partial_success: None,
            }))
        }
        Err(e) => {
            error!("Failed to store logs: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: format!("Failed to store logs: {}", e),
                }),
            ))
        }
    }
}

/// Create the OTLP HTTP router
pub fn create_otlp_router(
    span_repository: Arc<SpanRepository>,
    log_repository: Arc<LogRepository>,
    broadcaster: Arc<WsBroadcaster>,
    metrics: Arc<MetricsTracker>,
) -> Router {
    let state = OtlpHttpState {
        span_repository,
        log_repository,
        broadcaster,
        metrics,
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        .route("/v1/traces", post(handle_traces))
        .route("/v1/logs", post(handle_logs))
        .layer(cors)
        .with_state(state)
}

/// Start the OTLP HTTP server
pub async fn start_http_server(
    port: u16,
    span_repository: Arc<SpanRepository>,
    log_repository: Arc<LogRepository>,
    broadcaster: Arc<WsBroadcaster>,
    metrics: Arc<MetricsTracker>,
) -> anyhow::Result<()> {
    let router = create_otlp_router(span_repository, log_repository, broadcaster, metrics);

    let addr = format!("0.0.0.0:{}", port);
    let listener = TcpListener::bind(&addr).await?;
    info!("OTLP HTTP server listening on {}", addr);

    axum::serve(
        listener,
        router.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await?;

    Ok(())
}
