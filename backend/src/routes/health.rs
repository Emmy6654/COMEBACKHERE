use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use std::{collections::BTreeMap, sync::Arc};

use crate::{
    soroban::SorobanClient,
    types::{DependencyHealth, HealthStatus, RpcHealthResponse},
};

pub async fn get_rpc_health(
    State(client): State<Arc<SorobanClient>>,
) -> impl IntoResponse {
    let soroban_rpc = client.check_rpc_health().await;
    let horizon = client.check_horizon_health().await;

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
        body::Body,
        http::{Request, StatusCode},
        routing::{get, post},
        Router,
    };
    use serde_json::json;
    use std::{net::SocketAddr, sync::Arc};
    use tokio::net::TcpListener;

    /// Spawn a mock upstream server with independent health flags per dependency.
    ///
    /// - `rpc_healthy`  – controls `/soroban/rpc` (JSON-RPC POST endpoint)
    /// - `horizon_healthy` – controls `/health` (Horizon health GET endpoint)
    async fn spawn_test_server(rpc_healthy: bool, horizon_healthy: bool) -> SocketAddr {
        let app = Router::new()
            .route(
                "/soroban/rpc",
                post(move || async move {
                    if rpc_healthy {
                        axum::Json(json!({
                            "jsonrpc": "2.0",
                            "id": 1,
                            "result": { "sequence": 42 }
                        }))
                    } else {
                        StatusCode::INTERNAL_SERVER_ERROR
                    }
                }),
            )
            .route(
                "/health",
                get(move || async move {
                    if horizon_healthy {
                        StatusCode::OK
                    } else {
                        StatusCode::SERVICE_UNAVAILABLE
                    }
                }),
            )
            .route("/health/rpc", get(get_rpc_health));

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });

        addr
    }

    #[tokio::test]
    async fn returns_200_when_all_dependencies_are_healthy() {
        let addr = spawn_test_server(true, true).await;
        let client = Arc::new(SorobanClient::new(
            format!("http://{addr}/soroban/rpc"),
            "contract".to_string(),
            format!("http://{addr}"),
        ));

        let app = Router::new()
            .route("/health/rpc", get(get_rpc_health))
            .with_state(client);

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let health_addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });

        let response = reqwest::get(format!("http://{health_addr}/health/rpc"))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn returns_503_when_any_dependency_is_degraded() {
        let addr = spawn_test_server(false, false).await;
        let client = Arc::new(SorobanClient::new(
            format!("http://{addr}/soroban/rpc"),
            "contract".to_string(),
            format!("http://{addr}"),
        ));

        let app = Router::new()
            .route("/health/rpc", get(get_rpc_health))
            .with_state(client);

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let health_addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });

        let response = reqwest::get(format!("http://{health_addr}/health/rpc"))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    }

    /// Partial degradation: Soroban RPC is down but Horizon is healthy.
    ///
    /// Asserts:
    /// - HTTP 503 is returned (overall status is Degraded).
    /// - Response body identifies `soroban_rpc` as `Degraded`.
    /// - Response body identifies `horizon` as `Healthy`.
    #[tokio::test]
    async fn returns_503_with_soroban_rpc_degraded_when_only_rpc_is_unhealthy() {
        // rpc_healthy=false, horizon_healthy=true  →  partial degradation
        let addr = spawn_test_server(false, true).await;
        let client = Arc::new(SorobanClient::new(
            format!("http://{addr}/soroban/rpc"),
            "contract".to_string(),
            format!("http://{addr}"),
        ));

        let app = Router::new()
            .route("/health/rpc", get(get_rpc_health))
            .with_state(client);

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let health_addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });

        let response = reqwest::get(format!("http://{health_addr}/health/rpc"))
            .await
            .unwrap();

        // Overall status must be 503 because at least one dependency is degraded.
        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);

        let body: serde_json::Value = response.json().await.unwrap();

        // The overall status field should be "Degraded".
        assert_eq!(
            body["status"].as_str().unwrap(),
            "Degraded",
            "expected overall status to be Degraded, got: {body}"
        );

        // soroban_rpc dependency must be reported as Degraded.
        assert_eq!(
            body["dependencies"]["soroban_rpc"]["status"].as_str().unwrap(),
            "Degraded",
            "expected soroban_rpc to be Degraded, got: {body}"
        );

        // horizon dependency must still be reported as Healthy.
        assert_eq!(
            body["dependencies"]["horizon"]["status"].as_str().unwrap(),
            "Healthy",
            "expected horizon to be Healthy, got: {body}"
        );
    }
}
