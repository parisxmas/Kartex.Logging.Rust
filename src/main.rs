mod api;
mod config;
mod db;
mod gelf;
mod notifications;
mod otlp;
mod realtime;
mod syslog;
mod udp;

use std::sync::Arc;
use tokio::net::TcpListener;
use tracing::{error, info};
use tracing_subscriber::EnvFilter;

use config::Config;
use db::{BatchConfig, DbClient, DashboardRepository, LogBatcher, repository::LogRepository};
use otlp::SpanRepository;
use realtime::{AlertManager, MetricsTracker, WsBroadcaster};
use udp::UdpServer;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize logging
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env().add_directive("info".parse()?))
        .init();

    info!("Starting Kartex Logging Server...");

    // Load configuration
    let config = Config::load("config.toml")?;
    info!("Configuration loaded");

    // Connect to MongoDB
    let db_client = DbClient::with_spans_collection(
        &config.mongodb.connection_string,
        &config.mongodb.database_name,
        &config.mongodb.collection_name,
        &config.otlp.spans_collection,
    )
    .await?;
    info!("Connected to MongoDB");

    let repository = Arc::new(LogRepository::new(db_client.logs_collection.clone()));
    let span_repository = Arc::new(SpanRepository::new(
        db_client.spans_collection,
        db_client.logs_collection.clone(),
    ));
    let dashboard_repository = Arc::new(DashboardRepository::new(db_client.dashboards_collection));

    // Create log batcher for efficient batch writes
    let batch_config = BatchConfig {
        max_batch_size: config.batch.max_batch_size,
        flush_interval_ms: config.batch.flush_interval_ms,
        channel_buffer_size: config.batch.channel_buffer_size,
    };
    let log_batcher = LogBatcher::new(repository.clone(), batch_config);
    info!(
        "Log batcher initialized (batch_size: {}, flush_interval: {}ms)",
        config.batch.max_batch_size, config.batch.flush_interval_ms
    );

    // Initialize realtime components
    let metrics = MetricsTracker::new();
    let broadcaster = WsBroadcaster::new(1000); // Buffer up to 1000 messages
    let alert_manager = AlertManager::new(
        db_client.alerts_collection,
        db_client.notification_channels_collection,
        metrics.clone(),
        60, // 60 second cooldown between alerts
    );
    info!("Realtime components initialized");

    // Start UDP server
    let udp_batcher = log_batcher.clone();
    let udp_port = config.server.udp_port;
    let auth_secret = config.server.auth_secret.clone();
    let udp_metrics = metrics.clone();
    let udp_broadcaster = broadcaster.clone();

    let udp_handle = tokio::spawn(async move {
        let udp_server = UdpServer::new(udp_port, &auth_secret, udp_batcher, udp_metrics, udp_broadcaster)
            .await
            .expect("Failed to create UDP server");

        if let Err(e) = udp_server.run().await {
            error!("UDP server error: {}", e);
        }
    });

    // Start background tasks for realtime features
    let _metrics_broadcaster_handle = {
        let broadcaster = broadcaster.clone();
        let metrics = metrics.clone();
        tokio::spawn(async move {
            realtime::websocket::metrics_broadcaster_task(broadcaster, metrics, 5).await;
        })
    };

    let _alert_checker_handle = {
        let alert_manager = alert_manager.clone();
        tokio::spawn(async move {
            realtime::alerts::alert_checker_task(alert_manager, 10).await;
        })
    };

    // Spawn OTLP servers if enabled
    if config.otlp.enabled {
        if config.otlp.enable_grpc {
            let grpc_span_repo = span_repository.clone();
            let grpc_log_repo = repository.clone();
            let grpc_broadcaster = broadcaster.clone();
            let grpc_metrics = metrics.clone();
            let grpc_port = config.otlp.grpc_port;

            tokio::spawn(async move {
                if let Err(e) = otlp::start_grpc_server(
                    grpc_port,
                    grpc_span_repo,
                    grpc_log_repo,
                    grpc_broadcaster,
                    grpc_metrics,
                )
                .await
                {
                    error!("OTLP gRPC server error: {}", e);
                }
            });
        }

        if config.otlp.enable_http {
            let http_span_repo = span_repository.clone();
            let http_log_repo = repository.clone();
            let http_broadcaster = broadcaster.clone();
            let http_metrics = metrics.clone();
            let http_port = config.otlp.http_port;

            tokio::spawn(async move {
                if let Err(e) = otlp::start_http_server(
                    http_port,
                    http_span_repo,
                    http_log_repo,
                    http_broadcaster,
                    http_metrics,
                )
                .await
                {
                    error!("OTLP HTTP server error: {}", e);
                }
            });
        }
    }

    // Spawn GELF UDP server if enabled
    if config.gelf.enabled {
        let gelf_batcher = log_batcher.clone();
        let gelf_metrics = metrics.clone();
        let gelf_broadcaster = broadcaster.clone();
        let gelf_port = config.gelf.udp_port;

        tokio::spawn(async move {
            if let Err(e) = gelf::server::start_gelf_server(
                gelf_port,
                gelf_batcher,
                gelf_metrics,
                gelf_broadcaster,
            )
            .await
            {
                error!("GELF UDP server error: {}", e);
            }
        });
    }

    // Spawn Syslog servers if enabled
    if config.syslog.enabled {
        let syslog_config = config.syslog.clone();

        // Syslog UDP server
        if syslog_config.udp_enabled {
            let syslog_batcher = log_batcher.clone();
            let syslog_metrics = metrics.clone();
            let syslog_broadcaster = broadcaster.clone();
            let syslog_udp_port = syslog_config.udp_port;
            let max_msg_size = syslog_config.max_message_size;

            tokio::spawn(async move {
                if let Err(e) = syslog::start_syslog_udp_server(
                    syslog_udp_port,
                    syslog_batcher,
                    syslog_metrics,
                    syslog_broadcaster,
                    max_msg_size,
                )
                .await
                {
                    error!("Syslog UDP server error: {}", e);
                }
            });
        }

        // Syslog TCP server
        if syslog_config.tcp_enabled {
            let syslog_batcher = log_batcher.clone();
            let syslog_metrics = metrics.clone();
            let syslog_broadcaster = broadcaster.clone();
            let syslog_tcp_port = syslog_config.tcp_port;
            let max_msg_size = syslog_config.max_message_size;

            tokio::spawn(async move {
                if let Err(e) = syslog::start_syslog_tcp_server(
                    syslog_tcp_port,
                    syslog_batcher,
                    syslog_metrics,
                    syslog_broadcaster,
                    max_msg_size,
                )
                .await
                {
                    error!("Syslog TCP server error: {}", e);
                }
            });
        }
    }

    // Start HTTPS API server
    let api_router = api::create_router(
        repository,
        span_repository,
        dashboard_repository,
        config.server.api_keys.clone(),
        config.users.clone(),
        config.server.auth_secret.clone(),
        broadcaster.clone(),
        metrics.clone(),
        alert_manager.clone(),
    );
    let https_port = config.server.https_port;
    
    // For development, use HTTP. For production, use HTTPS with TLS
    let addr = format!("0.0.0.0:{}", https_port);
    let listener = TcpListener::bind(&addr).await?;
    info!("HTTP API server listening on {}", addr);
    info!("Web interface available at http://localhost:{}", https_port);

    let api_handle = tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, api_router).await {
            error!("API server error: {}", e);
        }
    });

    // Wait for both servers
    tokio::select! {
        _ = udp_handle => {
            error!("UDP server stopped unexpectedly");
        }
        _ = api_handle => {
            error!("API server stopped unexpectedly");
        }
    }

    Ok(())
}
