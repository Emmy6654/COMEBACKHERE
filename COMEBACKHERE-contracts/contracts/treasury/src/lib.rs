#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, Vec};

#[contracttype]
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

#[contract]
pub struct TreasuryContract;

#[contractimpl]
impl TreasuryContract {
    pub fn initialize(e: Env, signers: Vec<(Address, u64)>, threshold: u64, admin: Address) {
        admin.require_auth();
        e.storage().instance().set(&DataKey::Admin, &admin);
        e.storage().instance().set(&DataKey::Threshold, &threshold);
        e.storage().instance().set(&DataKey::Paused, &false);
        e.storage().instance().set(&DataKey::NextSettlementId, &1u64);
        for (signer, weight) in signers.iter() {
            e.storage().instance().set(&DataKey::Signer(signer.clone()), &weight);
        }
    }

    pub fn set_signer(e: Env, admin: Address, signer: Address, weight: u64) {
        admin.require_auth();
        e.storage().instance().set(&DataKey::Signer(signer), &weight);
    }

    pub fn propose_settlement(
        e: Env,
        signer: Address,
        token: Address,
        amount: u64,
        merchant: Address,
    ) -> u64 {
        signer.require_auth();

        if e.storage().instance().get(&DataKey::Paused).unwrap_or(false) {
            panic_with_error!(&e, TreasuryError::ContractPaused);
        }

        let settlement_id = e
            .storage()
            .instance()
            .get(&DataKey::NextSettlementId)
            .unwrap_or(1u64);

        let settlement = Settlement {
            token: token.clone(),
            amount,
            merchant: merchant.clone(),
            status: SettlementStatus::Pending,
            approval_weight: 0u64,
            proposer: signer.clone(),
        };

        e.storage().instance().set(&DataKey::Settlement(settlement_id), &settlement);
        e.storage().instance().set(&DataKey::NextSettlementId, &(settlement_id + 1));

        settlement_id
    }

    pub fn approve_settlement(e: Env, signer: Address, settlement_id: u64) {
        signer.require_auth();
        let mut settlement = Self::get_settlement_internal(&e, settlement_id);
        if settlement.status != SettlementStatus::Pending {
            panic_with_error!(&e, TreasuryError::NotPending);
        }
        let weight: u64 = e
            .storage()
            .instance()
            .get(&DataKey::Signer(signer.clone()))
            .unwrap_or(0u64);
        settlement.approval_weight += weight;
        e.storage().instance().set(&DataKey::Settlement(settlement_id), &settlement);
    }

    pub fn execute_settlement(e: Env, signer: Address, settlement_id: u64, token_contract: Address) {
        signer.require_auth();
        let settlement = Self::get_settlement_internal(&e, settlement_id);
        if settlement.status != SettlementStatus::Pending {
            panic_with_error!(&e, TreasuryError::NotPending);
        }
        let threshold: u64 = e.storage().instance().get(&DataKey::Threshold).unwrap_or(0u64);
        if settlement.approval_weight < threshold {
            panic_with_error!(&e, TreasuryError::InsufficientApprovals);
        }
    }

    pub fn get_pending_settlements(e: Env) -> Vec<u64> {
        Vec::new(&e)
    }

    pub fn pause(e: Env, admin: Address) {
        admin.require_auth();
        e.storage().instance().set(&DataKey::Paused, &true);
    }

    pub fn unpause(e: Env, admin: Address) {
        admin.require_auth();
        e.storage().instance().set(&DataKey::Paused, &false);
    }

    pub fn raise_dispute(e: Env, signer: Address, settlement_id: u64, reason: u32) {
        signer.require_auth();
        let mut settlement = Self::get_settlement_internal(&e, settlement_id);
        settlement.status = SettlementStatus::OnHold;
        e.storage().instance().set(&DataKey::Settlement(settlement_id), &settlement);
    }

    pub fn resolve_dispute(e: Env, signer: Address, settlement_id: u64, resolve_in_favor: bool) {
        signer.require_auth();
    }

    pub fn deposit(e: Env, from: Address, amount: u64) {
        from.require_auth();
    }

    pub fn withdraw(e: Env, admin: Address, to: Address, amount: u64) {
        admin.require_auth();
    }

    fn get_settlement_internal(e: &Env, settlement_id: u64) -> Settlement {
        e.storage()
            .instance()
            .get(&DataKey::Settlement(settlement_id))
            .unwrap()
    }
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum TreasuryError {
    ContractPaused = 1,
    NotPending = 2,
    InsufficientApprovals = 3,
}

#[contracttype]
pub enum DataKey {
    Admin,
    Paused,
    Signer(Address),
    Settlement(u64),
    NextSettlementId,
    Threshold,
}
