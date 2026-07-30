mod rate_limiter;
mod routes;
mod soroban;
mod types;

use axum::{routing::{get, post}, Router};
use std::sync::Arc;

use rate_limiter::{new_store, RateLimitConfig, RateLimiterLayer};
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
    let rpc_url = std::env::var("SOROBAN_RPC_URL")
        .unwrap_or_else(|_| "http://localhost:8000/soroban/rpc".to_string());
    let contract_id = std::env::var("INVOICE_CONTRACT_ID")
        .unwrap_or_else(|_| "CONTRACT_ID_PLACEHOLDER".to_string());
    let horizon_url = std::env::var("HORIZON_API_URL")
        .unwrap_or_else(|_| "https://horizon.stellar.org".to_string());

    let client = Arc::new(SorobanClient::new(rpc_url, contract_id, horizon_url));

    // Rate-limiter layer: config is read from RATE_LIMIT_POINTS / RATE_LIMIT_DURATION
    // (defaults: 60 requests per 60-second window, per IP).
    let rl_config = RateLimitConfig::from_env();
    let rl_layer = RateLimiterLayer::new(new_store(), rl_config);

    let app = Router::new()
        .route("/health/rpc", get(get_rpc_health))
        .route("/invoices/:id", get(get_invoice))
        .route("/invoices/:id/pay", post(pay_invoice))
        .route("/invoices/:id/cancel", post(cancel_invoice))
        .route("/invoices/:id/refund", post(refund_invoice))
        .layer(rl_layer)
        .with_state(client);

    let addr = "0.0.0.0:3001";
    println!("comebackhere-backend listening on {addr}");
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
