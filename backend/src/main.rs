mod routes;
mod soroban;
mod types;

use axum::{routing::{get, post}, Router};
use std::sync::Arc;

use routes::{
    cancel::cancel_invoice,
    health::get_rpc_health,
    invoices::get_invoice,
    pay::pay_invoice,
    refund::refund_invoice,
};
use soroban::SorobanClient;

#[tokio::main]
async fn main() {
    // Initialise structured logging.  Level is controlled at runtime via the
    // RUST_LOG environment variable (e.g. `RUST_LOG=info`).  Defaults to
    // `info` when the variable is absent.
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

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
        .route("/invoices/:id/refund", post(refund_invoice))
        .with_state(client);

    let addr = "0.0.0.0:3001";
    tracing::info!("comebackhere-backend listening on {addr}");
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
