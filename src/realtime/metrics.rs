use chrono::{DateTime, Utc};
use serde::Serialize;
use std::collections::VecDeque;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::db::models::LogEntry;
use crate::otlp::{Span, SpanStatusCode};

/// Time window for metrics calculation (in seconds)
const METRICS_WINDOW_SECS: i64 = 60;
const METRICS_BUCKETS: usize = 60; // 1 bucket per second

#[derive(Debug, Clone, Serialize)]
pub struct RealtimeMetrics {
    /// Logs per second (average over last minute)
    pub logs_per_second: f64,
    /// Error rate (errors / total) over last minute
    pub error_rate: f64,
    /// Errors per second
    pub errors_per_second: f64,
    /// Total logs in last minute
    pub logs_last_minute: u64,
    /// Total errors in last minute
    pub errors_last_minute: u64,
    /// Logs by level in last minute
    pub logs_by_level: LogsByLevel,
    /// Timestamp of metrics
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct LogsByLevel {
    pub trace: u64,
    pub debug: u64,
    pub info: u64,
    pub warn: u64,
    pub error: u64,
    pub fatal: u64,
}

#[derive(Debug)]
struct MetricsBucket {
    timestamp: DateTime<Utc>,
    total: u64,
    trace: u64,
    debug: u64,
    info: u64,
    warn: u64,
    error: u64,
    fatal: u64,
}

impl MetricsBucket {
    fn new(timestamp: DateTime<Utc>) -> Self {
        Self {
            timestamp,
            total: 0,
            trace: 0,
            debug: 0,
            info: 0,
            warn: 0,
            error: 0,
            fatal: 0,
        }
    }
}

/// Thread-safe metrics tracker
pub struct MetricsTracker {
    buckets: RwLock<VecDeque<MetricsBucket>>,
    total_logs: AtomicU64,
    total_errors: AtomicU64,
}

impl MetricsTracker {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            buckets: RwLock::new(VecDeque::with_capacity(METRICS_BUCKETS + 1)),
            total_logs: AtomicU64::new(0),
            total_errors: AtomicU64::new(0),
        })
    }

    /// Record a log entry
    pub async fn record_log(&self, log: &LogEntry) {
        let level_str = format!("{:?}", log.level).to_uppercase();
        self.record_log_by_level(&level_str).await;
    }

    /// Record a log by level string (for backward compatibility)
    pub async fn record_log_by_level(&self, level: &str) {
        let now = Utc::now();
        let is_error = matches!(level, "ERROR" | "FATAL");

        self.total_logs.fetch_add(1, Ordering::Relaxed);
        if is_error {
            self.total_errors.fetch_add(1, Ordering::Relaxed);
        }

        let mut buckets = self.buckets.write().await;

        // Get or create current bucket
        let current_second = now.timestamp();
        let need_new_bucket = buckets
            .back()
            .map(|b| b.timestamp.timestamp() != current_second)
            .unwrap_or(true);

        if need_new_bucket {
            buckets.push_back(MetricsBucket::new(now));
        }

        if let Some(bucket) = buckets.back_mut() {
            bucket.total += 1;
            match level {
                "TRACE" => bucket.trace += 1,
                "DEBUG" => bucket.debug += 1,
                "INFO" => bucket.info += 1,
                "WARN" => bucket.warn += 1,
                "ERROR" => bucket.error += 1,
                "FATAL" => bucket.fatal += 1,
                _ => {}
            }
        }

        // Remove old buckets
        let cutoff = now.timestamp() - METRICS_WINDOW_SECS;
        while buckets
            .front()
            .map(|b| b.timestamp.timestamp() < cutoff)
            .unwrap_or(false)
        {
            buckets.pop_front();
        }
    }

    /// Record a span
    pub async fn record_span(&self, span: &Span) {
        // For now, we count error spans as errors in our metrics
        if span.status.code == SpanStatusCode::Error {
            self.total_errors.fetch_add(1, Ordering::Relaxed);
        }
    }

    /// Get current metrics
    pub async fn get_metrics(&self) -> RealtimeMetrics {
        let now = Utc::now();
        let cutoff = now.timestamp() - METRICS_WINDOW_SECS;

        let buckets = self.buckets.read().await;

        let mut logs_by_level = LogsByLevel::default();
        let mut total: u64 = 0;
        let mut errors: u64 = 0;

        for bucket in buckets.iter() {
            if bucket.timestamp.timestamp() >= cutoff {
                total += bucket.total;
                errors += bucket.error + bucket.fatal;
                logs_by_level.trace += bucket.trace;
                logs_by_level.debug += bucket.debug;
                logs_by_level.info += bucket.info;
                logs_by_level.warn += bucket.warn;
                logs_by_level.error += bucket.error;
                logs_by_level.fatal += bucket.fatal;
            }
        }

        let window_secs = METRICS_WINDOW_SECS as f64;
        let logs_per_second = total as f64 / window_secs;
        let errors_per_second = errors as f64 / window_secs;
        let error_rate = if total > 0 {
            errors as f64 / total as f64
        } else {
            0.0
        };

        RealtimeMetrics {
            logs_per_second,
            error_rate,
            errors_per_second,
            logs_last_minute: total,
            errors_last_minute: errors,
            logs_by_level,
            timestamp: now,
        }
    }

    /// Get total logs ever recorded
    pub fn total_logs(&self) -> u64 {
        self.total_logs.load(Ordering::Relaxed)
    }

    /// Get total errors ever recorded
    pub fn total_errors(&self) -> u64 {
        self.total_errors.load(Ordering::Relaxed)
    }
}
