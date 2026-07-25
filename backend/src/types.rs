use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InvoiceStatus {
    Pending,
    Paid,
    Expired,
    Cancelled,
    RefundRequested,
    Released,
}

impl InvoiceStatus {
    pub fn from_u32(v: u32) -> Option<Self> {
        match v {
            0 => Some(Self::Pending),
            1 => Some(Self::Paid),
            2 => Some(Self::Expired),
            3 => Some(Self::Cancelled),
            4 => Some(Self::RefundRequested),
            5 => Some(Self::Released),
            _ => None,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InvoiceResponse {
    pub id: u64,
    pub merchant: String,
    pub payer: Option<String>,
    pub token: Option<String>,
    pub amount_usdc: u64,
    pub gross_usdc: u64,
    pub status: InvoiceStatus,
    pub due_date: u64,
    pub paid_at: Option<u64>,
    pub created_at: Option<u64>,
}

/// Request body for POST /invoices/:id/pay
#[derive(Debug, Deserialize)]
pub struct PayRequest {
    /// The Stellar public key of the payer (G…).
    pub payer: String,
    /// Signed XDR transaction envelope (base64).
    pub signed_xdr: String,
}

/// Response body for POST /invoices/:id/pay
#[derive(Debug, Serialize)]
pub struct PayResponse {
    pub status: InvoiceStatus,
    pub transaction_hash: String,
}

/// Request body for POST /invoices/:id/cancel
#[derive(Debug, Deserialize)]
pub struct CancelRequest {
    /// The Stellar public key of the merchant (G…).
    pub merchant: String,
    /// Signed XDR transaction envelope (base64).
    pub signed_xdr: String,
}

/// Response body for POST /invoices/:id/cancel
#[derive(Debug, Serialize)]
pub struct CancelResponse {
    pub status: InvoiceStatus,
    pub transaction_hash: String,
}

/// Request body for POST /invoices/:id/refund
#[derive(Debug, Deserialize)]
pub struct RefundRequest {
    /// The Stellar public key of the payer/customer (G…).
    pub payer: String,
    /// Signed XDR transaction envelope (base64).
    pub signed_xdr: String,
}

/// Response body for POST /invoices/:id/refund
#[derive(Debug, Serialize)]
pub struct RefundResponse {
    pub status: InvoiceStatus,
    pub transaction_hash: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ErrorResponse {
    pub error: String,
    pub code: Option<u32>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum HealthStatus {
    Healthy,
    Degraded,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DependencyHealth {
    pub status: HealthStatus,
    pub detail: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct RpcHealthResponse {
    pub status: HealthStatus,
    pub dependencies: std::collections::BTreeMap<String, DependencyHealth>,
}

#[derive(Debug, Serialize)]
pub struct RpcRequest {
    pub jsonrpc: &'static str,
    pub id: u32,
    pub method: &'static str,
    pub params: serde_json::Value,
}

#[derive(Debug, Deserialize)]
pub struct RpcResponse {
    pub result: Option<serde_json::Value>,
    pub error: Option<serde_json::Value>,
}
