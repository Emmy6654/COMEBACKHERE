use super::*;
use soroban_sdk::testutils::{Address as _, Ledger, LedgerInfo};
use soroban_sdk::{vec, Env};

#[test]
fn test_create_invoice_expiry_overflow() {
    let e = Env::default();
    let admin = Address::generate(&e);
    let merchant = Address::generate(&e);

    let contract_id = e.register_contract(None, InvoiceContract);
    let client = InvoiceContractClient::new(&e, &contract_id);

    client.initialize(&admin);

    let ttl = u64::MAX;
    let amount_usdc = 10_000_000u64;
    let gross_usdc = 10_000_000u64;

    let result = client.try_create_invoice(
        &merchant,
        &amount_usdc,
        &gross_usdc,
        &ttl,
        &None,
        &None,
        &1u64,
    );

    assert_eq!(result, Err(Ok(InvoiceError::ExpiryOverflow)));
}

#[test]
fn test_create_invoice_success() {
    let e = Env::default();
    let admin = Address::generate(&e);
    let merchant = Address::generate(&e);

    e.ledger().set_info(LedgerInfo {
        timestamp: 1_000_000,
        protocol_version: 20,
        sequence_number: 0,
        network_id: Default::default(),
        base_reserve: 10,
    });

    let contract_id = e.register_contract(None, InvoiceContract);
    let client = InvoiceContractClient::new(&e, &contract_id);

    client.initialize(&admin);

    let ttl = 3600u64;
    let amount_usdc = 10_000_000u64;
    let gross_usdc = 12_000_000u64;

    let invoice_id = client.create_invoice(
        &merchant,
        &amount_usdc,
        &gross_usdc,
        &ttl,
        &None,
        &None,
        &1u64,
    );

    assert_eq!(invoice_id, 1u64);

    let invoice = client.get_invoice(&invoice_id);
    assert_eq!(invoice.merchant, merchant);
    assert_eq!(invoice.amount_usdc, amount_usdc);
    assert_eq!(invoice.gross_usdc, gross_usdc);
    assert_eq!(invoice.expires_at, 1_003_600u64);
    assert_eq!(invoice.status, InvoiceStatus::Pending);
}
