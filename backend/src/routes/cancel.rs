use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};

use crate::idempotency::IdempotencyStore;
use crate::AppState;
use crate::types::{CancelRequest, ErrorResponse};

/// POST /invoices/:id/cancel
///
/// Allows a merchant to cancel a Pending invoice.
///
/// ## Idempotency
/// Supply an `Idempotency-Key: <uuid>` header to make this endpoint safe to retry.
/// If the same key is received again within 24 hours the original response is
/// returned immediately without re-submitting the transaction to Soroban.
///
/// ## Error codes
/// - 403 — caller is not the invoice merchant (contract error 1)
/// - 404 — invoice not found (contract error 4)
pub async fn cancel_invoice(
    State(state): State<AppState>,
    Path(id): Path<u64>,
    headers: HeaderMap,
    Json(body): Json<CancelRequest>,
) -> impl IntoResponse {
    // ── Idempotency check ────────────────────────────────────────────────────
    let idem_key = headers
        .get("Idempotency-Key")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    if let Some(ref key) = idem_key {
        let store_key = IdempotencyStore::make_key("cancel", id, key);
        if let Some(cached) = state.idempotency.get(&store_key) {
            let status = StatusCode::from_u16(cached.status).unwrap_or(StatusCode::OK);
            return (status, Json(cached.body)).into_response();
        }
    }

    // ── Process the cancellation ─────────────────────────────────────────────
    let result = state.client.cancel_invoice(id, &body.merchant, &body.signed_xdr).await;

    let (status, body_json) = match result {
        Ok(resp) => (StatusCode::OK, serde_json::json!(resp)),
        Err(e) if e.to_string().contains("UNAUTHORIZED") => (
            StatusCode::FORBIDDEN,
            serde_json::json!(ErrorResponse {
                error: "Only the invoice merchant is authorised to cancel this invoice"
                    .to_string(),
                code: Some(1),
            }),
        ),
        Err(e) if e.to_string().contains("NOT_FOUND") => (
            StatusCode::NOT_FOUND,
            serde_json::json!(ErrorResponse {
                error: format!("Invoice {} not found", id),
                code: Some(4),
            }),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            serde_json::json!(ErrorResponse {
                error: e.to_string(),
                code: None,
            }),
        ),
    };

    // ── Cache the result ─────────────────────────────────────────────────────
    if let Some(ref key) = idem_key {
        let store_key = IdempotencyStore::make_key("cancel", id, key);
        state.idempotency.insert(store_key, status.as_u16(), body_json.clone());
    }

    (status, Json(body_json)).into_response()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::idempotency::IdempotencyStore;
    use crate::routes::invoices::get_invoice;
    use crate::routes::pay::pay_invoice;
    use crate::soroban::SorobanClient;
    use axum::{
        routing::{get, post},
        Router,
    };
    use axum_test::TestServer;
    use std::sync::Arc;
    use std::time::Duration;

    fn make_app() -> Router {
        let state = AppState {
            client: Arc::new(SorobanClient::new(
                "http://127.0.0.1:19999/soroban/rpc".to_string(),
                "CONTRACT_ID".to_string(),
                "https://horizon.stellar.org".to_string(),
            )),
            idempotency: IdempotencyStore::new(Duration::from_secs(86_400)),
        };
        Router::new()
            .route("/invoices/:id", get(get_invoice))
            .route("/invoices/:id/pay", post(pay_invoice))
            .route("/invoices/:id/cancel", post(cancel_invoice))
            .with_state(state)
    }

    #[tokio::test]
    async fn test_cancel_invoice_missing_body_returns_4xx() {
        let server = TestServer::new(make_app()).unwrap();
        let resp = server
            .post("/invoices/1/cancel")
            .content_type("application/json")
            .bytes(axum::body::Bytes::new())
            .await;
        assert!(
            resp.status_code().is_client_error(),
            "missing body should return a 4xx, got {}",
            resp.status_code()
        );
    }

    #[tokio::test]
    async fn test_cancel_invoice_unreachable_rpc_returns_error() {
        let server = TestServer::new(make_app()).unwrap();
        let resp = server
            .post("/invoices/1/cancel")
            .json(&serde_json::json!({
                "merchant": "GMERCHANT0000000000000000000000000000000000000000000000000",
                "signed_xdr": "AAAA=="
            }))
            .await;
        assert!(
            resp.status_code() == StatusCode::INTERNAL_SERVER_ERROR
                || resp.status_code() == StatusCode::NOT_FOUND
                || resp.status_code() == StatusCode::FORBIDDEN
        );
    }

    /// Same idempotency key on cancel must return the cached response on retry.
    #[tokio::test]
    async fn test_same_idempotency_key_returns_cached_response() {
        let server = TestServer::new(make_app()).unwrap();
        let payload = serde_json::json!({
            "merchant": "GMERCHANT0000000000000000000000000000000000000000000000000",
            "signed_xdr": "AAAA=="
        });

        let resp1 = server
            .post("/invoices/1/cancel")
            .add_header("Idempotency-Key".parse().unwrap(), "cancel-key-abc".parse().unwrap())
            .json(&payload)
            .await;

        let status1 = resp1.status_code();
        let body1 = resp1.text();

        let resp2 = server
            .post("/invoices/1/cancel")
            .add_header("Idempotency-Key".parse().unwrap(), "cancel-key-abc".parse().unwrap())
            .json(&payload)
            .await;

        assert_eq!(resp2.status_code(), status1);
        assert_eq!(resp2.text(), body1);
    }
}
