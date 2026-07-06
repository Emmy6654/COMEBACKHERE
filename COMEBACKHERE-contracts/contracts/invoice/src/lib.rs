#![no_std]

mod events;

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, Address, Env, IntoVal, Symbol, Vec,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum ContractError {
    Unauthorized = 1,
    ContractPaused = 2,
    AlreadyInitialized = 3,
    InvoiceNotFound = 4,
    InvoiceAlreadyPaid = 5,
    InvoiceExpired = 6,
    InvoiceCancelled = 7,
    NotMerchant = 8,
    NotCustomer = 9,
    RefundNotRequested = 10,
    AlreadyRefundRequested = 11,
    GraceWindowNotExpired = 12,
    DuplicateNonce = 13,
    TreasuryNotConfigured = 14,
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
    pub customer: Address,
    pub amount: i128,
    pub token: Address,
    pub status: InvoiceStatus,
    pub created_at: u64,
    pub expires_at: u64,
}

#[contracttype]
pub enum DataKey {
    Admin,
    Paused,
    Invoice(u64),
    InvoiceCount,
    GraceWindow,
    Nonce(Address, u64),
    TreasuryContract,
}

fn admin(env: &Env) -> Address {
    env.storage().persistent().get(&DataKey::Admin).unwrap()
}

fn is_paused(env: &Env) -> bool {
    env.storage()
        .persistent()
        .get(&DataKey::Paused)
        .unwrap_or(false)
}

fn check_not_paused(env: &Env) -> Result<(), ContractError> {
    if is_paused(env) {
        Err(ContractError::ContractPaused)
    } else {
        Ok(())
    }
}

fn check_admin(env: &Env, addr: &Address) -> Result<(), ContractError> {
    if addr != &admin(env) {
        Err(ContractError::Unauthorized)
    } else {
        Ok(())
    }
}

#[contract]
pub struct InvoiceContract;

#[contractimpl]
impl InvoiceContract {
    pub fn initialize(env: Env, admin: Address) -> Result<(), ContractError> {
        if env.storage().persistent().has(&DataKey::Admin) {
            return Err(ContractError::AlreadyInitialized);
        }
        env.storage()
            .persistent()
            .set(&DataKey::Admin, &admin);
        env.storage()
            .persistent()
            .set(&DataKey::GraceWindow, &86400u64);
        env.storage()
            .persistent()
            .set(&DataKey::InvoiceCount, &0u64);
        env.storage()
            .persistent()
            .set(&DataKey::Paused, &false);
        Ok(())
    }

    pub fn create_invoice(
        env: Env,
        merchant: Address,
        customer: Address,
        amount: i128,
        token: Address,
        expires_at: u64,
        nonce: u64,
    ) -> Result<u64, ContractError> {
        check_not_paused(&env)?;
        merchant.require_auth();

        let nonce_key = DataKey::Nonce(merchant.clone(), nonce);
        if env.storage().persistent().has(&nonce_key) {
            return Err(ContractError::DuplicateNonce);
        }
        env.storage()
            .persistent()
            .set(&nonce_key, &true);

        let mut count: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::InvoiceCount)
            .unwrap_or(0);
        count += 1;
        env.storage()
            .persistent()
            .set(&DataKey::InvoiceCount, &count);

        let now = env.ledger().timestamp();
        let invoice = Invoice {
            id: count,
            merchant: merchant.clone(),
            customer,
            amount,
            token,
            status: InvoiceStatus::Pending,
            created_at: now,
            expires_at,
        };
        env.storage()
            .persistent()
            .set(&DataKey::Invoice(count), &invoice);

        events::invoice_created(&env, &merchant, &count);
        Ok(count)
    }

    pub fn get_invoice(env: Env, invoice_id: u64) -> Result<Invoice, ContractError> {
        env.storage()
            .persistent()
            .get(&DataKey::Invoice(invoice_id))
            .ok_or(ContractError::InvoiceNotFound)
    }

    pub fn get_invoice_status(env: Env, invoice_id: u64) -> Result<InvoiceStatus, ContractError> {
        let invoice = env
            .storage()
            .persistent()
            .get::<DataKey, Invoice>(&DataKey::Invoice(invoice_id))
            .ok_or(ContractError::InvoiceNotFound)?;
        Ok(invoice.status)
    }

    pub fn mark_paids(env: Env, invoice_ids: Vec<u64>) -> Result<(), ContractError> {
        check_not_paused(&env)?;
        for id in invoice_ids.iter() {
            let mut invoice = env
                .storage()
                .persistent()
                .get::<DataKey, Invoice>(&DataKey::Invoice(id))
                .ok_or(ContractError::InvoiceNotFound)?;
            if invoice.status != InvoiceStatus::Pending {
                return Err(ContractError::InvoiceAlreadyPaid);
            }
            if env.ledger().timestamp() >= invoice.expires_at {
                return Err(ContractError::InvoiceExpired);
            }
            invoice.status = InvoiceStatus::Paid;
            env.storage()
                .persistent()
                .set(&DataKey::Invoice(id), &invoice);
            events::invoice_paid(&env, &id);
        }
        Ok(())
    }

    pub fn cancel_invoiced(env: Env, invoice_id: u64, caller: Address) -> Result<(), ContractError> {
        check_not_paused(&env)?;
        let mut invoice = env
            .storage()
            .persistent()
            .get::<DataKey, Invoice>(&DataKey::Invoice(invoice_id))
            .ok_or(ContractError::InvoiceNotFound)?;
        if caller != invoice.merchant && caller != invoice.customer {
            return Err(ContractError::Unauthorized);
        }
        if invoice.status != InvoiceStatus::Pending {
            return Err(ContractError::InvoiceCancelled);
        }
        invoice.status = InvoiceStatus::Cancelled;
        env.storage()
            .persistent()
            .set(&DataKey::Invoice(invoice_id), &invoice);
        events::invoice_cancelled(&env, &invoice_id);
        Ok(())
    }

    pub fn request_refund(
        env: Env,
        invoice_id: u64,
        caller: Address,
    ) -> Result<(), ContractError> {
        check_not_paused(&env)?;
        let mut invoice = env
            .storage()
            .persistent()
            .get::<DataKey, Invoice>(&DataKey::Invoice(invoice_id))
            .ok_or(ContractError::InvoiceNotFound)?;
        if caller != invoice.customer {
            return Err(ContractError::NotCustomer);
        }
        if invoice.status != InvoiceStatus::Paid {
            return Err(ContractError::InvoiceNotFound);
        }
        if invoice.status == InvoiceStatus::RefundRequested {
            return Err(ContractError::AlreadyRefundRequested);
        }
        invoice.status = InvoiceStatus::RefundRequested;
        env.storage()
            .persistent()
            .set(&DataKey::Invoice(invoice_id), &invoice);
        events::invoice_refund_req(&env, &invoice_id);
        Ok(())
    }

    pub fn release_escrow(
        env: Env,
        invoice_id: u64,
        caller: Address,
    ) -> Result<(), ContractError> {
        check_not_paused(&env)?;
        let mut invoice = env
            .storage()
            .persistent()
            .get::<DataKey, Invoice>(&DataKey::Invoice(invoice_id))
            .ok_or(ContractError::InvoiceNotFound)?;
        if caller != invoice.merchant {
            return Err(ContractError::NotMerchant);
        }
        if invoice.status != InvoiceStatus::RefundRequested {
            return Err(ContractError::RefundNotRequested);
        }
        let grace_window: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::GraceWindow)
            .unwrap();
        if env.ledger().timestamp() < invoice.created_at + grace_window {
            return Err(ContractError::GraceWindowNotExpired);
        }
        invoice.status = InvoiceStatus::Released;
        env.storage()
            .persistent()
            .set(&DataKey::Invoice(invoice_id), &invoice);
        events::escrow_released(&env, &invoice_id);
        Ok(())
    }

    pub fn batch_expire(env: Env, invoice_ids: Vec<u64>) -> Result<(), ContractError> {
        check_not_paused(&env)?;
        let now = env.ledger().timestamp();
        for id in invoice_ids.iter() {
            let mut invoice = env
                .storage()
                .persistent()
                .get::<DataKey, Invoice>(&DataKey::Invoice(id))
                .ok_or(ContractError::InvoiceNotFound)?;
            if invoice.status == InvoiceStatus::Pending && now >= invoice.expires_at {
                invoice.status = InvoiceStatus::Expired;
                env.storage()
                    .persistent()
                    .set(&DataKey::Invoice(id), &invoice);
                events::invoice_expired(&env, &id);
            }
        }
        Ok(())
    }

    /// Configure the treasury contract address (admin only).
    pub fn set_treasury(env: Env, caller: Address, treasury: Address) -> Result<(), ContractError> {
        check_admin(&env, &caller)?;
        env.storage()
            .persistent()
            .set(&DataKey::TreasuryContract, &treasury);
        Ok(())
    }

    pub fn get_treasury(env: Env) -> Option<Address> {
        env.storage()
            .persistent()
            .get(&DataKey::TreasuryContract)
    }

    /// Raise a dispute on an invoice, cross-contract calling treasury place_on_hold.
    /// Emits a dispute_raised event on success.
    pub fn raise_dispute(
        env: Env,
        invoice_id: u64,
        settlement_id: u64,
        claimant: Address,
        reason: u32,
    ) -> Result<(), ContractError> {
        check_not_paused(&env)?;
        claimant.require_auth();

        // Ensure invoice exists.
        env.storage()
            .persistent()
            .get::<DataKey, Invoice>(&DataKey::Invoice(invoice_id))
            .ok_or(ContractError::InvoiceNotFound)?;

        let treasury: Address = env
            .storage()
            .persistent()
            .get(&DataKey::TreasuryContract)
            .ok_or(ContractError::TreasuryNotConfigured)?;

        // Cross-contract: treasury.raise_dispute(claimant, settlement_id, reason)
        let _: () = env.invoke_contract(
            &treasury,
            &Symbol::new(&env, "raise_dispute"),
            soroban_sdk::vec![
                &env,
                claimant.clone().into_val(&env),
                settlement_id.into_val(&env),
                reason.into_val(&env),
            ],
        );

        events::dispute_raised(&env, &invoice_id, &settlement_id, &claimant);
        Ok(())
    }

    pub fn pause(env: Env, caller: Address) -> Result<(), ContractError> {
        check_admin(&env, &caller)?;
        env.storage()
            .persistent()
            .set(&DataKey::Paused, &true);
        events::contract_paused(&env);
        Ok(())
    }

    pub fn unpause(env: Env, caller: Address) -> Result<(), ContractError> {
        check_admin(&env, &caller)?;
        env.storage()
            .persistent()
            .set(&DataKey::Paused, &false);
        events::contract_unpaused(&env);
        Ok(())
    }

    pub fn set_grace_window(env: Env, caller: Address, window: u64) -> Result<(), ContractError> {
        check_not_paused(&env)?;
        check_admin(&env, &caller)?;
        env.storage()
            .persistent()
            .set(&DataKey::GraceWindow, &window);
        Ok(())
    }

    pub fn get_grace_window(env: Env) -> u64 {
        env.storage()
            .persistent()
            .get(&DataKey::GraceWindow)
            .unwrap_or(86400)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger};
    use soroban_sdk::Env;

    fn setup_contract(ts: u64) -> (Env, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let contract_id = env.register(InvoiceContract, ());
        InvoiceContractClient::new(&env, &contract_id).initialize(&admin);
        env.ledger().with_mut(|li| li.timestamp = ts);
        (env, contract_id, admin)
    }

    #[test]
    fn test_create_invoice_with_unique_nonce_succeeds() {
        let (env, cid, _admin) = setup_contract(1000);
        let client = InvoiceContractClient::new(&env, &cid);
        let merchant = Address::generate(&env);
        let customer = Address::generate(&env);
        let token = Address::generate(&env);
        let invoice_id = client.create_invoice(&merchant, &customer, &1000i128, &token, &5000, &1);
        assert_eq!(invoice_id, 1);
    }

    #[test]
    fn test_create_invoice_with_duplicate_nonce_returns_error() {
        let (env, cid, _admin) = setup_contract(1000);
        let client = InvoiceContractClient::new(&env, &cid);
        let merchant = Address::generate(&env);
        let customer = Address::generate(&env);
        let token = Address::generate(&env);

        client.create_invoice(&merchant, &customer, &1000i128, &token, &5000, &1);

        let result = client.try_create_invoice(&merchant, &customer, &1000i128, &token, &5000, &1);
        assert_eq!(result, Err(Ok(ContractError::DuplicateNonce)));
    }

    #[test]
    fn test_set_grace_window_when_paused_returns_contract_paused() {
        let (env, cid, admin) = setup_contract(1000);
        let client = InvoiceContractClient::new(&env, &cid);
        client.pause(&admin);
        let res = client.try_set_grace_window(&admin, &3600u64);
        assert_eq!(res, Err(Ok(ContractError::ContractPaused)));
    }

    #[test]
    fn test_different_merchants_can_reuse_same_nonce() {
        let (env, cid, _admin) = setup_contract(1000);
        let client = InvoiceContractClient::new(&env, &cid);
        let merchant_a = Address::generate(&env);
        let merchant_b = Address::generate(&env);
        let customer = Address::generate(&env);
        let token = Address::generate(&env);

        client.create_invoice(&merchant_a, &customer, &1000i128, &token, &5000, &1);
        client.create_invoice(&merchant_b, &customer, &1000i128, &token, &5000, &1);

        let invoice_a = client.get_invoice(&1);
        let invoice_b = client.get_invoice(&2);
        assert_eq!(invoice_a.merchant, merchant_a);
        assert_eq!(invoice_b.merchant, merchant_b);
    }

    #[test]
    fn test_pause_blocks_create_invoice() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let merchant = Address::generate(&env);
        let customer = Address::generate(&env);
        let token = Address::generate(&env);
        env.ledger().set_timestamp(1000);

        let contract_id = env.register(InvoiceContract, ());
        let client = InvoiceContractClient::new(&env, &contract_id);
        client.initialize(&admin);

        client.pause(&admin);

        let result = client.try_create_invoice(&merchant, &customer, &1000i128, &token, &5000, &1);
        assert_eq!(result, Err(Ok(ContractError::ContractPaused)));
    }

    #[test]
    fn test_unpause_restores_create_invoice() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let merchant = Address::generate(&env);
        let customer = Address::generate(&env);
        let token = Address::generate(&env);
        env.ledger().set_timestamp(1000);

        let contract_id = env.register(InvoiceContract, ());
        let client = InvoiceContractClient::new(&env, &contract_id);
        client.initialize(&admin);

        client.pause(&admin);
        let result = client.try_create_invoice(&merchant, &customer, &1000i128, &token, &5000, &1);
        assert_eq!(result, Err(Ok(ContractError::ContractPaused)));

        client.unpause(&admin);
        let invoice_id = client.create_invoice(&merchant, &customer, &1000i128, &token, &5000, &2);
        assert_eq!(invoice_id, 1);
    }

    #[test]
    fn test_pause_unauthorized() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let non_admin = Address::generate(&env);

        let contract_id = env.register(InvoiceContract, ());
        let client = InvoiceContractClient::new(&env, &contract_id);
        client.initialize(&admin);

        let result = client.try_pause(&non_admin);
        assert_eq!(result, Err(Ok(ContractError::Unauthorized)));
    }

    #[test]
    fn test_unpause_unauthorized() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let non_admin = Address::generate(&env);

        let contract_id = env.register(InvoiceContract, ());
        let client = InvoiceContractClient::new(&env, &contract_id);
        client.initialize(&admin);

        client.pause(&admin);

        let result = client.try_unpause(&non_admin);
        assert_eq!(result, Err(Ok(ContractError::Unauthorized)));
    }

    // ── raise_dispute integration tests ─────────────────────────────────────

    mod treasury_stub {
        use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, Env};

        #[contracterror]
        #[derive(Copy, Clone, Debug, Eq, PartialEq)]
        pub enum StubError {
            Paused = 1,
        }

        #[contracttype]
        pub enum StubKey {
            Held(u64),
        }

        #[contract]
        pub struct TreasuryStub;

        #[contractimpl]
        impl TreasuryStub {
            pub fn raise_dispute(
                e: Env,
                _signer: Address,
                settlement_id: u64,
                _reason: u32,
            ) -> Result<(), StubError> {
                e.storage()
                    .instance()
                    .set(&StubKey::Held(settlement_id), &true);
                Ok(())
            }

            pub fn was_held(e: Env, settlement_id: u64) -> bool {
                e.storage()
                    .instance()
                    .get(&StubKey::Held(settlement_id))
                    .unwrap_or(false)
            }
        }
    }

    use treasury_stub::{TreasuryStub, TreasuryStubClient};

    fn setup_with_treasury(ts: u64) -> (Env, Address, Address, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let invoice_cid = env.register(InvoiceContract, ());
        let treasury_cid = env.register(TreasuryStub, ());
        let invoice_client = InvoiceContractClient::new(&env, &invoice_cid);
        invoice_client.initialize(&admin);
        invoice_client.set_treasury(&admin, &treasury_cid);
        env.ledger().with_mut(|li| li.timestamp = ts);
        (env, invoice_cid, treasury_cid, admin, Address::generate(&env))
    }

    #[test]
    fn test_raise_dispute_places_settlement_on_hold() {
        let (env, invoice_cid, treasury_cid, _admin, claimant) = setup_with_treasury(1000);
        let invoice_client = InvoiceContractClient::new(&env, &invoice_cid);
        let treasury_client = TreasuryStubClient::new(&env, &treasury_cid);

        let merchant = Address::generate(&env);
        let customer = Address::generate(&env);
        let token = Address::generate(&env);
        let invoice_id =
            invoice_client.create_invoice(&merchant, &customer, &1000i128, &token, &9999, &1);

        invoice_client.raise_dispute(&invoice_id, &1u64, &claimant, &1u32);

        assert!(treasury_client.was_held(&1u64), "settlement should be on hold");
    }

    #[test]
    fn test_raise_dispute_emits_event() {
        let (env, invoice_cid, _treasury_cid, _admin, claimant) = setup_with_treasury(1000);
        let invoice_client = InvoiceContractClient::new(&env, &invoice_cid);

        let merchant = Address::generate(&env);
        let customer = Address::generate(&env);
        let token = Address::generate(&env);
        let invoice_id =
            invoice_client.create_invoice(&merchant, &customer, &500i128, &token, &9999, &1);

        invoice_client.raise_dispute(&invoice_id, &2u64, &claimant, &1u32);

        // invoice_created + dispute_raised = at least 2 events
        let all_events = env.events().all();
        assert!(all_events.len() >= 2, "dispute_raised event should be emitted");
    }

    #[test]
    fn test_raise_dispute_invoice_not_found_fails() {
        let (env, invoice_cid, _treasury_cid, _admin, claimant) = setup_with_treasury(1000);
        let invoice_client = InvoiceContractClient::new(&env, &invoice_cid);

        let result = invoice_client.try_raise_dispute(&999u64, &1u64, &claimant, &1u32);
        assert_eq!(result, Err(Ok(ContractError::InvoiceNotFound)));
    }

    #[test]
    fn test_raise_dispute_without_treasury_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let invoice_cid = env.register(InvoiceContract, ());
        let invoice_client = InvoiceContractClient::new(&env, &invoice_cid);
        invoice_client.initialize(&admin);
        env.ledger().with_mut(|li| li.timestamp = 1000);

        let merchant = Address::generate(&env);
        let customer = Address::generate(&env);
        let token = Address::generate(&env);
        let claimant = Address::generate(&env);
        let invoice_id =
            invoice_client.create_invoice(&merchant, &customer, &100i128, &token, &9999, &1);

        let result = invoice_client.try_raise_dispute(&invoice_id, &1u64, &claimant, &1u32);
        assert_eq!(result, Err(Ok(ContractError::TreasuryNotConfigured)));
    }

    #[test]
    fn test_raise_dispute_when_paused_fails() {
        let (env, invoice_cid, _treasury_cid, admin, claimant) = setup_with_treasury(1000);
        let invoice_client = InvoiceContractClient::new(&env, &invoice_cid);

        let merchant = Address::generate(&env);
        let customer = Address::generate(&env);
        let token = Address::generate(&env);
        let invoice_id =
            invoice_client.create_invoice(&merchant, &customer, &100i128, &token, &9999, &1);

        invoice_client.pause(&admin);

        let result = invoice_client.try_raise_dispute(&invoice_id, &1u64, &claimant, &1u32);
        assert_eq!(result, Err(Ok(ContractError::ContractPaused)));
    }
}
