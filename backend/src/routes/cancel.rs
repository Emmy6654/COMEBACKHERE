use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use std::sync::Arc;

use crate::soroban::SorobanClient;
use crate::types::{CancelRequest, CancelResponse, ErrorResponse, InvoiceStatus};

/// POST /invoices/:id/cancel
///
/// Allows a merchant to cancel a Pending invoice.
/// Returns 403 when the contract returns Unauthorized(1).
pub async fn cancel_invoice(
    State(client): State<Arc<SorobanClient>>,
    Path(id): Path<u64>,
    Json(body): Json<CancelRequest>,
) -> impl IntoResponse {
    match client.cancel_invoice(id, &body.merchant, &body.signed_xdr).await {
        Ok(resp) => (StatusCode::OK, Json(serde_json::json!(resp))).into_response(),
        Err(e) if e.to_string().contains("UNAUTHORIZED") => (
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                error: "Only the invoice merchant is authorised to cancel this invoice"
                    .to_string(),
                code: Some(1),
            }),
        )
            .into_response(),
        Err(e) if e.to_string().contains("NOT_FOUND") => (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: format!("Invoice {} not found", id),
                code: Some(4),
            }),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: e.to_string(),
                code: None,
            }),
        )
            .into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::routes::invoices::get_invoice;
    use crate::routes::pay::pay_invoice;
    use axum::{
        routing::{get, post},
        Router,
    };
    use axum_test::TestServer;

    fn make_app(client: SorobanClient) -> Router {
        Router::new()
            .route("/invoices/:id", get(get_invoice))
            .route("/invoices/:id/pay", post(pay_invoice))
            .route("/invoices/:id/cancel", post(cancel_invoice))
            .with_state(Arc::new(client))
    }

    #[tokio::test]
    async fn test_cancel_invoice_missing_body_returns_422() {
        let client = SorobanClient::new(
            "http://127.0.0.1:19999/soroban/rpc".to_string(),
            "CONTRACT_ID".to_string(),
        );
        let app = make_app(client);
        let server = TestServer::new(app).unwrap();

        // No JSON body → 422 Unprocessable Entity
        let resp = server.post("/invoices/1/cancel").await;
        assert_eq!(resp.status_code(), StatusCode::UNPROCESSABLE_ENTITY);
    }

    #[tokio::test]
    async fn test_cancel_invoice_unreachable_rpc_returns_error() {
        let client = SorobanClient::new(
            "http://127.0.0.1:19999/soroban/rpc".to_string(),
            "CONTRACT_ID".to_string(),
        );
        let app = make_app(client);
        let server = TestServer::new(app).unwrap();

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
}
