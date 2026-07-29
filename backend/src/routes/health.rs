use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use std::collections::BTreeMap;

use crate::{
    AppState,
    types::{DependencyHealth, HealthStatus, RpcHealthResponse},
};

pub async fn get_rpc_health(
    State(state): State<AppState>,
) -> impl IntoResponse {
    let soroban_rpc = state.client.check_rpc_health().await;
    let horizon = state.client.check_horizon_health().await;

    let soroban_health = match soroban_rpc {
        Ok(()) => DependencyHealth {
            status: HealthStatus::Healthy,
            detail: Some("Soroban RPC responded to getLatestLedger".to_string()),
        },
        Err(err) => DependencyHealth {
            status: HealthStatus::Degraded,
            detail: Some(err.to_string()),
        },
    };

    let horizon_health = match horizon {
        Ok(()) => DependencyHealth {
            status: HealthStatus::Healthy,
            detail: Some("Horizon health endpoint responded".to_string()),
        },
        Err(err) => DependencyHealth {
            status: HealthStatus::Degraded,
            detail: Some(err.to_string()),
        },
    };

    let mut dependencies = BTreeMap::new();
    dependencies.insert("soroban_rpc".to_string(), soroban_health);
    dependencies.insert("horizon".to_string(), horizon_health);

    let overall_status = if dependencies.values().all(|dep| dep.status == HealthStatus::Healthy) {
        HealthStatus::Healthy
    } else {
        HealthStatus::Degraded
    };

    let status_code = match overall_status {
        HealthStatus::Healthy => StatusCode::OK,
        HealthStatus::Degraded => StatusCode::SERVICE_UNAVAILABLE,
    };

    let response = RpcHealthResponse {
        status: overall_status,
        dependencies,
    };

    (status_code, Json(response)).into_response()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::soroban::SorobanClient;
    use axum::{
        http::StatusCode,
        response::IntoResponse,
        routing::{get, post},
        Router,
    };
    use serde_json::json;
    use std::{net::SocketAddr, sync::Arc};
    use tokio::net::TcpListener;

    async fn spawn_test_server(healthy: bool) -> SocketAddr {
        let app = Router::new()
            .route(
                "/soroban/rpc",
                post(move || async move {
                    if healthy {
                        (StatusCode::OK, axum::Json(serde_json::json!({
                            "jsonrpc": "2.0",
                            "id": 1,
                            "result": { "sequence": 42 }
                        }))).into_response()
                    } else {
                        StatusCode::INTERNAL_SERVER_ERROR.into_response()
                    }
                }),
            )
            .route(
                "/health",
                get(move || async move {
                    if healthy {
                        StatusCode::OK
                    } else {
                        StatusCode::SERVICE_UNAVAILABLE
                    }
                }),
            );

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });

        addr
    }

    #[tokio::test]
    async fn returns_200_when_all_dependencies_are_healthy() {
        let addr = spawn_test_server(true).await;
        let state = crate::AppState {
            client: Arc::new(SorobanClient::new(
                format!("http://{addr}/soroban/rpc"),
                "contract".to_string(),
                format!("http://{addr}"),
            )),
            idempotency: crate::idempotency::IdempotencyStore::new(
                std::time::Duration::from_secs(86_400),
            ),
        };

        let app = Router::new()
            .route("/health/rpc", get(get_rpc_health))
            .with_state(state);

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let health_addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(listener, app.into_make_service()).await.unwrap();
        });

        let response = reqwest::get(format!("http://{health_addr}/health/rpc"))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn returns_503_when_any_dependency_is_degraded() {
        let addr = spawn_test_server(false).await;
        let state = crate::AppState {
            client: Arc::new(SorobanClient::new(
                format!("http://{addr}/soroban/rpc"),
                "contract".to_string(),
                format!("http://{addr}"),
            )),
            idempotency: crate::idempotency::IdempotencyStore::new(
                std::time::Duration::from_secs(86_400),
            ),
        };

        let app = Router::new()
            .route("/health/rpc", get(get_rpc_health))
            .with_state(state);

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let health_addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(listener, app.into_make_service()).await.unwrap();
        });

        let response = reqwest::get(format!("http://{health_addr}/health/rpc"))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    }
}
