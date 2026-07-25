use soroban_sdk::{Address, Env, Symbol};

pub fn invoice_created(env: &Env, merchant: &Address, invoice_id: &u64) {
    env.events().publish(
        (Symbol::new(env, "invoice_created"),),
        (merchant, *invoice_id),
    );
}

pub fn invoice_paid(env: &Env, invoice_id: &u64) {
    env.events()
        .publish((Symbol::new(env, "invoice_paid"),), *invoice_id);
}

pub fn invoice_expired(env: &Env, invoice_id: &u64) {
    env.events()
        .publish((Symbol::new(env, "invoice_expired"),), *invoice_id);
}

pub fn invoice_cancelled(env: &Env, invoice_id: &u64) {
    env.events()
        .publish((Symbol::new(env, "invoice_cancelled"),), *invoice_id);
}

pub fn invoice_refund_req(env: &Env, invoice_id: &u64) {
    env.events()
        .publish((Symbol::new(env, "invoice_refund_req"),), *invoice_id);
}

pub fn escrow_released(env: &Env, invoice_id: &u64) {
    env.events()
        .publish((Symbol::new(env, "escrow_released"),), *invoice_id);
}

pub fn contract_paused(env: &Env) {
    env.events()
        .publish((Symbol::new(env, "contract_paused"),), ());
}

pub fn contract_unpaused(env: &Env) {
    env.events()
        .publish((Symbol::new(env, "contract_unpaused"),), ());
}

pub fn dispute_raised(env: &Env, invoice_id: &u64, settlement_id: &u64, claimant: &Address) {
    env.events().publish(
        (Symbol::new(env, "dispute_raised"),),
        (*invoice_id, *settlement_id, claimant),
    );
}
