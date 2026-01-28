use anyhow::Result;
use bson::{doc, Document};
use chrono::{DateTime, Utc};
use futures::stream::{StreamExt, TryStreamExt};
use mongodb::Collection;
use mongodb::options::FindOptions;
use std::collections::HashMap;

use super::models::{LogEntry, LogLevel, LogStats};

pub struct LogRepository {
    collection: Collection<Document>,
}

impl LogRepository {
    pub fn new(collection: Collection<Document>) -> Self {
        Self { collection }
    }

    pub async fn insert_log(&self, log: LogEntry) -> Result<String> {
        let doc = Self::log_to_document(&log)?;
        let result = self.collection.insert_one(doc).await?;
        Ok(result.inserted_id.as_object_id().unwrap().to_hex())
    }

    /// Insert multiple logs at once
    pub async fn insert_logs(&self, logs: &[LogEntry]) -> Result<Vec<String>> {
        if logs.is_empty() {
            return Ok(Vec::new());
        }

        let docs: Result<Vec<Document>> = logs.iter().map(Self::log_to_document).collect();
        let docs = docs?;

        let result = self.collection.insert_many(docs).await?;
        let ids: Vec<String> = result
            .inserted_ids
            .values()
            .filter_map(|id| id.as_object_id())
            .map(|oid| oid.to_hex())
            .collect();

        Ok(ids)
    }

    fn log_to_document(log: &LogEntry) -> Result<Document> {
        // Convert to BSON document with proper DateTime types
        let mut doc = doc! {
            "timestamp": bson::DateTime::from_chrono(log.timestamp),
            "level": bson::to_bson(&log.level)?,
            "service": &log.service,
            "message": &log.message,
            "metadata": bson::to_bson(&log.metadata)?,
            "source_ip": &log.source_ip,
            "created_at": bson::DateTime::from_chrono(log.created_at),
        };

        // Add optional fields
        if let Some(ref mt) = log.message_template {
            doc.insert("message_template", mt);
        }
        if let Some(ref ex) = log.exception {
            doc.insert("exception", ex);
        }
        if let Some(ref eid) = log.event_id {
            doc.insert("event_id", eid);
        }
        if let Some(ref tid) = log.trace_id {
            doc.insert("trace_id", tid);
        }
        if let Some(ref sid) = log.span_id {
            doc.insert("span_id", sid);
        }

        Ok(doc)
    }

    pub async fn query_logs(
        &self,
        level: Option<LogLevel>,
        service: Option<String>,
        start_time: Option<DateTime<Utc>>,
        end_time: Option<DateTime<Utc>>,
        search: Option<String>,
        limit: i64,
        skip: u64,
    ) -> Result<Vec<LogEntry>> {
        let mut filter = Document::new();

        if let Some(lvl) = level {
            filter.insert("level", bson::to_bson(&lvl)?);
        }

        if let Some(svc) = service {
            filter.insert("service", svc);
        }

        if start_time.is_some() || end_time.is_some() {
            let mut time_filter = Document::new();
            if let Some(start) = start_time {
                time_filter.insert("$gte", bson::DateTime::from_chrono(start));
            }
            if let Some(end) = end_time {
                time_filter.insert("$lte", bson::DateTime::from_chrono(end));
            }
            filter.insert("timestamp", time_filter);
        }

        // Use full-text search if search term is provided
        if let Some(search_term) = search {
            filter.insert("$text", doc! { "$search": search_term });
        }

        // When using text search, we can optionally sort by text score
        let find_options = FindOptions::builder()
            .sort(doc! { "timestamp": -1 })
            .limit(limit)
            .skip(skip)
            .build();

        let cursor = self.collection.find(filter).with_options(find_options).await?;
        let docs: Vec<Document> = cursor.try_collect().await?;

        // Convert documents to LogEntry
        let logs: Vec<LogEntry> = docs
            .into_iter()
            .filter_map(|doc| bson::from_document(doc).ok())
            .collect();

        Ok(logs)
    }

    pub async fn get_log_by_id(&self, id: &str) -> Result<Option<LogEntry>> {
        let object_id = bson::oid::ObjectId::parse_str(id)?;
        let doc = self.collection.find_one(doc! { "_id": object_id }).await?;
        Ok(doc.and_then(|d| bson::from_document(d).ok()))
    }

    pub async fn get_stats(&self) -> Result<LogStats> {
        let total_count = self.collection.count_documents(doc! {}).await?;

        // Count by level
        let level_pipeline = vec![
            doc! { "$group": { "_id": "$level", "count": { "$sum": 1 } } },
        ];
        let mut level_cursor = self.collection.aggregate(level_pipeline).await?;
        let mut counts_by_level = HashMap::new();
        while let Some(result) = level_cursor.next().await {
            if let Ok(doc) = result {
                if let (Some(level), Some(count)) = (doc.get_str("_id").ok(), doc.get_i32("count").ok()) {
                    counts_by_level.insert(level.to_string(), count as u64);
                }
            }
        }

        // Count by service
        let service_pipeline = vec![
            doc! { "$group": { "_id": "$service", "count": { "$sum": 1 } } },
        ];
        let mut service_cursor = self.collection.aggregate(service_pipeline).await?;
        let mut counts_by_service = HashMap::new();
        while let Some(result) = service_cursor.next().await {
            if let Ok(doc) = result {
                if let (Some(service), Some(count)) = (doc.get_str("_id").ok(), doc.get_i32("count").ok()) {
                    counts_by_service.insert(service.to_string(), count as u64);
                }
            }
        }

        Ok(LogStats {
            total_count,
            counts_by_level,
            counts_by_service,
        })
    }
}
