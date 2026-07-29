use anyhow::{anyhow, Result};
use reqwest::Client;
use serde_json::{json, Value};
use std::time::Duration;

use crate::types::{
    CancelResponse, InvoiceResponse, InvoiceStatus, PayResponse, RefundResponse, RpcRequest,
    RpcResponse,
};

const CONTRACT_NOT_FOUND: u32 = 6;
const CONTRACT_UNAUTHORIZED: u32 = 1;
const CONTRACT_NOT_PAID: u32 = 10;

pub struct SorobanClient {
    pub rpc_url: String,
    pub contract_id: String,
    pub horizon_url: String,
    http: Client,
}

impl SorobanClient {
    pub fn new(rpc_url: String, contract_id: String, horizon_url: String) -> Self {
        Self {
            rpc_url,
            contract_id,
            horizon_url,
            http: Client::builder()
                .timeout(Duration::from_secs(5))
                .build()
                .expect("reqwest client should be created"),
        }
    }

    /// Fetch invoice state from Soroban via get_invoice.
    #[tracing::instrument(
        name = "soroban.get_invoice",
        skip(self),
        fields(invoice_id = %invoice_id)
    )]
    pub async fn get_invoice(&self, invoice_id: u64) -> Result<InvoiceResponse> {
        tracing::debug!("sending simulateTransaction RPC call");

        let args_xdr = encode_u64_arg(invoice_id);
        let req = RpcRequest {
            jsonrpc: "2.0",
            id: 1,
            method: "simulateTransaction",
            params: json!({
                "transaction": build_invoke_xdr(&self.contract_id, "get_invoice", &args_xdr),
            }),
        };

        let resp: RpcResponse = self
            .http
            .post(&self.rpc_url)
            .json(&req)
            .send()
            .await?
            .json()
            .await?;

        if let Some(err) = resp.error {
            let e = rpc_error_to_anyhow(&err);
            tracing::warn!(error = %e, "RPC error in get_invoice");
            return Err(e);
        }

        let result = resp.result.ok_or_else(|| anyhow!("Empty RPC result"))?;
        let invoice = parse_invoice_result(&result, invoice_id)?;

        tracing::debug!(status = ?invoice.status, "get_invoice RPC call succeeded");
        Ok(invoice)
    }

    #[tracing::instrument(name = "soroban.check_rpc_health", skip(self))]
    pub async fn check_rpc_health(&self) -> Result<()> {
        tracing::debug!("sending getLatestLedger health probe");

        let req = RpcRequest {
            jsonrpc: "2.0",
            id: 3,
            method: "getLatestLedger",
            params: json!([]),
        };

        let resp: RpcResponse = self
            .http
            .post(&self.rpc_url)
            .json(&req)
            .send()
            .await?
            .json()
            .await?;

        if let Some(err) = resp.error {
            let e = rpc_error_to_anyhow(&err);
            tracing::warn!(error = %e, "RPC health probe failed");
            return Err(e);
        }

        resp.result
            .ok_or_else(|| anyhow!("Empty RPC result"))
            .map(|_| ())
    }

    #[tracing::instrument(name = "soroban.check_horizon_health", skip(self))]
    pub async fn check_horizon_health(&self) -> Result<()> {
        tracing::debug!("sending Horizon health probe");

        let health_url = format!("{}/health", self.horizon_url.trim_end_matches('/'));
        let response = self.http.get(&health_url).send().await?;

        if !response.status().is_success() {
            tracing::warn!(
                http_status = %response.status(),
                "Horizon health probe returned non-2xx"
            );
            return Err(anyhow!("Horizon health check failed with status {}", response.status()));
        }

        tracing::debug!("Horizon health probe succeeded");
        Ok(())
    }

    /// Submit a signed mark_paid transaction to Soroban.
    /// Returns the updated invoice status and transaction hash.
    ///
    /// Errors:
    /// - "UNAUTHORIZED" when the contract returns InvoiceError::Unauthorized(1)
    /// - "NOT_FOUND"    when the contract returns InvoiceError::NotFound(6)
    #[tracing::instrument(
        name = "soroban.pay_invoice",
        skip(self, signed_xdr),
        fields(invoice_id = %invoice_id, payer = %payer)
    )]
    pub async fn pay_invoice(
        &self,
        invoice_id: u64,
        payer: &str,
        signed_xdr: &str,
    ) -> Result<PayResponse> {
        // 1. Validate payer is the expected one for the invoice.
        let invoice = self.get_invoice(invoice_id).await?;
        if let Some(expected) = &invoice.payer {
            if !expected.is_empty() && expected != payer {
                tracing::warn!("payer mismatch; rejecting pay_invoice");
                return Err(anyhow!("UNAUTHORIZED"));
            }
        }

        // 2. Send the pre-signed transaction.
        tracing::debug!("sending sendTransaction RPC call for pay");
        let req = RpcRequest {
            jsonrpc: "2.0",
            id: 2,
            method: "sendTransaction",
            params: json!({ "transaction": signed_xdr }),
        };

        let resp: RpcResponse = self
            .http
            .post(&self.rpc_url)
            .json(&req)
            .send()
            .await?
            .json()
            .await?;

        if let Some(err) = resp.error {
            let e = rpc_error_to_anyhow(&err);
            tracing::error!(error = %e, "sendTransaction RPC error in pay_invoice");
            return Err(e);
        }

        let result = resp.result.ok_or_else(|| anyhow!("Empty RPC result"))?;

        let tx_hash = result
            .get("hash")
            .and_then(|h| h.as_str())
            .unwrap_or("")
            .to_string();

        tracing::info!(tx_hash = %tx_hash, "pay_invoice RPC call succeeded");

        // 3. Return updated status (Paid) and the transaction hash.
        Ok(PayResponse {
            status: InvoiceStatus::Paid,
            transaction_hash: tx_hash,
        })
    }

    /// Submit a signed cancel_invoice transaction to Soroban.
    ///
    /// Only the invoice merchant is permitted to cancel a Pending invoice.
    ///
    /// Errors:
    /// - "UNAUTHORIZED" when the contract returns ContractError::Unauthorized(1)
    /// - "NOT_FOUND"    when the contract returns ContractError::InvoiceNotFound(4)
    #[tracing::instrument(
        name = "soroban.cancel_invoice",
        skip(self, signed_xdr),
        fields(invoice_id = %invoice_id, merchant = %merchant)
    )]
    pub async fn cancel_invoice(
        &self,
        invoice_id: u64,
        merchant: &str,
        signed_xdr: &str,
    ) -> Result<CancelResponse> {
        // 1. Verify the caller is the merchant recorded on the invoice.
        let invoice = self.get_invoice(invoice_id).await?;
        if invoice.merchant != merchant {
            tracing::warn!("merchant mismatch; rejecting cancel_invoice");
            return Err(anyhow!("UNAUTHORIZED"));
        }

        // 2. Forward the pre-signed cancel transaction.
        tracing::debug!("sending sendTransaction RPC call for cancel");
        let req = RpcRequest {
            jsonrpc: "2.0",
            id: 3,
            method: "sendTransaction",
            params: json!({ "transaction": signed_xdr }),
        };

        let resp: RpcResponse = self
            .http
            .post(&self.rpc_url)
            .json(&req)
            .send()
            .await?
            .json()
            .await?;

        if let Some(err) = resp.error {
            let e = rpc_error_to_anyhow(&err);
            tracing::error!(error = %e, "sendTransaction RPC error in cancel_invoice");
            return Err(e);
        }

        let result = resp.result.ok_or_else(|| anyhow!("Empty RPC result"))?;

        let tx_hash = result
            .get("hash")
            .and_then(|h| h.as_str())
            .unwrap_or("")
            .to_string();

        tracing::info!(tx_hash = %tx_hash, "cancel_invoice RPC call succeeded");

        Ok(CancelResponse {
            status: InvoiceStatus::Cancelled,
            transaction_hash: tx_hash,
        })
    }

    /// Submit a signed request_refund transaction to Soroban.
    ///
    /// Only the invoice payer (customer) may request a refund, and only on a Paid invoice.
    ///
    /// Errors:
    /// - "NOT_PAID"     when the contract returns ContractError::RefundNotRequested(10)
    /// - "UNAUTHORIZED" when the contract returns ContractError::Unauthorized(1)
    /// - "NOT_FOUND"    when the contract returns ContractError::InvoiceNotFound(4)
    #[tracing::instrument(
        name = "soroban.refund_invoice",
        skip(self, signed_xdr),
        fields(invoice_id = %invoice_id, payer = %payer)
    )]
    pub async fn refund_invoice(
        &self,
        invoice_id: u64,
        payer: &str,
        signed_xdr: &str,
    ) -> Result<RefundResponse> {
        // 1. Verify the caller is the payer recorded on the invoice.
        let invoice = self.get_invoice(invoice_id).await?;
        if let Some(expected) = &invoice.payer {
            if !expected.is_empty() && expected != payer {
                tracing::warn!("payer mismatch; rejecting refund_invoice");
                return Err(anyhow!("UNAUTHORIZED"));
            }
        }

        // 2. Forward the pre-signed refund transaction.
        tracing::debug!("sending sendTransaction RPC call for refund");
        let req = RpcRequest {
            jsonrpc: "2.0",
            id: 4,
            method: "sendTransaction",
            params: json!({ "transaction": signed_xdr }),
        };

        let resp: RpcResponse = self
            .http
            .post(&self.rpc_url)
            .json(&req)
            .send()
            .await?
            .json()
            .await?;

        if let Some(err) = resp.error {
            let e = rpc_error_to_anyhow(&err);
            tracing::error!(error = %e, "sendTransaction RPC error in refund_invoice");
            return Err(e);
        }

        let result = resp.result.ok_or_else(|| anyhow!("Empty RPC result"))?;

        let tx_hash = result
            .get("hash")
            .and_then(|h| h.as_str())
            .unwrap_or("")
            .to_string();

        tracing::info!(tx_hash = %tx_hash, "refund_invoice RPC call succeeded");

        Ok(RefundResponse {
            status: InvoiceStatus::RefundRequested,
            transaction_hash: tx_hash,
        })
    }
}

fn rpc_error_to_anyhow(err: &Value) -> anyhow::Error {
    let code = err
        .get("code")
        .and_then(|c| c.as_u64())
        .map(|c| c as u32);
    match code {
        Some(c) if c == CONTRACT_NOT_FOUND => anyhow!("NOT_FOUND"),
        Some(c) if c == CONTRACT_UNAUTHORIZED => anyhow!("UNAUTHORIZED"),
        Some(c) if c == CONTRACT_NOT_PAID => anyhow!("NOT_PAID"),
        _ => anyhow!("RPC error: {}", err),
    }
}

fn parse_invoice_result(result: &Value, invoice_id: u64) -> Result<InvoiceResponse> {
    let map = result
        .get("map")
        .and_then(|m| m.as_array())
        .cloned()
        .unwrap_or_default();

    let get_u64 = |key: &str| -> Option<u64> {
        map.iter()
            .find(|e| e.get("key").and_then(|k| k.as_str()) == Some(key))
            .and_then(|e| e.get("val"))
            .and_then(|v| v.as_u64())
    };
    let get_str = |key: &str| -> Option<String> {
        map.iter()
            .find(|e| e.get("key").and_then(|k| k.as_str()) == Some(key))
            .and_then(|e| e.get("val"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
    };
    let get_u32 = |key: &str| -> Option<u32> {
        map.iter()
            .find(|e| e.get("key").and_then(|k| k.as_str()) == Some(key))
            .and_then(|e| e.get("val"))
            .and_then(|v| v.as_u64())
            .map(|v| v as u32)
    };

    let status = get_u32("status")
        .and_then(InvoiceStatus::from_u32)
        .unwrap_or(InvoiceStatus::Pending);

    Ok(InvoiceResponse {
        id: get_u64("id").unwrap_or(invoice_id),
        merchant: get_str("merchant").unwrap_or_default(),
        payer: get_str("payer"),
        token: get_str("token"),
        amount_usdc: get_u64("amount_usdc").unwrap_or(0),
        gross_usdc: get_u64("gross_usdc").unwrap_or(0),
        status,
        due_date: get_u64("expires_at").unwrap_or(0),
        paid_at: get_u64("paid_at"),
        created_at: get_u64("created_at"),
    })
}

fn encode_u64_arg(id: u64) -> String {
    use base64::{engine::general_purpose::STANDARD, Engine};
    let mut bytes = vec![0x06u8];
    bytes.extend_from_slice(&id.to_be_bytes());
    STANDARD.encode(bytes)
}

fn build_invoke_xdr(contract_id: &str, function: &str, args_xdr: &str) -> String {
    format!("INVOKE:{}:{}:{}", contract_id, function, args_xdr)
}
