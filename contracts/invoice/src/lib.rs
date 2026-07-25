#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, contracterror, Address, Env};

const MIN_AMOUNT_STROOPS: u64 = 10_000_000;

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

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum InvoiceStatus {
    Pending,
    Paid,
    Expired,
    Cancelled,
    RefundRequested,
    Released,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Invoice {
    pub id: u64,
    pub merchant: Address,
    pub amount_usdc: u64,
    pub gross_usdc: u64,
    pub expires_at: u64,
    pub status: InvoiceStatus,
}

#[contracttype]
pub enum DataKey {
    Admin,
    Paused,
    Invoice(u64),
    NextId,
    Nonce(Address, u64),
}

#[contract]
pub struct InvoiceContract;

#[contractimpl]
impl InvoiceContract {
    pub fn initialize(env: Env, admin: Address) -> Result<(), InvoiceError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(InvoiceError::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Paused, &false);
        env.storage().instance().set(&DataKey::NextId, &1u64);
        Ok(())
    }

    pub fn create_invoice(
        env: Env,
        merchant: Address,
        amount_usdc: u64,
        gross_usdc: u64,
        expires_in_seconds: u64,
        nonce: u64,
    ) -> Result<u64, InvoiceError> {
        merchant.require_auth();

        if env
            .storage()
            .instance()
            .get::<DataKey, bool>(&DataKey::Paused)
            .unwrap_or(false)
        {
            return Err(InvoiceError::ContractPaused);
        }

        if amount_usdc == 0 || gross_usdc == 0 {
            return Err(InvoiceError::InvalidAmount);
        }
        if amount_usdc < MIN_AMOUNT_STROOPS {
            return Err(InvoiceError::AmountPrecision);
        }
        if gross_usdc < amount_usdc {
            return Err(InvoiceError::InvalidAmount);
        }
        if expires_in_seconds == 0 {
            return Err(InvoiceError::ZeroDuration);
        }

        let nonce_key = DataKey::Nonce(merchant.clone(), nonce);
        if env.storage().instance().has(&nonce_key) {
            return Err(InvoiceError::DuplicateNonce);
        }

        let now = env.ledger().timestamp();
        let expires_at = now
            .checked_add(expires_in_seconds)
            .ok_or(InvoiceError::ExpiryOverflow)?;

        env.storage().instance().set(&nonce_key, &true);

        let id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextId)
            .unwrap_or(1u64);
        let invoice = Invoice {
            id,
            merchant,
            amount_usdc,
            gross_usdc,
            expires_at,
            status: InvoiceStatus::Pending,
        };
        env.storage().instance().set(&DataKey::Invoice(id), &invoice);
        env.storage().instance().set(&DataKey::NextId, &(id + 1));

        Ok(id)
    }

    pub fn get_invoice(env: Env, invoice_id: u64) -> Result<Invoice, InvoiceError> {
        env.storage()
            .instance()
            .get(&DataKey::Invoice(invoice_id))
            .ok_or(InvoiceError::NotFound)
    }

    pub fn pay_invoice(env: Env, payer: Address, invoice_id: u64) -> Result<(), InvoiceError> {
        payer.require_auth();
        let mut invoice: Invoice = env
            .storage()
            .instance()
            .get(&DataKey::Invoice(invoice_id))
            .ok_or(InvoiceError::NotFound)?;
        if invoice.status != InvoiceStatus::Pending {
            return Err(InvoiceError::NotPending);
        }
        if env.ledger().timestamp() >= invoice.expires_at {
            return Err(InvoiceError::Expired);
        }
        invoice.status = InvoiceStatus::Paid;
        env.storage()
            .instance()
            .set(&DataKey::Invoice(invoice_id), &invoice);
        Ok(())
    }

    pub fn cancel_invoice(
        env: Env,
        caller: Address,
        invoice_id: u64,
    ) -> Result<(), InvoiceError> {
        caller.require_auth();
        let mut invoice: Invoice = env
            .storage()
            .instance()
            .get(&DataKey::Invoice(invoice_id))
            .ok_or(InvoiceError::NotFound)?;
        if invoice.merchant != caller {
            return Err(InvoiceError::Unauthorized);
        }
        if invoice.status != InvoiceStatus::Pending {
            return Err(InvoiceError::NotPending);
        }
        invoice.status = InvoiceStatus::Cancelled;
        env.storage()
            .instance()
            .set(&DataKey::Invoice(invoice_id), &invoice);
        Ok(())
    }

    pub fn pause(env: Env, admin: Address) -> Result<(), InvoiceError> {
        admin.require_auth();
        let stored: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap();
        if stored != admin {
            return Err(InvoiceError::Unauthorized);
        }
        env.storage().instance().set(&DataKey::Paused, &true);
        Ok(())
    }

    pub fn unpause(env: Env, admin: Address) -> Result<(), InvoiceError> {
        admin.require_auth();
        let stored: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap();
        if stored != admin {
            return Err(InvoiceError::Unauthorized);
        }
        env.storage().instance().set(&DataKey::Paused, &false);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger};
    use soroban_sdk::Env;

    fn setup() -> (Env, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, InvoiceContract);
        let admin = Address::generate(&env);
        InvoiceContractClient::new(&env, &contract_id).initialize(&admin);
        env.ledger().set_timestamp(1000);
        (env, contract_id, admin)
    }

    // ── existing tests (updated for new signature) ───────────────────────────

    #[test]
    fn test_create_invoice_min_amount_passes() {
        let (env, cid, _admin) = setup();
        let c = InvoiceContractClient::new(&env, &cid);
        let merchant = Address::generate(&env);
        let result = c.create_invoice(&merchant, &10_000_000u64, &10_500_000u64, &3600u64, &1u64);
        assert_eq!(result, 1);
    }

    #[test]
    fn test_create_invoice_below_min_returns_error() {
        let (env, cid, _admin) = setup();
        let c = InvoiceContractClient::new(&env, &cid);
        let merchant = Address::generate(&env);
        let result = c.try_create_invoice(&merchant, &9_999_999u64, &10_499_999u64, &3600u64, &1u64);
        assert_eq!(result, Err(Ok(InvoiceError::AmountPrecision)));
    }

    #[test]
    fn test_create_invoice_zero_amount_returns_error() {
        let (env, cid, _admin) = setup();
        let c = InvoiceContractClient::new(&env, &cid);
        let merchant = Address::generate(&env);
        let result = c.try_create_invoice(&merchant, &0u64, &0u64, &3600u64, &1u64);
        assert_eq!(result, Err(Ok(InvoiceError::InvalidAmount)));
    }

    // ── InvoiceError boundary tests ──────────────────────────────────────────

    /// Unauthorized: non-merchant caller tries to cancel the invoice.
    #[test]
    fn test_unauthorized_cancel_by_non_merchant() {
        let (env, cid, _admin) = setup();
        let c = InvoiceContractClient::new(&env, &cid);
        let merchant = Address::generate(&env);
        let stranger = Address::generate(&env);
        let id = c.create_invoice(&merchant, &10_000_000u64, &10_000_000u64, &3600u64, &1u64);
        let res = c.try_cancel_invoice(&stranger, &id);
        assert_eq!(res, Err(Ok(InvoiceError::Unauthorized)));
    }

    /// InvalidAmount: gross_usdc less than amount_usdc.
    #[test]
    fn test_invalid_amount_gross_less_than_net() {
        let (env, cid, _admin) = setup();
        let c = InvoiceContractClient::new(&env, &cid);
        let merchant = Address::generate(&env);
        // gross < amount → InvalidAmount
        let res = c.try_create_invoice(&merchant, &20_000_000u64, &10_000_000u64, &3600u64, &1u64);
        assert_eq!(res, Err(Ok(InvoiceError::InvalidAmount)));
    }

    /// Expired: pay an invoice after its expiry timestamp.
    #[test]
    fn test_expired_pay_after_expiry() {
        let (env, cid, _admin) = setup();
        let c = InvoiceContractClient::new(&env, &cid);
        let merchant = Address::generate(&env);
        let payer = Address::generate(&env);
        // timestamp=1000, expires_in=1 → expires_at=1001
        let id = c.create_invoice(&merchant, &10_000_000u64, &10_000_000u64, &1u64, &1u64);
        env.ledger().set_timestamp(1001);
        let res = c.try_pay_invoice(&payer, &id);
        assert_eq!(res, Err(Ok(InvoiceError::Expired)));
    }

    /// Expired boundary: paying at exactly the expiry timestamp is also expired.
    #[test]
    fn test_expired_pay_at_exact_expiry_boundary() {
        let (env, cid, _admin) = setup();
        let c = InvoiceContractClient::new(&env, &cid);
        let merchant = Address::generate(&env);
        let payer = Address::generate(&env);
        let id = c.create_invoice(&merchant, &10_000_000u64, &10_000_000u64, &60u64, &1u64);
        // expires_at = 1000 + 60 = 1060; >= check means 1060 is expired
        env.ledger().set_timestamp(1060);
        let res = c.try_pay_invoice(&payer, &id);
        assert_eq!(res, Err(Ok(InvoiceError::Expired)));
    }

    /// NotFound: get an invoice that does not exist.
    #[test]
    fn test_not_found_get_nonexistent_invoice() {
        let (env, cid, _admin) = setup();
        let c = InvoiceContractClient::new(&env, &cid);
        let res = c.try_get_invoice(&999u64);
        assert_eq!(res, Err(Ok(InvoiceError::NotFound)));
    }

    /// NotFound: pay an invoice that does not exist.
    #[test]
    fn test_not_found_pay_nonexistent_invoice() {
        let (env, cid, _admin) = setup();
        let c = InvoiceContractClient::new(&env, &cid);
        let payer = Address::generate(&env);
        let res = c.try_pay_invoice(&payer, &999u64);
        assert_eq!(res, Err(Ok(InvoiceError::NotFound)));
    }

    /// DuplicateNonce: same merchant + nonce used twice.
    #[test]
    fn test_duplicate_nonce_same_merchant() {
        let (env, cid, _admin) = setup();
        let c = InvoiceContractClient::new(&env, &cid);
        let merchant = Address::generate(&env);
        c.create_invoice(&merchant, &10_000_000u64, &10_000_000u64, &3600u64, &42u64);
        let res = c.try_create_invoice(&merchant, &10_000_000u64, &10_000_000u64, &3600u64, &42u64);
        assert_eq!(res, Err(Ok(InvoiceError::DuplicateNonce)));
    }

    /// Different merchants may reuse the same nonce (no collision).
    #[test]
    fn test_duplicate_nonce_different_merchants_allowed() {
        let (env, cid, _admin) = setup();
        let c = InvoiceContractClient::new(&env, &cid);
        let m1 = Address::generate(&env);
        let m2 = Address::generate(&env);
        c.create_invoice(&m1, &10_000_000u64, &10_000_000u64, &3600u64, &1u64);
        let id2 = c.create_invoice(&m2, &10_000_000u64, &10_000_000u64, &3600u64, &1u64);
        assert_eq!(id2, 2);
    }

    /// AmountPrecision: exactly one stroop below the minimum.
    #[test]
    fn test_amount_precision_below_minimum() {
        let (env, cid, _admin) = setup();
        let c = InvoiceContractClient::new(&env, &cid);
        let merchant = Address::generate(&env);
        let res = c.try_create_invoice(
            &merchant,
            &(MIN_AMOUNT_STROOPS - 1),
            &(MIN_AMOUNT_STROOPS - 1),
            &3600u64,
            &1u64,
        );
        assert_eq!(res, Err(Ok(InvoiceError::AmountPrecision)));
    }

    /// AmountPrecision: value of 1 is non-zero but below minimum.
    #[test]
    fn test_amount_precision_value_of_one() {
        let (env, cid, _admin) = setup();
        let c = InvoiceContractClient::new(&env, &cid);
        let merchant = Address::generate(&env);
        let res = c.try_create_invoice(&merchant, &1u64, &1u64, &3600u64, &1u64);
        assert_eq!(res, Err(Ok(InvoiceError::AmountPrecision)));
    }

    /// ContractPaused: create_invoice is blocked when the contract is paused.
    #[test]
    fn test_contract_paused_blocks_create_invoice() {
        let (env, cid, admin) = setup();
        let c = InvoiceContractClient::new(&env, &cid);
        let merchant = Address::generate(&env);
        c.pause(&admin);
        let res = c.try_create_invoice(&merchant, &10_000_000u64, &10_000_000u64, &3600u64, &1u64);
        assert_eq!(res, Err(Ok(InvoiceError::ContractPaused)));
    }
}
