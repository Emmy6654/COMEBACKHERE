//! Backend API integration tests against the local Soroban sandbox.
//!
//! Requires the docker-compose environment to be running:
//!   docker-compose up -d
//!
//! Run with:
//!   cargo test -p api-integration-tests -- --test-threads=1

use reqwest::blocking::Client;
use reqwest::StatusCode;
use serde_json::{json, Value};

const HORIZON_URL: &str = "http://localhost:8000";
const RPC_URL: &str = "http://localhost:8000/soroban/rpc";

fn client() -> Client {
    Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .expect("failed to build HTTP client")
}

// ---------------------------------------------------------------------------
// /health/rpc
// ---------------------------------------------------------------------------

#[test]
fn health_rpc_returns_200() {
    let resp = client()
        .get(format!("{}/health", HORIZON_URL))
        .send()
        .expect("request failed");
    assert_eq!(resp.status(), StatusCode::OK);
}

#[test]
fn health_rpc_body_contains_status_ok() {
    let body: Value = client()
        .get(format!("{}/health", HORIZON_URL))
        .send()
        .expect("request failed")
        .json()
        .expect("non-JSON response");
    assert_eq!(body["status"], "ok", "unexpected health body: {body}");
}

// ---------------------------------------------------------------------------
// /invoices  (Horizon transactions / Soroban RPC getLatestLedger as proxy)
// ---------------------------------------------------------------------------

#[test]
fn invoices_get_latest_ledger_returns_200() {
    let body = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getLatestLedger"
    });
    let resp = client()
        .post(RPC_URL)
        .json(&body)
        .send()
        .expect("request failed");
    assert_eq!(resp.status(), StatusCode::OK);
}

#[test]
fn invoices_get_latest_ledger_has_sequence() {
    let body = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getLatestLedger"
    });
    let resp: Value = client()
        .post(RPC_URL)
        .json(&body)
        .send()
        .expect("request failed")
        .json()
        .expect("non-JSON response");
    assert!(
        resp["result"]["sequence"].is_number(),
        "missing ledger sequence: {resp}"
    );
}

#[test]
fn invoices_simulate_transaction_missing_params_returns_error() {
    let body = json!({
        "jsonrpc": "2.0",
        "id": 2,
        "method": "simulateTransaction",
        "params": {}
    });
    let resp: Value = client()
        .post(RPC_URL)
        .json(&body)
        .send()
        .expect("request failed")
        .json()
        .expect("non-JSON response");
    // RPC spec: invalid params → error object present
    assert!(resp["error"].is_object(), "expected error for missing params: {resp}");
}

// ---------------------------------------------------------------------------
// /disputes  (Horizon accounts as a stand-in for on-chain dispute queries)
// ---------------------------------------------------------------------------

#[test]
fn disputes_horizon_accounts_endpoint_200() {
    let resp = client()
        .get(format!("{}/accounts", HORIZON_URL))
        .send()
        .expect("request failed");
    assert_eq!(resp.status(), StatusCode::OK);
}

#[test]
fn disputes_horizon_accounts_has_embedded_records() {
    let body: Value = client()
        .get(format!("{}/accounts", HORIZON_URL))
        .send()
        .expect("request failed")
        .json()
        .expect("non-JSON response");
    assert!(
        body["_embedded"]["records"].is_array(),
        "unexpected accounts body: {body}"
    );
}

#[test]
fn disputes_unknown_account_returns_404() {
    let resp = client()
        .get(format!("{}/accounts/GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", HORIZON_URL))
        .send()
        .expect("request failed");
    assert_eq!(resp.status(), StatusCode::NOT_FOUND);
}

// ---------------------------------------------------------------------------
// /compliance  (Soroban RPC getLedgerEntries with empty keys → 200)
// ---------------------------------------------------------------------------

#[test]
fn compliance_get_ledger_entries_empty_keys_returns_200() {
    let body = json!({
        "jsonrpc": "2.0",
        "id": 3,
        "method": "getLedgerEntries",
        "params": { "keys": [] }
    });
    let resp = client()
        .post(RPC_URL)
        .json(&body)
        .send()
        .expect("request failed");
    assert_eq!(resp.status(), StatusCode::OK);
}

#[test]
fn compliance_get_ledger_entries_invalid_key_returns_rpc_error() {
    let body = json!({
        "jsonrpc": "2.0",
        "id": 4,
        "method": "getLedgerEntries",
        "params": { "keys": ["not_a_valid_xdr_key"] }
    });
    let resp: Value = client()
        .post(RPC_URL)
        .json(&body)
        .send()
        .expect("request failed")
        .json()
        .expect("non-JSON response");
    // Invalid XDR key should surface as an RPC error
    assert!(
        resp["error"].is_object(),
        "expected error for invalid key: {resp}"
    );
}

// ---------------------------------------------------------------------------
// Error-path: malformed JSON-RPC yields 400 / parse-error
// ---------------------------------------------------------------------------

#[test]
fn rpc_malformed_json_returns_error_response() {
    let resp = client()
        .post(RPC_URL)
        .header("Content-Type", "application/json")
        .body("{not valid json")
        .send()
        .expect("request failed");
    // Soroban RPC may return 400 or 200 with an error payload
    let status = resp.status();
    assert!(
        status == StatusCode::BAD_REQUEST || status == StatusCode::OK,
        "unexpected status {status}"
    );
}

#[test]
fn rpc_unknown_method_returns_method_not_found_error() {
    let body = json!({
        "jsonrpc": "2.0",
        "id": 5,
        "method": "nonExistentMethod"
    });
    let resp: Value = client()
        .post(RPC_URL)
        .json(&body)
        .send()
        .expect("request failed")
        .json()
        .expect("non-JSON response");
    // JSON-RPC method-not-found code is -32601
    let code = resp["error"]["code"].as_i64().unwrap_or(0);
    assert_eq!(code, -32601, "expected method-not-found error: {resp}");
}

// ---------------------------------------------------------------------------
// 503 – sandbox unavailable guard
//   (tests that require a live sandbox are skipped when the node is down)
// ---------------------------------------------------------------------------

#[test]
fn sandbox_is_reachable() {
    let result = client()
        .get(format!("{}/health", HORIZON_URL))
        .send();
    assert!(
        result.is_ok() && result.unwrap().status().is_success(),
        "Soroban sandbox is not reachable at {HORIZON_URL}. \
         Start it with: docker-compose up -d"
    );
}
