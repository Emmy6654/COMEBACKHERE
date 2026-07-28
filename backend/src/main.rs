mod routes;
mod soroban;
mod types;

use axum::{routing::{get, post}, Router};
use std::sync::Arc;

use routes::{health::get_rpc_health, invoices::get_invoice, pay::pay_invoice, cancel::cancel_invoice};
use soroban::SorobanClient;

#[utoipa::openapi(
    info(
        title = "COMEBACKHERE API",
        version = "0.1.0",
        description = "COMEBACKHERE backend API for invoice management"
    ),
    paths(
        routes::health::get_rpc_health,
        routes::invoices::get_invoice,
        routes::pay::pay_invoice,
        routes::cancel::cancel_invoice,
    ),
    tags(
        (name = "health", description = "Health check endpoints"),
        (name = "invoices", description = "Invoice management"),
        (name = "pay", description = "Payment operations"),
        (name = "cancel", description = "Cancellation operations")
    )
)]
struct ApiDoc;

#[tokio::main]
async fn main() {
    let rpc_url = std::env::var("SOROBAN_RPC_URL")
        .unwrap_or_else(|_| "http://localhost:8000/soroban/rpc".to_string());
    let contract_id = std::env::var("INVOICE_CONTRACT_ID")
        .unwrap_or_else(|_| "CONTRACT_ID_PLACEHOLDER".to_string());
    let horizon_url = std::env::var("HORIZON_API_URL")
        .unwrap_or_else(|_| "https://horizon.stellar.org".to_string());

    let client = Arc::new(SorobanClient::new(rpc_url, contract_id, horizon_url));

    let app = Router::new()
        .route("/health/rpc", get(get_rpc_health))
        .route("/invoices/:id", get(get_invoice))
        .route("/invoices/:id/pay", post(pay_invoice))
        .route("/invoices/:id/cancel", post(cancel_invoice))
        .route("/invoices/:id/refund", post(routes::refund::refund_invoice))
        .route("/openapi.json", get(|| async { ApiDoc::openapi() }))
        .with_state(client);

    let addr = "0.0.0.0:3001";
    println!("comebackhere-backend listening on {addr}");
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{routing::get, Router};
    use std::net::SocketAddr;
    use tokio::net::TcpListener;

    #[tokio::test]
    async fn openapi_json_returns_200_and_valid_json() {
        let app = Router::new()
            .route("/openapi.json", get(|| async { ApiDoc::openapi() }));

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });

        let response = reqwest::get(format!("http://{addr}/openapi.json"))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body: serde_json::Value = response.json().await.unwrap();
        assert!(body.get("openapi").is_some());
        assert!(body.get("info").is_some());
        assert!(body.get("paths").is_some());
    }
}
