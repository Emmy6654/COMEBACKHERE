#![no_std]

use soroban_sdk::{contract, contractimpl, Address, Env, Map, Symbol, Vec};

const MIN_AMOUNT_STROOPS: u64 = 10_000_000;

#[derive(Clone, Copy, PartialEq, Eq)]
#[repr(u32)]
pub enum InvoiceStatus {
    Pending = 0,
    Paid = 1,
    Expired = 2,
    Cancelled = 3,
    RefundRequested = 4,
    Released = 5,
}

#[contracterror]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum InvoiceError {
    Unauthorized = 1,
    ContractPaused = 2,
    InvalidAmount = 3,
    NotPending = 4,
    Expired = 5,
    NotFound = 6,
    AlreadyInitialized = 7,
    ZeroDuration = 8,
    ExpiryOverflow = 9,
    NotPaid = 10,
    AmountPrecision = 12,
    DuplicateNonce = 13,
}

#[derive(Clone)]
pub struct Invoice {
    pub id: u64,
    pub merchant: Address,
    pub amount_usdc: u64,
    pub gross_usdc: u64,
    pub expires_at: u64,
    pub status: InvoiceStatus,
    pub payer: Option<Address>,
    pub paid_at: Option<u64>,
    pub metadata_hash: Option<Vec<u8>>,
    pub payment_link_hash: Option<Vec<u8>>,
}

#[contract]
pub struct InvoiceContract;

#[contractimpl]
impl InvoiceContract {
    pub fn create_invoice(
        env: Env,
        merchant: Address,
        amount_usdc: u64,
        gross_usdc: u64,
        expires_in_seconds: u64,
        metadata_hash: Option<Vec<u8>>,
        payment_link_hash: Option<Vec<u8>>,
    ) -> Result<u64, InvoiceError> {
        if amount_usdc < MIN_AMOUNT_STROOPS {
            return Err(InvoiceError::AmountPrecision);
        }
        Ok(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{AddressGenerator, Ledger};
    use soroban_sdk::{symbol_short, vec, Env, Symbol, Vec};

    #[test]
    fn test_create_invoice_min_amount_passes() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, InvoiceContract);
        let client = InvoiceContractClient::new(&env, &contract_id);

        let merchant = Address::generate(&env);
        let amount_usdc: u64 = 10_000_000;
        let gross_usdc: u64 = 10_500_000;

        let result = client.create_invoice(
            &merchant,
            &amount_usdc,
            &gross_usdc,
            &3600u64,
            &None,
            &None,
        );

        assert!(result.is_ok());
    }

    #[test]
    fn test_create_invoice_below_min_returns_error() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, InvoiceContract);
        let client = InvoiceContractClient::new(&env, &contract_id);

        let merchant = Address::generate(&env);
        let amount_usdc: u64 = 9_999_999;
        let gross_usdc: u64 = 10_499_999;

        let result = client.create_invoice(
            &merchant,
            &amount_usdc,
            &gross_usdc,
            &3600u64,
            &None,
            &None,
        );

        assert_eq!(result, Err(InvoiceError::AmountPrecision));
    }

    #[test]
    fn test_create_invoice_zero_amount_returns_error() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, InvoiceContract);
        let client = InvoiceContractClient::new(&env, &contract_id);

        let merchant = Address::generate(&env);
        let amount_usdc: u64 = 0;
        let gross_usdc: u64 = 0;

        let result = client.create_invoice(
            &merchant,
            &amount_usdc,
            &gross_usdc,
            &3600u64,
            &None,
            &None,
        );

        assert_eq!(result, Err(InvoiceError::AmountPrecision));
    }
}
