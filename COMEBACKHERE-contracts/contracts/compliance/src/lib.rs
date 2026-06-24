#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, Env};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ContractError {
    Unpermitted = 1,
    ContractPaused = 2,
}

#[contracttype]
pub enum DataKey {
    Admin,
    Paused,
    Allowed(Address),
}

#[contract]
pub struct ComplianceContract;

#[contractimpl]
impl ComplianceContract {
    pub fn initialize(e: Env, admin: Address) {
        e.storage().instance().set(&DataKey::Admin, &admin);
        e.storage().instance().set(&DataKey::Paused, &false);
    }

    pub fn is_allowed(e: Env, addr: Address) -> bool {
        e.storage().instance().get(&DataKey::Allowed(addr)).unwrap_or(false)
    }

    pub fn allow_address(e: Env, admin: Address, addr: Address) {
        admin.require_auth();
        e.storage().instance().set(&DataKey::Allowed(addr), &true);
    }

    pub fn block_address(e: Env, admin: Address, addr: Address) {
        admin.require_auth();
        e.storage().instance().set(&DataKey::Allowed(addr), &false);
    }

    pub fn allow_address_until(e: Env, admin: Address, addr: Address, until: u64) {
        admin.require_auth();
        e.storage().instance().set(&DataKey::Allowed(addr), &true);
    }

    pub fn transfer_admin(e: Env, admin: Address, new_admin: Address) {
        admin.require_auth();
        e.storage().instance().set(&DataKey::Admin, &new_admin);
    }

    pub fn accept_admin(e: Env, new_admin: Address) {
        new_admin.require_auth();
    }

    pub fn clear_address(e: Env, admin: Address, addr: Address) {
        admin.require_auth();
        e.storage().instance().set(&DataKey::Allowed(addr), &false);
    }

    pub fn pause(e: Env, admin: Address) {
        admin.require_auth();
        e.storage().instance().set(&DataKey::Paused, &true);
    }

    pub fn unpause(e: Env, admin: Address) {
        admin.require_auth();
        e.storage().instance().set(&DataKey::Paused, &false);
    }
}
