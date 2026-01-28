use anyhow::Result;
use bson::{doc, Document};
use mongodb::{Client, Collection, Database, IndexModel};
use mongodb::options::{ClientOptions, IndexOptions};

pub mod models;
pub mod repository;

pub struct DbClient {
    pub database: Database,
    pub logs_collection: Collection<Document>,
    pub alerts_collection: Collection<Document>,
    pub spans_collection: Collection<Document>,
}

impl DbClient {
    pub async fn new(connection_string: &str, db_name: &str, collection_name: &str) -> Result<Self> {
        Self::with_spans_collection(connection_string, db_name, collection_name, "spans").await
    }

    pub async fn with_spans_collection(
        connection_string: &str,
        db_name: &str,
        collection_name: &str,
        spans_collection_name: &str,
    ) -> Result<Self> {
        let client_options = ClientOptions::parse(connection_string).await?;
        let client = Client::with_options(client_options)?;

        let database = client.database(db_name);
        let logs_collection = database.collection::<Document>(collection_name);
        let alerts_collection = database.collection::<Document>("alerts");
        let spans_collection = database.collection::<Document>(spans_collection_name);

        // Create indexes for logs collection
        let timestamp_index = IndexModel::builder()
            .keys(doc! { "timestamp": -1 })
            .build();

        let level_index = IndexModel::builder()
            .keys(doc! { "level": 1 })
            .build();

        let service_index = IndexModel::builder()
            .keys(doc! { "service": 1 })
            .build();

        let compound_index = IndexModel::builder()
            .keys(doc! { "service": 1, "level": 1, "timestamp": -1 })
            .build();

        // Add trace_id sparse index for log-trace correlation
        let trace_id_index = IndexModel::builder()
            .keys(doc! { "trace_id": 1 })
            .options(IndexOptions::builder().sparse(true).build())
            .build();

        // Full-text search index on message, service, and exception
        let text_index = IndexModel::builder()
            .keys(doc! {
                "message": "text",
                "service": "text",
                "exception": "text",
                "message_template": "text"
            })
            .options(
                IndexOptions::builder()
                    .name("logs_text_search".to_string())
                    .weights(doc! {
                        "message": 10,
                        "exception": 5,
                        "service": 3,
                        "message_template": 2
                    })
                    .build()
            )
            .build();

        logs_collection
            .create_indexes(vec![
                timestamp_index,
                level_index,
                service_index,
                compound_index,
                trace_id_index,
                text_index,
            ])
            .await?;

        // Create indexes for spans collection
        let span_trace_id_index = IndexModel::builder()
            .keys(doc! { "trace_id": 1 })
            .build();

        let span_service_index = IndexModel::builder()
            .keys(doc! { "service": 1 })
            .build();

        let span_start_time_index = IndexModel::builder()
            .keys(doc! { "start_time": -1 })
            .build();

        let span_compound_index = IndexModel::builder()
            .keys(doc! { "trace_id": 1, "start_time_unix_nano": 1 })
            .build();

        let span_parent_index = IndexModel::builder()
            .keys(doc! { "parent_span_id": 1 })
            .options(IndexOptions::builder().sparse(true).build())
            .build();

        // Full-text search index for spans
        let span_text_index = IndexModel::builder()
            .keys(doc! {
                "name": "text",
                "service": "text",
                "status.message": "text"
            })
            .options(
                IndexOptions::builder()
                    .name("spans_text_search".to_string())
                    .weights(doc! {
                        "name": 10,
                        "service": 5,
                        "status.message": 3
                    })
                    .build()
            )
            .build();

        spans_collection
            .create_indexes(vec![
                span_trace_id_index,
                span_service_index,
                span_start_time_index,
                span_compound_index,
                span_parent_index,
                span_text_index,
            ])
            .await?;

        Ok(Self {
            database,
            logs_collection,
            alerts_collection,
            spans_collection,
        })
    }
}
