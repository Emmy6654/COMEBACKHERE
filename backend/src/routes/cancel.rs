use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use std::sync::Arc;

use crate::soroban::SorobanClient;
use crate::types::{CancelRequest, CancelResponse, ErrorResponse};

#[utoipa::path(
    post,
    path = "/invoices/{id}/cancel",
    params(
        ("id" = u64, Path, description = "Invoice ID")
    ),
    request_body = CancelRequest,
    responses(
        (status = 200, description = "Invoice cancelled", body = serde_json::Value),
        (status = 403, description = "Merchant not authorized", body = ErrorResponse),
        (status = 404, description = "Invoice not found", body = ErrorResponse),
        (status = 500, description = "Internal server error", body = ErrorResponse)
    ),
    tag = "cancel"
)]
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
            "https://horizon.stellar.org".to_string(),
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
            "https://horizon.stellar.org".to_string(),
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

    #[tokio::test]
    async fn test_cancel_invoice_unauthorized_merchant_returns_403() {
        use axum::{
            routing::post,
            Router,
        };
        use std::sync::Arc;

        let app = Router::new()
            .route("/invoices/:id/cancel", post(cancel_invoice))
            .with_state(Arc::new(SorobanClient::new(
                "http://127.0.0.1:19999/soroban/rpc".to_string(),
                "CONTRACT_ID".to_string(),
                "https://horizon.stellar.org".to_string(),
            )));

        let server = TestServer::new(app).unwrap();

        let resp = server
            .post("/invoices/1/cancel")
            .json(&serde_json::json!({
                "merchant": "GMERCHANT0000000000000000000000000000000000000000000000000",
                "signed_xdr": "AAAA=="
            }))
            .await;

        assert_eq!(resp.status_code(), StatusCode::FORBIDDEN);
        let body: serde_json::Value = resp.json();
        assert!(body.get("error").unwrap().as_str().unwrap().contains("authorised"));
    }

    #[tokio::test]
    async fn test_cancel_invoice_authorized_merchant_succeeds() {
        use axum::{
            routing::{get, post},
            Router,
        };
        use serde_json::json;
        use std::{net::SocketAddr, sync::Arc};
        use tokio::net::TcpListener;

        let mock_rpc = Router::new()
            .route(
                "/soroban/rpc",
                post(move |axum::Json(payload): axum::Json<serde_json::Value>| async move {
                    if payload
                        .get("method")
                        .and_then(|m| m.as_str())
                        .unwrap_or("") == "simulateTransaction"
                    {
                        return axum::Json(json!({
                            "jsonrpc": "2.0",
                            "id": 1,
                            "result": {
                                "map": [
                                    {"key": "id", "val": 1u64},
                                    {"key": "merchant", "val": "GMERCHANT0000000000000000000000000000000000000000000000000"},
                                    {"key": "payer", "val": "GPAYER0000000000000000000000000000000000000000000000000"},
                                    {"key": "status", "val": 0u32},
                                    {"key": "amount_usdc", "val": 100u64},
                                    {"key": "gross_usdc", "val": 100u64},
                                ]
                            }
                        }));
                    }
                    if payload
                        .get("method")
                        .and_then(|m| m.as_str())
                        .unwrap_or("") == "sendTransaction"
                    {
                        return axum::Json(json!({
                            "jsonrpc": "2.0",
                            "id": 2,
                            "result": {"hash": "txhash123"}
                        }));
                    }
                    StatusCode::NOT_FOUND
                }),
            );

        let rpc_listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let rpc_addr = rpc_listener.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(rpc_listener, mock_rpc).await.unwrap();
        });

        let client = Arc::new(SorobanClient::new(
            format!("http://{rpc_addr}/soroban/rpc"),
            "CONTRACT_ID".to_string(),
            format!("http://{rpc_addr}"),
        ));

        let app = Router::new()
            .route("/invoices/:id/cancel", post(cancel_invoice))
            .with_state(client);

        let server = TestServer::new(app).unwrap();

        let resp = server
            .post("/invoices/1/cancel")
            .json(&serde_json::json!({
                "merchant": "GMERCHANT0000000000000000000000000000000000000000000000000",
                "signed_xdr": "AAAA=="
            }))
            .await;

        assert_eq!(resp.status_code(), StatusCode::OK);
        let body: serde_json::Value = resp.json();
        assert_eq!(body.get("status").unwrap().as_str().unwrap(), "cancelled");
    }
}
