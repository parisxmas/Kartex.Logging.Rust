use anyhow::Result;
use bson::{doc, oid::ObjectId, Document};
use chrono::{DateTime, Utc};
use futures::TryStreamExt;
use mongodb::Collection;

use super::models::{Span, SpanStatusCode, TraceDetail, TraceQueryParams, TraceSummary};
use crate::db::models::LogEntry;

pub struct SpanRepository {
    pub spans_collection: Collection<Document>,
    pub logs_collection: Collection<Document>,
}

impl SpanRepository {
    pub fn new(spans_collection: Collection<Document>, logs_collection: Collection<Document>) -> Self {
        Self {
            spans_collection,
            logs_collection,
        }
    }

    /// Insert multiple spans into the database
    pub async fn insert_spans(&self, spans: &[Span]) -> Result<Vec<ObjectId>> {
        if spans.is_empty() {
            return Ok(Vec::new());
        }

        let docs: Vec<Document> = spans
            .iter()
            .map(|span| {
                bson::to_document(span).unwrap_or_default()
            })
            .collect();

        let result = self.spans_collection.insert_many(docs).await?;
        let ids: Vec<ObjectId> = result
            .inserted_ids
            .values()
            .filter_map(|id| id.as_object_id())
            .collect();

        Ok(ids)
    }

    /// Get a span by its ID
    pub async fn get_span_by_id(&self, id: &str) -> Result<Option<Span>> {
        let object_id = ObjectId::parse_str(id)?;
        let filter = doc! { "_id": object_id };

        if let Some(doc) = self.spans_collection.find_one(filter).await? {
            let span: Span = bson::from_document(doc)?;
            return Ok(Some(span));
        }

        Ok(None)
    }

    /// Get all spans for a trace
    pub async fn get_trace_spans(&self, trace_id: &str) -> Result<Vec<Span>> {
        let filter = doc! { "trace_id": trace_id };
        let options = mongodb::options::FindOptions::builder()
            .sort(doc! { "start_time_unix_nano": 1 })
            .build();

        let cursor = self.spans_collection.find(filter).with_options(options).await?;
        let docs: Vec<Document> = cursor.try_collect().await?;

        let spans: Vec<Span> = docs
            .into_iter()
            .filter_map(|doc| bson::from_document(doc).ok())
            .collect();

        Ok(spans)
    }

    /// Get logs correlated with a trace
    pub async fn get_trace_logs(&self, trace_id: &str) -> Result<Vec<LogEntry>> {
        let filter = doc! { "trace_id": trace_id };
        let options = mongodb::options::FindOptions::builder()
            .sort(doc! { "timestamp": 1 })
            .build();

        let cursor = self.logs_collection.find(filter).with_options(options).await?;
        let docs: Vec<Document> = cursor.try_collect().await?;

        let logs: Vec<LogEntry> = docs
            .into_iter()
            .filter_map(|doc| bson::from_document(doc).ok())
            .collect();

        Ok(logs)
    }

    /// Get full trace detail with spans and correlated logs
    pub async fn get_trace_detail(&self, trace_id: &str) -> Result<Option<TraceDetail>> {
        let spans = self.get_trace_spans(trace_id).await?;

        if spans.is_empty() {
            return Ok(None);
        }

        let logs = self.get_trace_logs(trace_id).await?;

        Ok(Some(TraceDetail {
            trace_id: trace_id.to_string(),
            spans,
            logs,
        }))
    }

    /// Query trace summaries with filters
    pub async fn query_traces(&self, params: TraceQueryParams) -> Result<Vec<TraceSummary>> {
        let mut match_stage = doc! {};

        // Only get root spans (spans without parent)
        match_stage.insert("parent_span_id", doc! { "$exists": false });

        if let Some(service) = &params.service {
            match_stage.insert("service", service);
        }

        if let Some(start_time) = params.start_time {
            match_stage.insert("start_time", doc! { "$gte": bson::DateTime::from_chrono(start_time) });
        }

        if let Some(end_time) = params.end_time {
            if match_stage.contains_key("start_time") {
                if let Some(existing) = match_stage.get_mut("start_time") {
                    if let Some(doc) = existing.as_document_mut() {
                        doc.insert("$lte", bson::DateTime::from_chrono(end_time));
                    }
                }
            } else {
                match_stage.insert("start_time", doc! { "$lte": bson::DateTime::from_chrono(end_time) });
            }
        }

        if let Some(min_duration) = params.min_duration_ms {
            match_stage.insert("duration_ms", doc! { "$gte": min_duration });
        }

        if let Some(max_duration) = params.max_duration_ms {
            if match_stage.contains_key("duration_ms") {
                if let Some(existing) = match_stage.get_mut("duration_ms") {
                    if let Some(doc) = existing.as_document_mut() {
                        doc.insert("$lte", max_duration);
                    }
                }
            } else {
                match_stage.insert("duration_ms", doc! { "$lte": max_duration });
            }
        }

        if let Some(status) = &params.status {
            match status.to_uppercase().as_str() {
                "OK" => {
                    match_stage.insert("status.code", "OK");
                }
                "ERROR" => {
                    match_stage.insert("status.code", "ERROR");
                }
                _ => {}
            }
        }

        // Full-text search on span name and service
        if let Some(search_term) = &params.search {
            match_stage.insert("$text", doc! { "$search": search_term });
        }

        let pipeline = vec![
            doc! { "$match": match_stage },
            doc! { "$sort": { "start_time": -1 } },
            doc! { "$skip": params.skip as i64 },
            doc! { "$limit": params.limit },
            // Lookup all spans for this trace to count them
            doc! {
                "$lookup": {
                    "from": self.spans_collection.name(),
                    "localField": "trace_id",
                    "foreignField": "trace_id",
                    "as": "all_spans"
                }
            },
            doc! {
                "$project": {
                    "trace_id": 1,
                    "root_span_name": "$name",
                    "service": 1,
                    "start_time": 1,
                    "end_time": 1,
                    "duration_ms": 1,
                    "status": 1,
                    "span_count": { "$size": "$all_spans" },
                    "error_count": {
                        "$size": {
                            "$filter": {
                                "input": "$all_spans",
                                "as": "span",
                                "cond": { "$eq": ["$$span.status.code", "ERROR"] }
                            }
                        }
                    }
                }
            },
        ];

        let cursor = self.spans_collection.aggregate(pipeline).await?;
        let docs: Vec<Document> = cursor.try_collect().await?;

        let summaries: Vec<TraceSummary> = docs
            .into_iter()
            .filter_map(|doc| {
                Some(TraceSummary {
                    trace_id: doc.get_str("trace_id").ok()?.to_string(),
                    root_span_name: doc.get_str("root_span_name").ok()?.to_string(),
                    service: doc.get_str("service").ok()?.to_string(),
                    start_time: doc.get_datetime("start_time").ok()?.to_chrono(),
                    end_time: doc.get_datetime("end_time").ok()?.to_chrono(),
                    duration_ms: doc.get_f64("duration_ms").ok()?,
                    span_count: doc.get_i64("span_count").unwrap_or(doc.get_i32("span_count").unwrap_or(0) as i64),
                    error_count: doc.get_i64("error_count").unwrap_or(doc.get_i32("error_count").unwrap_or(0) as i64),
                    status: doc
                        .get_document("status")
                        .ok()
                        .and_then(|s| s.get_str("code").ok())
                        .map(|code| match code {
                            "OK" => SpanStatusCode::Ok,
                            "ERROR" => SpanStatusCode::Error,
                            _ => SpanStatusCode::Unset,
                        })
                        .unwrap_or(SpanStatusCode::Unset),
                })
            })
            .collect();

        Ok(summaries)
    }

    /// Get trace for a specific log entry
    pub async fn get_trace_for_log(&self, log_id: &str) -> Result<Option<TraceDetail>> {
        let object_id = ObjectId::parse_str(log_id)?;
        let filter = doc! { "_id": object_id };

        if let Some(doc) = self.logs_collection.find_one(filter).await? {
            if let Ok(trace_id) = doc.get_str("trace_id") {
                return self.get_trace_detail(trace_id).await;
            }
        }

        Ok(None)
    }

    /// Get distinct services from spans
    pub async fn get_span_services(&self) -> Result<Vec<String>> {
        let services = self.spans_collection.distinct("service", doc! {}).await?;
        Ok(services.into_iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
    }
}
