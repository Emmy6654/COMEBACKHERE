use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use std::sync::Arc;

use crate::soroban::SorobanClient;
use crate::types::{ErrorResponse, PayRequest};

pub async fn pay_invoice(
    State(client): State<Arc<SorobanClient>>,
    Path(id): Path<u64>,
    Json(body): Json<PayRequest>,
) -> impl IntoResponse {
    match client.pay_invoice(id, &body.payer, &body.signed_xdr).await {
        Ok(resp) => (StatusCode::OK, Json(serde_json::json!(resp))).into_response(),
        Err(e) if e.to_string().contains("UNAUTHORIZED") => (
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                error: "Payer does not match the expected address for this invoice".to_string(),
                code: Some(1),
            }),
        )
            .into_response(),
        Err(e) if e.to_string().contains("NOT_FOUND") => (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: format!("Invoice {} not found", id),
                code: Some(6),
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

        // No JSON body → 422 Unprocessable Entity
        let resp = server.post("/invoices/1/pay").await;
        assert_eq!(resp.status_code(), StatusCode::UNPROCESSABLE_ENTITY);
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
