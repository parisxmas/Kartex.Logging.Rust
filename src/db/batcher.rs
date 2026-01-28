use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc;
use tokio::time::interval;
use tracing::{debug, error, info};

use super::models::LogEntry;
use super::repository::LogRepository;

/// Configuration for log batching
#[derive(Debug, Clone)]
pub struct BatchConfig {
    /// Maximum number of logs to batch before flushing
    pub max_batch_size: usize,
    /// Maximum time to wait before flushing (in milliseconds)
    pub flush_interval_ms: u64,
    /// Channel buffer size for incoming logs
    pub channel_buffer_size: usize,
}

impl Default for BatchConfig {
    fn default() -> Self {
        Self {
            max_batch_size: 100,
            flush_interval_ms: 100,
            channel_buffer_size: 10000,
        }
    }
}

/// A log batcher that collects logs and writes them in batches to MongoDB
pub struct LogBatcher {
    sender: mpsc::Sender<LogEntry>,
}

impl LogBatcher {
    /// Create a new LogBatcher with the given configuration
    pub fn new(repository: Arc<LogRepository>, config: BatchConfig) -> Self {
        let (sender, receiver) = mpsc::channel(config.channel_buffer_size);

        // Spawn the background batch processor
        tokio::spawn(Self::batch_processor(receiver, repository, config));

        Self { sender }
    }

    /// Add a log entry to the batch queue
    /// Returns immediately without waiting for the write to complete
    pub async fn add(&self, log: LogEntry) -> Result<(), mpsc::error::SendError<LogEntry>> {
        self.sender.send(log).await
    }

    /// Try to add a log entry without blocking
    /// Returns an error if the channel is full
    pub fn try_add(&self, log: LogEntry) -> Result<(), mpsc::error::TrySendError<LogEntry>> {
        self.sender.try_send(log)
    }

    /// Background task that processes batched logs
    async fn batch_processor(
        mut receiver: mpsc::Receiver<LogEntry>,
        repository: Arc<LogRepository>,
        config: BatchConfig,
    ) {
        let mut batch: Vec<LogEntry> = Vec::with_capacity(config.max_batch_size);
        let mut flush_interval = interval(Duration::from_millis(config.flush_interval_ms));

        info!(
            "Log batcher started (max_batch_size: {}, flush_interval: {}ms)",
            config.max_batch_size, config.flush_interval_ms
        );

        loop {
            tokio::select! {
                // Receive logs from the channel
                maybe_log = receiver.recv() => {
                    match maybe_log {
                        Some(log) => {
                            batch.push(log);

                            // Flush if batch is full
                            if batch.len() >= config.max_batch_size {
                                Self::flush_batch(&mut batch, &repository).await;
                            }
                        }
                        None => {
                            // Channel closed, flush remaining logs and exit
                            if !batch.is_empty() {
                                Self::flush_batch(&mut batch, &repository).await;
                            }
                            info!("Log batcher shutting down");
                            break;
                        }
                    }
                }

                // Periodic flush timer
                _ = flush_interval.tick() => {
                    if !batch.is_empty() {
                        Self::flush_batch(&mut batch, &repository).await;
                    }
                }
            }
        }
    }

    /// Flush the current batch to the database
    async fn flush_batch(batch: &mut Vec<LogEntry>, repository: &LogRepository) {
        if batch.is_empty() {
            return;
        }

        let count = batch.len();
        let logs: Vec<LogEntry> = batch.drain(..).collect();

        match repository.insert_logs(&logs).await {
            Ok(ids) => {
                debug!("Flushed {} logs to database ({} inserted)", count, ids.len());
            }
            Err(e) => {
                error!("Failed to flush {} logs to database: {}", count, e);
                // In case of failure, we could implement retry logic here
                // For now, we log the error and continue
            }
        }
    }
}

impl Clone for LogBatcher {
    fn clone(&self) -> Self {
        Self {
            sender: self.sender.clone(),
        }
    }
}
