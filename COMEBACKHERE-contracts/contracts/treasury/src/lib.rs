#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, contracterror, Address, Env, Symbol, Vec};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SettlementStatus {
    Pending,
    Executed,
    PartiallyExecuted,
    OnHold,
    Cancelled,
}

#[contracttype]
pub struct Settlement {
    pub token: Address,
    pub amount: u64,
    pub merchant: Address,
    pub status: SettlementStatus,
    pub approval_weight: u64,
    pub proposer: Address,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum TreasuryError {
    ContractPaused = 1,
    NotPending = 2,
    InsufficientApprovals = 3,
    TokenNotAllowed = 4,
    Unauthorized = 5,
    InvalidThreshold = 6,
    DuplicateSigner = 7,
    InvalidWeightSum = 8,
}

#[contracttype]
pub enum DataKey {
    Admin,
    Paused,
    Signer(Address),
    Settlement(u64),
    NextSettlementId,
    Threshold,
    TokenAllowlist,
}

fn is_paused(e: &Env) -> bool {
    e.storage().instance().get(&DataKey::Paused).unwrap_or(false)
}

fn check_not_paused(e: &Env) -> Result<(), TreasuryError> {
    if is_paused(e) {
        Err(TreasuryError::ContractPaused)
    } else {
        Ok(())
    }
}

#[contract]
pub struct TreasuryContract;

#[contractimpl]
impl TreasuryContract {
    pub fn initialize(
        e: Env,
        signers: Vec<(Address, u64)>,
        threshold: u64,
        admin: Address,
    ) -> Result<(), TreasuryError> {
        admin.require_auth();
        let mut seen: Vec<Address> = Vec::new(&e);
        let mut total_weight: u64 = 0;
        for (signer, weight) in signers.iter() {
            if seen.contains(&signer) {
                return Err(TreasuryError::DuplicateSigner);
            }
            seen.push_back(signer.clone());
            total_weight += weight;
        }
        if total_weight < threshold {
            return Err(TreasuryError::InvalidWeightSum);
        }
        e.storage().instance().set(&DataKey::Admin, &admin);
        e.storage().instance().set(&DataKey::Threshold, &threshold);
        e.storage().instance().set(&DataKey::Paused, &false);
        e.storage().instance().set(&DataKey::NextSettlementId, &1u64);
        for (signer, weight) in signers.iter() {
            e.storage()
                .instance()
                .set(&DataKey::Signer(signer.clone()), &weight);
        }
        Ok(())
    }

    pub fn set_signer(
        e: Env,
        admin: Address,
        signer: Address,
        weight: u64,
    ) -> Result<(), TreasuryError> {
        check_not_paused(&e)?;
        Self::check_admin(&e, &admin)?;
        e.storage()
            .instance()
            .set(&DataKey::Signer(signer), &weight);
        Ok(())
    }

    pub fn propose_settlement(
        e: Env,
        signer: Address,
        token: Address,
        amount: u64,
        merchant: Address,
    ) -> Result<u64, TreasuryError> {
        check_not_paused(&e)?;
        signer.require_auth();

        let allowlist: Vec<Address> = e
            .storage()
            .instance()
            .get(&DataKey::TokenAllowlist)
            .unwrap_or_else(|| Vec::new(&e));
        if !allowlist.is_empty() && !allowlist.contains(&token) {
            return Err(TreasuryError::TokenNotAllowed);
        }

        let settlement_id: u64 = e
            .storage()
            .instance()
            .get(&DataKey::NextSettlementId)
            .unwrap_or(1u64);

        let settlement = Settlement {
            token,
            amount,
            merchant,
            status: SettlementStatus::Pending,
            approval_weight: 0u64,
            proposer: signer,
        };

        e.storage()
            .instance()
            .set(&DataKey::Settlement(settlement_id), &settlement);
        e.storage()
            .instance()
            .set(&DataKey::NextSettlementId, &(settlement_id + 1));

        Ok(settlement_id)
    }

    pub fn approve_settlement(
        e: Env,
        signer: Address,
        settlement_id: u64,
    ) -> Result<(), TreasuryError> {
        check_not_paused(&e)?;
        signer.require_auth();
        let mut settlement = Self::get_settlement_internal(&e, settlement_id);
        if settlement.status != SettlementStatus::Pending {
            return Err(TreasuryError::NotPending);
        }
        let weight: u64 = e
            .storage()
            .instance()
            .get(&DataKey::Signer(signer.clone()))
            .unwrap_or(0u64);
        settlement.approval_weight += weight;
        e.storage()
            .instance()
            .set(&DataKey::Settlement(settlement_id), &settlement);
        Ok(())
    }

    pub fn execute_settlement(
        e: Env,
        signer: Address,
        settlement_id: u64,
        _token_contract: Address,
    ) -> Result<(), TreasuryError> {
        check_not_paused(&e)?;
        signer.require_auth();
        let mut settlement = Self::get_settlement_internal(&e, settlement_id);
        if settlement.status != SettlementStatus::Pending {
            return Err(TreasuryError::NotPending);
        }
        let threshold: u64 = e
            .storage()
            .instance()
            .get(&DataKey::Threshold)
            .unwrap_or(0u64);
        if settlement.approval_weight < threshold {
            return Err(TreasuryError::InsufficientApprovals);
        }
        settlement.status = SettlementStatus::Executed;
        e.storage()
            .instance()
            .set(&DataKey::Settlement(settlement_id), &settlement);
        Ok(())
    }

    pub fn get_pending_settlements(
        e: Env,
        offset: Option<u32>,
        limit: Option<u32>,
    ) -> Vec<u64> {
        let next_id: u64 = e
            .storage()
            .instance()
            .get(&DataKey::NextSettlementId)
            .unwrap_or(1u64);
        let cap: u32 = limit.unwrap_or(100).min(100);
        let skip: u32 = offset.unwrap_or(0);

        let mut result: Vec<u64> = Vec::new(&e);
        let mut matched: u32 = 0;
        let mut collected: u32 = 0;

        for id in 1..next_id {
            if let Some(s) = e
                .storage()
                .instance()
                .get::<DataKey, Settlement>(&DataKey::Settlement(id))
            {
                if matches!(s.status, SettlementStatus::Pending) {
                    if matched >= skip {
                        if collected >= cap {
                            break;
                        }
                        result.push_back(id);
                        collected += 1;
                    }
                    matched += 1;
                }
            }
        }
        result
    }

    fn check_admin(e: &Env, admin: &Address) -> Result<(), TreasuryError> {
        admin.require_auth();
        let stored_admin: Address = e.storage().instance().get(&DataKey::Admin).unwrap();
        if stored_admin != *admin {
            return Err(TreasuryError::Unauthorized);
        }
        Ok(())
    }

    pub fn pause(e: Env, admin: Address) -> Result<(), TreasuryError> {
        Self::check_admin(&e, &admin)?;
        e.storage().instance().set(&DataKey::Paused, &true);
        Ok(())
    }

    pub fn unpause(e: Env, admin: Address) -> Result<(), TreasuryError> {
        Self::check_admin(&e, &admin)?;
        e.storage().instance().set(&DataKey::Paused, &false);
        Ok(())
    }

    pub fn get_threshold(e: Env) -> u64 {
        e.storage()
            .instance()
            .get(&DataKey::Threshold)
            .unwrap_or(0u64)
    }

    pub fn update_threshold(
        e: Env,
        admin: Address,
        new_threshold: u32,
    ) -> Result<(), TreasuryError> {
        check_not_paused(&e)?;
        Self::check_admin(&e, &admin)?;
        if new_threshold == 0 {
            return Err(TreasuryError::InvalidThreshold);
        }
        let old_threshold: u64 = e
            .storage()
            .instance()
            .get(&DataKey::Threshold)
            .unwrap_or(0u64);
        let threshold = new_threshold as u64;
        e.storage().instance().set(&DataKey::Threshold, &threshold);
        e.events().publish(
            (Symbol::new(&e, "threshold_updated"),),
            (old_threshold, threshold),
        );
        Ok(())
    }

    pub fn raise_dispute(
        e: Env,
        signer: Address,
        settlement_id: u64,
        _reason: u32,
    ) -> Result<(), TreasuryError> {
        check_not_paused(&e)?;
        signer.require_auth();
        let mut settlement = Self::get_settlement_internal(&e, settlement_id);
        settlement.status = SettlementStatus::OnHold;
        e.storage()
            .instance()
            .set(&DataKey::Settlement(settlement_id), &settlement);
        Ok(())
    }

    pub fn resolve_dispute(
        e: Env,
        signer: Address,
        _settlement_id: u64,
        _resolve_in_favor: bool,
    ) -> Result<(), TreasuryError> {
        check_not_paused(&e)?;
        signer.require_auth();
        Ok(())
    }

    /// Update the merchant (payout) address on a pending settlement.
    ///
    /// Only the current merchant of the settlement may call this.
    /// The change takes effect immediately; execution will send funds
    /// to the new address.
    pub fn update_settlement_merchant(
        e: Env,
        merchant_caller: Address,
        settlement_id: u64,
        new_merchant: Address,
    ) -> Result<(), TreasuryError> {
        check_not_paused(&e)?;
        merchant_caller.require_auth();

        let mut settlement = Self::get_settlement_internal(&e, settlement_id);

        if settlement.status != SettlementStatus::Pending {
            return Err(TreasuryError::NotPending);
        }
        if settlement.merchant != merchant_caller {
            return Err(TreasuryError::Unauthorized);
        }

        let old_merchant = settlement.merchant;
        settlement.merchant = new_merchant;

        e.storage()
            .instance()
            .set(&DataKey::Settlement(settlement_id), &settlement);

        e.events().publish(
            (Symbol::new(&e, "merchant_updated"), settlement_id),
            (old_merchant, new_merchant),
        );

        Ok(())
    }

    /// Return the full settlement struct (query-only, no auth required).
    pub fn get_settlement(e: Env, settlement_id: u64) -> Option<Settlement> {
        e.storage()
            .instance()
            .get(&DataKey::Settlement(settlement_id))
    }

    pub fn deposit(e: Env, from: Address, _amount: u64) -> Result<(), TreasuryError> {
        check_not_paused(&e)?;
        from.require_auth();
        Ok(())
    }

    pub fn withdraw(
        e: Env,
        admin: Address,
        _to: Address,
        _amount: u64,
    ) -> Result<(), TreasuryError> {
        check_not_paused(&e)?;
        Self::check_admin(&e, &admin)?;
        Ok(())
    }

    pub fn add_token_to_allowlist(
        e: Env,
        admin: Address,
        token: Address,
    ) -> Result<(), TreasuryError> {
        check_not_paused(&e)?;
        Self::check_admin(&e, &admin)?;
        let mut allowlist: Vec<Address> = e
            .storage()
            .instance()
            .get(&DataKey::TokenAllowlist)
            .unwrap_or_else(|| Vec::new(&e));
        if !allowlist.contains(&token) {
            allowlist.push_back(token);
        }
        e.storage()
            .instance()
            .set(&DataKey::TokenAllowlist, &allowlist);
        Ok(())
    }

    pub fn remove_token_from_allowlist(
        e: Env,
        admin: Address,
        token: Address,
    ) -> Result<(), TreasuryError> {
        check_not_paused(&e)?;
        Self::check_admin(&e, &admin)?;
        let allowlist: Vec<Address> = e
            .storage()
            .instance()
            .get(&DataKey::TokenAllowlist)
            .unwrap_or_else(|| Vec::new(&e));
        let mut updated = Vec::new(&e);
        for t in allowlist.iter() {
            if t != token {
                updated.push_back(t);
            }
        }
        e.storage()
            .instance()
            .set(&DataKey::TokenAllowlist, &updated);
        Ok(())
    }

    fn get_settlement_internal(e: &Env, settlement_id: u64) -> Settlement {
        e.storage()
            .instance()
            .get(&DataKey::Settlement(settlement_id))
            .unwrap()
    }
}

#[cfg(test)]
mod integration_settlement_multisig;

#[cfg(test)]
mod integration_dispute_lifecycle;

#[cfg(test)]
mod integration_update_merchant;

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    fn setup() -> (Env, soroban_sdk::Address) {
        let e = Env::default();
        e.mock_all_auths();
        let contract_id = e.register(TreasuryContract, ());
        (e, contract_id)
    }

    fn client<'a>(e: &'a Env, id: &'a soroban_sdk::Address) -> TreasuryContractClient<'a> {
        TreasuryContractClient::new(e, id)
    }

    // ── existing pagination tests ────────────────────────────────────────────

    #[test]
    fn test_empty_returns_empty() {
        let (e, id) = setup();
        let c = client(&e, &id);
        let admin = soroban_sdk::Address::generate(&e);
        let signer = soroban_sdk::Address::generate(&e);
        c.initialize(&soroban_sdk::vec![&e, (signer.clone(), 1u64)], &1, &admin);
        let result = c.get_pending_settlements(&None, &None);
        assert_eq!(result.len(), 0);
    }

    #[test]
    fn test_single_pending() {
        let (e, id) = setup();
        let c = client(&e, &id);
        let admin = soroban_sdk::Address::generate(&e);
        let token = soroban_sdk::Address::generate(&e);
        let merchant = soroban_sdk::Address::generate(&e);
        let signer = soroban_sdk::Address::generate(&e);
        c.initialize(
            &soroban_sdk::vec![&e, (signer.clone(), 1u64)],
            &1,
            &admin,
        );
        let sid = c.propose_settlement(&signer, &token, &1000u64, &merchant);
        let result = c.get_pending_settlements(&None, &None);
        assert_eq!(result.len(), 1);
        assert_eq!(result.get(0).unwrap(), sid);
    }

    #[test]
    fn test_mixed_statuses_filtered() {
        let (e, id) = setup();
        let c = client(&e, &id);
        let admin = soroban_sdk::Address::generate(&e);
        let token = soroban_sdk::Address::generate(&e);
        let merchant = soroban_sdk::Address::generate(&e);
        let signer = soroban_sdk::Address::generate(&e);
        c.initialize(
            &soroban_sdk::vec![&e, (signer.clone(), 2u64)],
            &1,
            &admin,
        );
        let s1 = c.propose_settlement(&signer, &token, &1000u64, &merchant);
        let s2 = c.propose_settlement(&signer, &token, &2000u64, &merchant);
        c.approve_settlement(&signer, &s1);
        c.execute_settlement(&signer, &s1, &token);
        let result = c.get_pending_settlements(&None, &None);
        assert_eq!(result.len(), 1);
        assert_eq!(result.get(0).unwrap(), s2);
    }

    #[test]
    fn test_pagination_offset_and_limit() {
        let (e, id) = setup();
        let c = client(&e, &id);
        let admin = soroban_sdk::Address::generate(&e);
        let token = soroban_sdk::Address::generate(&e);
        let merchant = soroban_sdk::Address::generate(&e);
        let signer = soroban_sdk::Address::generate(&e);
        c.initialize(
            &soroban_sdk::vec![&e, (signer.clone(), 1u64)],
            &1,
            &admin,
        );
        for _ in 0..5 {
            c.propose_settlement(&signer, &token, &100u64, &merchant);
        }
        let page = c.get_pending_settlements(&Some(2u32), &Some(2u32));
        assert_eq!(page.len(), 2);
        assert_eq!(page.get(0).unwrap(), 3u64);
        assert_eq!(page.get(1).unwrap(), 4u64);
    }

    #[test]
    fn test_limit_capped_at_100() {
        let (e, id) = setup();
        let c = client(&e, &id);
        let admin = soroban_sdk::Address::generate(&e);
        let token = soroban_sdk::Address::generate(&e);
        let merchant = soroban_sdk::Address::generate(&e);
        let signer = soroban_sdk::Address::generate(&e);
        c.initialize(
            &soroban_sdk::vec![&e, (signer.clone(), 1u64)],
            &1,
            &admin,
        );
        for _ in 0..5 {
            c.propose_settlement(&signer, &token, &100u64, &merchant);
        }
        let result = c.get_pending_settlements(&None, &Some(200u32));
        assert_eq!(result.len(), 5);
    }

    // ── paused guard tests ───────────────────────────────────────────────────

    #[test]
    fn test_propose_when_paused_returns_contract_paused() {
        let (e, id) = setup();
        let c = client(&e, &id);
        let admin = soroban_sdk::Address::generate(&e);
        let signer = soroban_sdk::Address::generate(&e);
        let token = soroban_sdk::Address::generate(&e);
        let merchant = soroban_sdk::Address::generate(&e);
        c.initialize(&soroban_sdk::vec![&e, (signer.clone(), 1u64)], &1, &admin);
        c.pause(&admin);
        let res = c.try_propose_settlement(&signer, &token, &100u64, &merchant);
        assert_eq!(res, Err(Ok(TreasuryError::ContractPaused)));
    }

    #[test]
    fn test_approve_when_paused_returns_contract_paused() {
        let (e, id) = setup();
        let c = client(&e, &id);
        let admin = soroban_sdk::Address::generate(&e);
        let signer = soroban_sdk::Address::generate(&e);
        let token = soroban_sdk::Address::generate(&e);
        let merchant = soroban_sdk::Address::generate(&e);
        c.initialize(&soroban_sdk::vec![&e, (signer.clone(), 1u64)], &1, &admin);
        let sid = c.propose_settlement(&signer, &token, &100u64, &merchant);
        c.pause(&admin);
        let res = c.try_approve_settlement(&signer, &sid);
        assert_eq!(res, Err(Ok(TreasuryError::ContractPaused)));
    }

    #[test]
    fn test_execute_when_paused_returns_contract_paused() {
        let (e, id) = setup();
        let c = client(&e, &id);
        let admin = soroban_sdk::Address::generate(&e);
        let signer = soroban_sdk::Address::generate(&e);
        let token = soroban_sdk::Address::generate(&e);
        let merchant = soroban_sdk::Address::generate(&e);
        c.initialize(&soroban_sdk::vec![&e, (signer.clone(), 1u64)], &1, &admin);
        let sid = c.propose_settlement(&signer, &token, &100u64, &merchant);
        c.approve_settlement(&signer, &sid);
        c.pause(&admin);
        let res = c.try_execute_settlement(&signer, &sid, &token);
        assert_eq!(res, Err(Ok(TreasuryError::ContractPaused)));
    }

    #[test]
    fn test_set_signer_when_paused_returns_contract_paused() {
        let (e, id) = setup();
        let c = client(&e, &id);
        let admin = soroban_sdk::Address::generate(&e);
        let signer = soroban_sdk::Address::generate(&e);
        let initial = soroban_sdk::Address::generate(&e);
        c.initialize(&soroban_sdk::vec![&e, (initial.clone(), 1u64)], &1, &admin);
        c.pause(&admin);
        let res = c.try_set_signer(&admin, &signer, &1u64);
        assert_eq!(res, Err(Ok(TreasuryError::ContractPaused)));
    }

    #[test]
    fn test_update_threshold_when_paused_returns_contract_paused() {
        let (e, id) = setup();
        let c = client(&e, &id);
        let admin = soroban_sdk::Address::generate(&e);
        let signer = soroban_sdk::Address::generate(&e);
        c.initialize(&soroban_sdk::vec![&e, (signer.clone(), 1u64)], &1, &admin);
        c.pause(&admin);
        let res = c.try_update_threshold(&admin, &2u32);
        assert_eq!(res, Err(Ok(TreasuryError::ContractPaused)));
    }

    // ── threshold and approval_weight tests ──────────────────────────────────

    #[test]
    fn test_partial_approval_below_threshold_does_not_execute() {
        let (e, id) = setup();
        let c = client(&e, &id);
        let admin = soroban_sdk::Address::generate(&e);
        let s1 = soroban_sdk::Address::generate(&e);
        let s2 = soroban_sdk::Address::generate(&e);
        let s3 = soroban_sdk::Address::generate(&e);
        let token = soroban_sdk::Address::generate(&e);
        let merchant = soroban_sdk::Address::generate(&e);
        // threshold=3, each signer weight=1 → total weight=3 >= 3 (valid init)
        // After s1 approves: approval_weight=1 < 3
        c.initialize(
            &soroban_sdk::vec![&e, (s1.clone(), 1u64), (s2.clone(), 1u64), (s3.clone(), 1u64)],
            &3,
            &admin,
        );
        let sid = c.propose_settlement(&s1, &token, &500u64, &merchant);
        c.approve_settlement(&s1, &sid);
        // execute should fail with InsufficientApprovals
        let res = c.try_execute_settlement(&s1, &sid, &token);
        assert_eq!(res, Err(Ok(TreasuryError::InsufficientApprovals)));
        // settlement must still be Pending
        let pending = c.get_pending_settlements(&None, &None);
        assert!(pending.contains(&sid));
    }

    #[test]
    fn test_exact_threshold_executes_settlement() {
        let (e, id) = setup();
        let c = client(&e, &id);
        let admin = soroban_sdk::Address::generate(&e);
        let signer = soroban_sdk::Address::generate(&e);
        let token = soroban_sdk::Address::generate(&e);
        let merchant = soroban_sdk::Address::generate(&e);
        // threshold=2, signer weight=2 → exact match
        c.initialize(&soroban_sdk::vec![&e, (signer.clone(), 2u64)], &2, &admin);
        let sid = c.propose_settlement(&signer, &token, &500u64, &merchant);
        c.approve_settlement(&signer, &sid);
        c.execute_settlement(&signer, &sid, &token);
        // settlement no longer pending
        let pending = c.get_pending_settlements(&None, &None);
        assert!(!pending.contains(&sid));
    }

    #[test]
    fn test_over_threshold_single_approval_executes() {
        let (e, id) = setup();
        let c = client(&e, &id);
        let admin = soroban_sdk::Address::generate(&e);
        let signer = soroban_sdk::Address::generate(&e);
        let token = soroban_sdk::Address::generate(&e);
        let merchant = soroban_sdk::Address::generate(&e);
        // threshold=1, signer weight=5 → weight > threshold
        c.initialize(&soroban_sdk::vec![&e, (signer.clone(), 5u64)], &1, &admin);
        let sid = c.propose_settlement(&signer, &token, &500u64, &merchant);
        c.approve_settlement(&signer, &sid);
        c.execute_settlement(&signer, &sid, &token);
        let pending = c.get_pending_settlements(&None, &None);
        assert!(!pending.contains(&sid));
    }

    #[test]
    fn test_zero_threshold_update_rejected() {
        let (e, id) = setup();
        let c = client(&e, &id);
        let admin = soroban_sdk::Address::generate(&e);
        let signer = soroban_sdk::Address::generate(&e);
        c.initialize(&soroban_sdk::vec![&e, (signer.clone(), 1u64)], &1, &admin);
        let res = c.try_update_threshold(&admin, &0u32);
        assert_eq!(res, Err(Ok(TreasuryError::InvalidThreshold)));
    }

    #[test]
    fn test_multi_signer_weight_accumulates_to_threshold() {
        let (e, id) = setup();
        let c = client(&e, &id);
        let admin = soroban_sdk::Address::generate(&e);
        let s1 = soroban_sdk::Address::generate(&e);
        let s2 = soroban_sdk::Address::generate(&e);
        let token = soroban_sdk::Address::generate(&e);
        let merchant = soroban_sdk::Address::generate(&e);
        // threshold=3, s1 weight=1, s2 weight=2
        c.initialize(
            &soroban_sdk::vec![&e, (s1.clone(), 1u64), (s2.clone(), 2u64)],
            &3,
            &admin,
        );
        let sid = c.propose_settlement(&s1, &token, &500u64, &merchant);
        // s1 approves: weight=1 < 3, can't execute yet
        c.approve_settlement(&s1, &sid);
        let res = c.try_execute_settlement(&s1, &sid, &token);
        assert_eq!(res, Err(Ok(TreasuryError::InsufficientApprovals)));
        // s2 approves: weight=3 == 3, can execute
        c.approve_settlement(&s2, &sid);
        c.execute_settlement(&s1, &sid, &token);
        let pending = c.get_pending_settlements(&None, &None);
        assert!(!pending.contains(&sid));
    }
}
