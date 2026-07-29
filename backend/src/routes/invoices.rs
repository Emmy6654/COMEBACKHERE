use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use std::sync::Arc;

use crate::soroban::SorobanClient;
use crate::types::ErrorResponse;

#[tracing::instrument(
    name = "route.get_invoice",
    skip(client),
    fields(invoice_id = %id)
)]
pub async fn get_invoice(
    State(client): State<Arc<SorobanClient>>,
    Path(id): Path<u64>,
) -> impl IntoResponse {
    tracing::info!("fetching invoice");

    match client.get_invoice(id).await {
        Ok(invoice) => {
            tracing::info!(status = ?invoice.status, "invoice fetched successfully");
            (StatusCode::OK, Json(serde_json::json!(invoice))).into_response()
        }
        Err(e) if e.to_string().contains("NOT_FOUND") => {
            tracing::warn!("invoice not found");
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
            tracing::error!(error = %e, "get invoice failed with unexpected error");
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
