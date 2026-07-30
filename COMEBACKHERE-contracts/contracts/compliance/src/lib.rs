#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, Env, Symbol, Vec};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ContractError {
    Unauthorized = 1,
    ContractPaused = 2,
    AlreadyInitialized = 3,
    AddressNotFound = 4,
}

#[contracttype]
pub enum AddressStatus {
    Allowed,
    AllowedUntil(u64),
    Blocked,
    Cleared,
}

#[contracttype]
pub enum DataKey {
    Admin,
    Paused,
    Status(Address),
    PendingAdmin,
}

#[contract]
pub struct ComplianceContract;

fn is_paused(e: &Env) -> bool {
    e.storage().instance().get(&DataKey::Paused).unwrap_or(false)
}

fn check_not_paused(e: &Env) -> Result<(), ContractError> {
    if is_paused(e) {
        Err(ContractError::ContractPaused)
    } else {
        Ok(())
    }
}

#[contractimpl]
impl ComplianceContract {
    pub fn initialize(e: Env, admin: Address) {
        e.storage().instance().set(&DataKey::Admin, &admin);
        e.storage().instance().set(&DataKey::Paused, &false);
    }

    pub fn is_allowed(e: Env, addr: Address) -> bool {
        match e
            .storage()
            .instance()
            .get(&DataKey::Status(addr))
            .unwrap_or(AddressStatus::Cleared)
        {
            AddressStatus::Allowed => true,
            AddressStatus::AllowedUntil(until) => e.ledger().timestamp() < until,
            AddressStatus::Blocked | AddressStatus::Cleared => false,
        }
    }

    pub fn get_address_status(e: Env, addr: Address) -> AddressStatus {
        e.storage()
            .instance()
            .get(&DataKey::Status(addr))
            .unwrap_or(AddressStatus::Cleared)
    }

    pub fn allow_address(e: Env, admin: Address, addr: Address) -> Result<(), ContractError> {
        check_not_paused(&e)?;
        admin.require_auth();
        e.storage()
            .instance()
            .set(&DataKey::Status(addr.clone()), &AddressStatus::Allowed);
        e.events()
            .publish((Symbol::new(&e, "address_allowed"),), addr);
        Ok(())
    }

    pub fn block_address(e: Env, admin: Address, addr: Address) -> Result<(), ContractError> {
        check_not_paused(&e)?;
        admin.require_auth();
        e.storage()
            .instance()
            .set(&DataKey::Status(addr.clone()), &AddressStatus::Blocked);
        e.events()
            .publish((Symbol::new(&e, "address_blocked"),), addr);
        Ok(())
    }

    pub fn allow_address_until(
        e: Env,
        admin: Address,
        addr: Address,
        until: u64,
    ) -> Result<(), ContractError> {
        check_not_paused(&e)?;
        admin.require_auth();
        e.storage()
            .instance()
            .set(&DataKey::Status(addr.clone()), &AddressStatus::AllowedUntil(until));
        e.events().publish(
            (Symbol::new(&e, "address_allowed_until"),),
            (addr, until),
        );
        Ok(())
    }

    pub fn transfer_admin(
        e: Env,
        admin: Address,
        new_admin: Address,
    ) -> Result<(), ContractError> {
        check_not_paused(&e)?;
        admin.require_auth();
        e.storage().instance().set(&DataKey::Admin, &new_admin);
        Ok(())
    }

    pub fn accept_admin(e: Env, new_admin: Address) -> Result<(), ContractError> {
        new_admin.require_auth();
        let pending: Address = e
            .storage()
            .instance()
            .get(&DataKey::PendingAdmin)
            .ok_or(ContractError::Unauthorized)?;
        if new_admin != pending {
            return Err(ContractError::Unauthorized);
        }
        e.storage().instance().set(&DataKey::Admin, &new_admin);
        e.storage()
            .instance()
            .remove(&DataKey::PendingAdmin);
        e.events().publish(
            (Symbol::new(&e, "accept_admin"),),
            &new_admin,
        );
        Ok(())
    }

    /// Removes the storage entry for `addr` from the specified list.
    /// Returns `AddressNotFound` if the address has no active status (already cleared or never set).
    pub fn clear_address(e: Env, admin: Address, addr: Address) -> Result<(), ContractError> {
        check_not_paused(&e)?;
        admin.require_auth();
        let status: AddressStatus = e
            .storage()
            .instance()
            .get(&DataKey::Status(addr.clone()))
            .unwrap_or(AddressStatus::Cleared);
        if matches!(status, AddressStatus::Cleared) {
            return Err(ContractError::AddressNotFound);
        }
        e.storage()
            .instance()
            .remove(&DataKey::Status(addr.clone()));
        e.events()
            .publish((Symbol::new(&e, "address_cleared"),), addr);
        Ok(())
    }

    /// Sweep a batch of addresses: removes storage entries for any `AllowedUntil`
    /// entries whose expiry timestamp has already passed. Non-expired, permanently
    /// allowed, blocked, or already-cleared addresses are silently skipped.
    /// Returns the number of entries that were actually removed.
    pub fn sweep_expired(e: Env, admin: Address, addresses: Vec<Address>) -> u32 {
        admin.require_auth();
        let now = e.ledger().timestamp();
        let mut swept: u32 = 0;
        for addr in addresses.iter() {
            let status: AddressStatus = e
                .storage()
                .instance()
                .get(&DataKey::Status(addr.clone()))
                .unwrap_or(AddressStatus::Cleared);
            if let AddressStatus::AllowedUntil(until) = status {
                if now >= until {
                    e.storage()
                        .instance()
                        .remove(&DataKey::Status(addr.clone()));
                    e.events()
                        .publish((Symbol::new(&e, "address_swept"),), addr);
                    swept += 1;
                }
            }
        }
        swept
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

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger};
    use soroban_sdk::Env;

    fn setup(ts: u64) -> (Env, Address, Address, Address) {
        let e = Env::default();
        e.mock_all_auths();
        let contract_id = e.register(ComplianceContract, ());
        let admin = Address::generate(&e);
        let addr = Address::generate(&e);
        ComplianceContractClient::new(&e, &contract_id).initialize(&admin);
        e.ledger().with_mut(|li| li.timestamp = ts);
        (e, contract_id, admin, addr)
    }

    // ── existing expiry tests ────────────────────────────────────────────────

    #[test]
    fn test_is_allowed_not_expired() {
        let (e, cid, admin, addr) = setup(1000);
        let c = ComplianceContractClient::new(&e, &cid);
        c.allow_address_until(&admin, &addr, &2000u64);
        assert!(c.is_allowed(&addr));
    }

    #[test]
    fn test_is_allowed_exactly_at_expiry_returns_false() {
        let (e, cid, admin, addr) = setup(1000);
        let c = ComplianceContractClient::new(&e, &cid);
        c.allow_address_until(&admin, &addr, &1000u64);
        assert!(!c.is_allowed(&addr));
    }

    #[test]
    fn test_is_allowed_past_expiry_returns_false() {
        let (e, cid, admin, addr) = setup(1001);
        let c = ComplianceContractClient::new(&e, &cid);
        c.allow_address_until(&admin, &addr, &1000u64);
        assert!(!c.is_allowed(&addr));
    }

    #[test]
    fn test_permanent_allow_unaffected_by_time() {
        let (_e, c, admin, addr) = setup(9999);
        c.allow_address(&admin, &addr);
        assert!(c.is_allowed(&addr));
    }

    // ── sweep_expired tests ──────────────────────────────────────────────────

    #[test]
    fn test_sweep_expired_removes_expired_entry_and_returns_count() {
        let (e, cid, admin, addr) = setup(1001);
        let c = ComplianceContractClient::new(&e, &cid);
        // Grant a time-boxed allowance that has already expired (until=1000, now=1001)
        c.allow_address_until(&admin, &addr, &1000u64);
        assert!(!c.is_allowed(&addr)); // already expired

        let swept = c.sweep_expired(&admin, &soroban_sdk::vec![&e, addr.clone()]);
        assert_eq!(swept, 1);

        // After sweep the entry should be cleared
        assert!(matches!(
            c.get_address_status(&addr),
            AddressStatus::Cleared
        ));
    }

    #[test]
    fn test_sweep_expired_skips_non_expired_entry() {
        let (e, cid, admin, addr) = setup(500);
        let c = ComplianceContractClient::new(&e, &cid);
        // Allowance expires at 2000, now=500 → not yet expired
        c.allow_address_until(&admin, &addr, &2000u64);
        assert!(c.is_allowed(&addr));

        let swept = c.sweep_expired(&admin, &soroban_sdk::vec![&e, addr.clone()]);
        assert_eq!(swept, 0);

        // Entry still present and still allowed
        assert!(c.is_allowed(&addr));
    }

    #[test]
    fn test_sweep_expired_at_exact_boundary_removes_entry() {
        let (e, cid, admin, addr) = setup(1000);
        let c = ComplianceContractClient::new(&e, &cid);
        // now == until → is_allowed is already false at the boundary
        c.allow_address_until(&admin, &addr, &1000u64);
        assert!(!c.is_allowed(&addr));

        let swept = c.sweep_expired(&admin, &soroban_sdk::vec![&e, addr.clone()]);
        assert_eq!(swept, 1);
        assert!(matches!(
            c.get_address_status(&addr),
            AddressStatus::Cleared
        ));
    }

    #[test]
    fn test_sweep_expired_skips_permanently_allowed_address() {
        let (e, cid, admin, addr) = setup(9999);
        let c = ComplianceContractClient::new(&e, &cid);
        c.allow_address(&admin, &addr);

        let swept = c.sweep_expired(&admin, &soroban_sdk::vec![&e, addr.clone()]);
        assert_eq!(swept, 0);
        assert!(c.is_allowed(&addr));
    }

    #[test]
    fn test_sweep_expired_skips_blocked_address() {
        let (e, cid, admin, addr) = setup(9999);
        let c = ComplianceContractClient::new(&e, &cid);
        c.block_address(&admin, &addr);

        let swept = c.sweep_expired(&admin, &soroban_sdk::vec![&e, addr.clone()]);
        assert_eq!(swept, 0);
        assert!(matches!(
            c.get_address_status(&addr),
            AddressStatus::Blocked
        ));
    }

    #[test]
    fn test_sweep_expired_skips_cleared_address() {
        let (e, cid, admin, addr) = setup(9999);
        let c = ComplianceContractClient::new(&e, &cid);
        // addr has no status (Cleared by default)

        let swept = c.sweep_expired(&admin, &soroban_sdk::vec![&e, addr.clone()]);
        assert_eq!(swept, 0);
    }

    #[test]
    fn test_sweep_expired_batch_mixed_addresses() {
        let (e, cid, admin, _) = setup(1500);
        let c = ComplianceContractClient::new(&e, &cid);

        let expired1 = Address::generate(&e);
        let expired2 = Address::generate(&e);
        let live = Address::generate(&e);
        let permanent = Address::generate(&e);

        // expired: until=1000 < now=1500
        c.allow_address_until(&admin, &expired1, &1000u64);
        c.allow_address_until(&admin, &expired2, &500u64);
        // live: until=9000 > now=1500
        c.allow_address_until(&admin, &live, &9000u64);
        // permanent allow
        c.allow_address(&admin, &permanent);

        let batch = soroban_sdk::vec![&e, expired1.clone(), expired2.clone(), live.clone(), permanent.clone()];
        let swept = c.sweep_expired(&admin, &batch);
        assert_eq!(swept, 2);

        assert!(matches!(c.get_address_status(&expired1), AddressStatus::Cleared));
        assert!(matches!(c.get_address_status(&expired2), AddressStatus::Cleared));
        assert!(c.is_allowed(&live));
        assert!(c.is_allowed(&permanent));
    }

    #[test]
    fn test_sweep_expired_empty_batch_returns_zero() {
        let (e, cid, admin, _) = setup(1000);
        let c = ComplianceContractClient::new(&e, &cid);
        let swept = c.sweep_expired(&admin, &soroban_sdk::vec![&e]);
        assert_eq!(swept, 0);
    }
}
