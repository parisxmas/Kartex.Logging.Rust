use axum::{
    extract::{Request, State},
    http::{header::AUTHORIZATION, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::config::User;

#[derive(Clone)]
pub struct ApiAuth {
    pub valid_keys: Arc<Vec<String>>,
    pub users: Arc<Vec<User>>,
    pub jwt_secret: Arc<String>,
}

impl ApiAuth {
    pub fn new(api_keys: Vec<String>, users: Vec<User>, jwt_secret: String) -> Self {
        Self {
            valid_keys: Arc::new(api_keys),
            users: Arc::new(users),
            jwt_secret: Arc::new(jwt_secret),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,      // username
    pub role: String,     // user role
    pub exp: usize,       // expiration time
    pub iat: usize,       // issued at
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct LoginResponse {
    pub token: String,
    pub user: UserInfo,
}

#[derive(Debug, Serialize)]
pub struct UserInfo {
    pub username: String,
    pub role: String,
}

pub async fn login_handler(
    State(auth): State<ApiAuth>,
    Json(req): Json<LoginRequest>,
) -> Result<Json<LoginResponse>, (StatusCode, Json<ErrorResponse>)> {
    // Find user by username
    let user = auth.users.iter().find(|u| u.username == req.username);

    let user = match user {
        Some(u) => u,
        None => {
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(ErrorResponse {
                    error: "Invalid username or password".to_string(),
                }),
            ));
        }
    };

    // Verify password (support both plain text and bcrypt hashed)
    let password_valid = if user.password.starts_with("$2") {
        // Bcrypt hashed password
        bcrypt::verify(&req.password, &user.password).unwrap_or(false)
    } else {
        // Plain text password (for development)
        user.password == req.password
    };

    if !password_valid {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(ErrorResponse {
                error: "Invalid username or password".to_string(),
            }),
        ));
    }

    // Generate JWT
    let now = chrono::Utc::now();
    let exp = (now + chrono::Duration::hours(24)).timestamp() as usize;
    let iat = now.timestamp() as usize;

    let claims = Claims {
        sub: user.username.clone(),
        role: user.role.clone(),
        exp,
        iat,
    };

    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(auth.jwt_secret.as_bytes()),
    )
    .map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to generate token".to_string(),
            }),
        )
    })?;

    Ok(Json(LoginResponse {
        token,
        user: UserInfo {
            username: user.username.clone(),
            role: user.role.clone(),
        },
    }))
}

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
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

            // Get API auth from request extensions
            let api_auth = request
                .extensions()
                .get::<ApiAuth>()
                .cloned();

            match api_auth {
                Some(auth) => {
                    // First check if it's a valid API key
                    if auth.valid_keys.contains(&token.to_string()) {
                        return Ok(next.run(request).await);
                    }

                    // Then check if it's a valid JWT
                    let validation = Validation::default();
                    let token_data = decode::<Claims>(
                        token,
                        &DecodingKey::from_secret(auth.jwt_secret.as_bytes()),
                        &validation,
                    );

                    match token_data {
                        Ok(_) => Ok(next.run(request).await),
                        Err(_) => Err(StatusCode::UNAUTHORIZED),
                    }
                }
                None => Err(StatusCode::UNAUTHORIZED),
            }
        }
        _ => Err(StatusCode::UNAUTHORIZED),
    }
}
