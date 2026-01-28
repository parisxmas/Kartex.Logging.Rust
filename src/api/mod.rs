pub mod auth;
pub mod handlers;

use axum::{
    middleware,
    routing::{get, post},
    Extension, Router,
};
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::TraceLayer;

use crate::config::User;
use crate::db::repository::LogRepository;
use crate::db::dashboard::DashboardRepository;
use crate::otlp::SpanRepository;
use crate::realtime::{AlertManager, MetricsTracker, WsBroadcaster};
use auth::{login_handler, auth_middleware, ApiAuth};
use handlers::{
    create_alert, delete_alert, get_alert, get_alerts, get_log_by_id, get_logs,
    get_realtime_metrics, get_stats, health_check, update_alert, ws_handler,
    get_traces, get_trace_by_id, get_trace_for_log,
    get_dashboards, get_dashboard, get_default_dashboard, create_dashboard,
    update_dashboard, delete_dashboard, get_widget_data,
};

/// Shared application state
#[derive(Clone)]
pub struct AppState {
    pub repository: Arc<LogRepository>,
    pub span_repository: Arc<SpanRepository>,
    pub dashboard_repository: Arc<DashboardRepository>,
    pub broadcaster: Arc<WsBroadcaster>,
    pub metrics: Arc<MetricsTracker>,
    pub alert_manager: Arc<AlertManager>,
}

pub fn create_router(
    repository: Arc<LogRepository>,
    span_repository: Arc<SpanRepository>,
    dashboard_repository: Arc<DashboardRepository>,
    api_keys: Vec<String>,
    users: Vec<User>,
    jwt_secret: String,
    broadcaster: Arc<WsBroadcaster>,
    metrics: Arc<MetricsTracker>,
    alert_manager: Arc<AlertManager>,
) -> Router {
    let api_auth = ApiAuth::new(api_keys, users, jwt_secret);

    let state = AppState {
        repository,
        span_repository,
        dashboard_repository,
        broadcaster,
        metrics,
        alert_manager,
    };

    // CORS configuration
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // API routes (protected)
    let api_routes = Router::new()
        .route("/logs", get(get_logs))
        .route("/logs/:id", get(get_log_by_id))
        .route("/logs/:id/trace", get(get_trace_for_log))
        .route("/traces", get(get_traces))
        .route("/traces/:trace_id", get(get_trace_by_id))
        .route("/stats", get(get_stats))
        .route("/metrics", get(get_realtime_metrics))
        .route("/alerts", get(get_alerts).post(create_alert))
        .route("/alerts/:id/update", post(update_alert))
        .route("/alerts/:id/delete", post(delete_alert))
        .route("/alerts/:id", get(get_alert))
        .route("/dashboards", get(get_dashboards).post(create_dashboard))
        .route("/dashboards/default", get(get_default_dashboard))
        .route("/dashboards/:id/update", post(update_dashboard))
        .route("/dashboards/:id/delete", post(delete_dashboard))
        .route("/dashboards/:id", get(get_dashboard))
        .route("/widgets/data", post(get_widget_data))
        .layer(middleware::from_fn(auth_middleware))
        .layer(Extension(api_auth.clone()));

    // Login route (public)
    let login_route = Router::new()
        .route("/login", post(login_handler))
        .with_state(api_auth);

    // Public routes
    let public_routes = Router::new()
        .route("/health", get(health_check))
        .route("/ws", get(ws_handler));

    // Static files for web interface with SPA fallback
    let static_service = ServeDir::new("static")
        .not_found_service(ServeFile::new("static/index.html"));

    Router::new()
        .nest("/api", api_routes)
        .nest("/api", login_route)
        .merge(public_routes)
        .fallback_service(static_service)
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}
