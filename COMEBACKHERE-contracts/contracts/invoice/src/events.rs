use soroban_sdk::{contracttype, Env, Symbol};

#[contracttype]
pub enum InvoiceEvent {
    InvoiceCreated,
    InvoicePaid,
    InvoiceExpired,
    InvoiceCancelled,
    InvoiceRefundReq,
    EscrowReleased,
    ContractPaused,
    ContractUnpaused,
}

pub fn invoice_created(e: &Env, invoice_id: u64, merchant: &soroban_sdk::Address) {
    e.events().publish((
        Symbol::new(e, "invoice_created"),
        invoice_id,
    ), merchant);
}

pub fn invoice_paid(e: &Env, invoice_id: u64, payer: &soroban_sdk::Address) {
    e.events().publish((
        Symbol::new(e, "invoice_paid"),
        invoice_id,
    ), payer);
}

pub fn invoice_expired(e: &Env, invoice_id: u64) {
    e.events().publish((
        Symbol::new(e, "invoice_expired"),
        invoice_id,
    ), ());
}

pub fn invoice_cancelled(e: &Env, invoice_id: u64) {
    e.events().publish((
        Symbol::new(e, "invoice_cancelled"),
        invoice_id,
    ), ());
}

pub fn invoice_refund_req(e: &Env, invoice_id: u64, payer: &soroban_sdk::Address) {
    e.events().publish((
        Symbol::new(e, "invoice_refund_req"),
        invoice_id,
    ), payer);
}

pub fn escrow_released(e: &Env, invoice_id: u64) {
    e.events().publish((
        Symbol::new(e, "escrow_released"),
        invoice_id,
    ), ());
}

pub fn contract_paused(e: &Env) {
    e.events().publish((
        Symbol::new(e, "contract_paused"),
        (),
    ), ());
}

pub fn contract_unpaused(e: &Env) {
    e.events().publish((
        Symbol::new(e, "contract_unpaused"),
        (),
    ), ());
}
