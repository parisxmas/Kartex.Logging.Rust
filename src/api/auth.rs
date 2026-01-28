use axum::{
    extract::Request,
    http::{header::AUTHORIZATION, StatusCode},
    middleware::Next,
    response::Response,
};
use std::sync::Arc;

#[derive(Clone)]
pub struct ApiAuth {
    pub valid_keys: Arc<Vec<String>>,
}

impl ApiAuth {
    pub fn new(api_keys: Vec<String>) -> Self {
        Self {
            valid_keys: Arc::new(api_keys),
        }
    }
}

pub async fn auth_middleware(
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let auth_header = request
        .headers()
        .get(AUTHORIZATION)
        .and_then(|h| h.to_str().ok());

    match auth_header {
        Some(header) if header.starts_with("Bearer ") => {
            let token = header.trim_start_matches("Bearer ");
            
            // Get API keys from request extensions
            let api_auth = request
                .extensions()
                .get::<ApiAuth>()
                .cloned();

            match api_auth {
                Some(auth) if auth.valid_keys.contains(&token.to_string()) => {
                    Ok(next.run(request).await)
                }
                _ => Err(StatusCode::UNAUTHORIZED),
            }
        }
        _ => Err(StatusCode::UNAUTHORIZED),
    }
}
