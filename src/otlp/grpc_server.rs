use std::net::SocketAddr;
use std::sync::Arc;
use tonic::{transport::Server, Request, Response, Status};
use tracing::{error, info};

use opentelemetry_proto::tonic::collector::logs::v1::{
    logs_service_server::{LogsService, LogsServiceServer},
    ExportLogsServiceRequest, ExportLogsServiceResponse,
};
use opentelemetry_proto::tonic::collector::trace::v1::{
    trace_service_server::{TraceService, TraceServiceServer},
    ExportTraceServiceRequest, ExportTraceServiceResponse,
};

use super::converter::{convert_resource_logs, convert_resource_spans};
use super::repository::SpanRepository;
use crate::db::repository::LogRepository;
use crate::realtime::{MetricsTracker, WsBroadcaster};

/// OTLP gRPC service implementation
pub struct OtlpGrpcService {
    span_repository: Arc<SpanRepository>,
    log_repository: Arc<LogRepository>,
    broadcaster: Arc<WsBroadcaster>,
    metrics: Arc<MetricsTracker>,
}

impl OtlpGrpcService {
    pub fn new(
        span_repository: Arc<SpanRepository>,
        log_repository: Arc<LogRepository>,
        broadcaster: Arc<WsBroadcaster>,
        metrics: Arc<MetricsTracker>,
    ) -> Self {
        Self {
            span_repository,
            log_repository,
            broadcaster,
            metrics,
        }
    }
}

#[tonic::async_trait]
impl TraceService for OtlpGrpcService {
    async fn export(
        &self,
        request: Request<ExportTraceServiceRequest>,
    ) -> Result<Response<ExportTraceServiceResponse>, Status> {
        let remote_addr = request
            .remote_addr()
            .map(|a| a.ip().to_string())
            .unwrap_or_else(|| "unknown".to_string());

        let req = request.into_inner();
        let spans = convert_resource_spans(&req.resource_spans, &remote_addr);

        if spans.is_empty() {
            return Ok(Response::new(ExportTraceServiceResponse {
                partial_success: None,
            }));
        }

        // Record metrics
        for span in &spans {
            self.metrics.record_span(span).await;
        }

        // Broadcast spans to WebSocket clients
        for span in &spans {
            self.broadcaster.broadcast_span(span.clone());
        }

        // Store spans in database
        match self.span_repository.insert_spans(&spans).await {
            Ok(ids) => {
                info!("Stored {} spans via gRPC", ids.len());
            }
            Err(e) => {
                error!("Failed to store spans: {}", e);
                return Err(Status::internal(format!("Failed to store spans: {}", e)));
            }
        }

        Ok(Response::new(ExportTraceServiceResponse {
            partial_success: None,
        }))
    }
}

#[tonic::async_trait]
impl LogsService for OtlpGrpcService {
    async fn export(
        &self,
        request: Request<ExportLogsServiceRequest>,
    ) -> Result<Response<ExportLogsServiceResponse>, Status> {
        let remote_addr = request
            .remote_addr()
            .map(|a| a.ip().to_string())
            .unwrap_or_else(|| "unknown".to_string());

        let req = request.into_inner();
        let logs = convert_resource_logs(&req.resource_logs, &remote_addr);

        if logs.is_empty() {
            return Ok(Response::new(ExportLogsServiceResponse {
                partial_success: None,
            }));
        }

        // Process each log
        for log in &logs {
            // Record metrics
            self.metrics.record_log(log).await;

            // Broadcast to WebSocket clients
            self.broadcaster.broadcast_log(log.clone());
        }

        // Store logs in database
        match self.log_repository.insert_logs(&logs).await {
            Ok(ids) => {
                info!("Stored {} logs via OTLP gRPC", ids.len());
            }
            Err(e) => {
                error!("Failed to store logs: {}", e);
                return Err(Status::internal(format!("Failed to store logs: {}", e)));
            }
        }

        Ok(Response::new(ExportLogsServiceResponse {
            partial_success: None,
        }))
    }
}

/// Start the OTLP gRPC server
pub async fn start_grpc_server(
    port: u16,
    span_repository: Arc<SpanRepository>,
    log_repository: Arc<LogRepository>,
    broadcaster: Arc<WsBroadcaster>,
    metrics: Arc<MetricsTracker>,
) -> anyhow::Result<()> {
    let addr: SocketAddr = format!("0.0.0.0:{}", port).parse()?;

    let service = OtlpGrpcService::new(
        span_repository,
        log_repository,
        broadcaster,
        metrics,
    );

    info!("OTLP gRPC server listening on {}", addr);

    Server::builder()
        .add_service(TraceServiceServer::new(service.clone()))
        .add_service(LogsServiceServer::new(service))
        .serve(addr)
        .await?;

    Ok(())
}

impl Clone for OtlpGrpcService {
    fn clone(&self) -> Self {
        Self {
            span_repository: self.span_repository.clone(),
            log_repository: self.log_repository.clone(),
            broadcaster: self.broadcaster.clone(),
            metrics: self.metrics.clone(),
        }
    }
}
