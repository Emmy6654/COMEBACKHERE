use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use std::sync::Arc;

use crate::soroban::SorobanClient;
use crate::types::{ErrorResponse, PayRequest};

#[tracing::instrument(
    name = "route.pay_invoice",
    skip(client, body),
    fields(invoice_id = %id, payer = %body.payer)
)]
pub async fn pay_invoice(
    State(client): State<Arc<SorobanClient>>,
    Path(id): Path<u64>,
    Json(body): Json<PayRequest>,
) -> impl IntoResponse {
    tracing::info!("processing pay request");

    match client.pay_invoice(id, &body.payer, &body.signed_xdr).await {
        Ok(resp) => {
            tracing::info!(
                status = ?resp.status,
                tx_hash = %resp.transaction_hash,
                "invoice paid successfully"
            );
            (StatusCode::OK, Json(serde_json::json!(resp))).into_response()
        }
        Err(e) if e.to_string().contains("UNAUTHORIZED") => {
            tracing::warn!("pay rejected: payer not authorised");
            (
                StatusCode::FORBIDDEN,
                Json(ErrorResponse {
                    error: "Payer does not match the expected address for this invoice".to_string(),
                    code: Some(1),
                }),
            )
                .into_response()
        }
        Err(e) if e.to_string().contains("NOT_FOUND") => {
            tracing::warn!("pay rejected: invoice not found");
            (
                StatusCode::NOT_FOUND,
                Json(ErrorResponse {
                    error: format!("Invoice {} not found", id),
                    code: Some(6),
                }),
            )
                .into_response()
        }
        Err(e) => {
            tracing::error!(error = %e, "pay invoice failed with unexpected error");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: e.to_string(),
                    code: None,
                }),
            )
                .into_response()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::routes::invoices::get_invoice;
    use axum::{
        routing::{get, post},
        Router,
    };
    use axum_test::TestServer;

    fn make_app(client: SorobanClient) -> Router {
        Router::new()
            .route("/invoices/:id", get(get_invoice))
            .route("/invoices/:id/pay", post(pay_invoice))
            .with_state(Arc::new(client))
    }

    #[tokio::test]
    async fn test_pay_invoice_missing_body_returns_422() {
        let client = SorobanClient::new(
            "http://127.0.0.1:19999/soroban/rpc".to_string(),
            "CONTRACT_ID".to_string(),
            "https://horizon.stellar.org".to_string(),
        );
        let app = make_app(client);
        let server = TestServer::new(app).unwrap();

        // No JSON body and no Content-Type header → 415 Unsupported Media Type
        // (axum 0.7 rejects missing content-type before deserialisation)
        let resp = server.post("/invoices/1/pay").await;
        assert!(
            resp.status_code() == StatusCode::UNSUPPORTED_MEDIA_TYPE
                || resp.status_code() == StatusCode::UNPROCESSABLE_ENTITY,
            "expected 415 or 422, got {}",
            resp.status_code()
        );
    }

    #[tokio::test]
    async fn test_pay_invoice_unreachable_rpc_returns_5xx_or_404() {
        let client = SorobanClient::new(
            "http://127.0.0.1:19999/soroban/rpc".to_string(),
            "CONTRACT_ID".to_string(),
            "https://horizon.stellar.org".to_string(),
        );
        let app = make_app(client);
        let server = TestServer::new(app).unwrap();

        let resp = server
            .post("/invoices/1/pay")
            .json(&serde_json::json!({
                "payer": "GPAYER0000000000000000000000000000000000000000000000000000",
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
