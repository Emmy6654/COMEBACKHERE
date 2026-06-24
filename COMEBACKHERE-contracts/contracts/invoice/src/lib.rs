#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, BytesN, Env, Vec};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
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
pub enum DataKey {
    Admin,
    Paused,
    Invoice(u64),
    NextInvoiceId,
    GraceWindow,
}

#[contracttype]
pub enum InvoiceStatus {
    Pending,
    Paid,
    Expired,
    Cancelled,
    RefundRequested,
    Released,
}

#[contracttype]
pub struct Invoice {
    pub merchant: Address,
    pub amount_usdc: u64,
    pub gross_usdc: u64,
    pub expires_at: u64,
    pub status: InvoiceStatus,
    pub payer: Option<Address>,
    pub paid_at: Option<u64>,
    pub metadata_hash: Option<BytesN<32>>,
    pub payment_link_hash: Option<BytesN<32>>,
    pub nonce: u64,
}

#[contract]
pub struct InvoiceContract;

#[contractimpl]
impl InvoiceContract {
    pub fn initialize(e: Env, admin: Address) {
        if e.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&e, InvoiceError::AlreadyInitialized);
        }
        admin.require_auth();
        e.storage().instance().set(&DataKey::Admin, &admin);
        e.storage().instance().set(&DataKey::NextInvoiceId, &1u64);
        e.storage().instance().set(&DataKey::Paused, &false);
    }

    pub fn create_invoice(
        e: Env,
        merchant: Address,
        amount_usdc: u64,
        gross_usdc: u64,
        expires_in_seconds: u64,
        metadata_hash: Option<BytesN<32>>,
        payment_link_hash: Option<BytesN<32>>,
        nonce: u64,
    ) -> u64 {
        merchant.require_auth();

        if e.storage().instance().get(&DataKey::Paused).unwrap_or(false) {
            panic_with_error!(&e, InvoiceError::ContractPaused);
        }

        if amount_usdc == 0 || gross_usdc < amount_usdc {
            panic_with_error!(&e, InvoiceError::InvalidAmount);
        }

        if amount_usdc < 10_000_000u64 {
            panic_with_error!(&e, InvoiceError::AmountPrecision);
        }

        if expires_in_seconds == 0 {
            panic_with_error!(&e, InvoiceError::ZeroDuration);
        }

        let ledger_timestamp = e.ledger().timestamp();
        let expires_at = ledger_timestamp
            .checked_add(expires_in_seconds)
            .ok_or(InvoiceError::ExpiryOverflow)?;

        let invoice_id = e
            .storage()
            .instance()
            .get(&DataKey::NextInvoiceId)
            .unwrap_or(1u64);

        let invoice = Invoice {
            merchant: merchant.clone(),
            amount_usdc,
            gross_usdc,
            expires_at,
            status: InvoiceStatus::Pending,
            payer: None,
            paid_at: None,
            metadata_hash,
            payment_link_hash,
            nonce,
        };

        e.storage().instance().set(&DataKey::Invoice(invoice_id), &invoice);
        e.storage().instance().set(&DataKey::NextInvoiceId, &(invoice_id + 1));

        crate::events::invoice_created(&e, invoice_id, &merchant);

        invoice_id
    }

    pub fn mark_paids(
        e: Env,
        admin: Address,
        invoice_ids: Vec<u64>,
        payer: Address,
    ) {
        admin.require_auth();

        if e.storage().instance().get(&DataKey::Paused).unwrap_or(false) {
            panic_with_error!(&e, InvoiceError::ContractPaused);
        }

        let now = e.ledger().timestamp();

        for id in invoice_ids.iter() {
            let mut invoice = Self::get_invoice_internal(&e, id);
            if invoice.status != InvoiceStatus::Pending {
                panic_with_error!(&e, InvoiceError::NotPending);
            }
            if now >= invoice.expires_at {
                panic_with_error!(&e, InvoiceError::Expired);
            }
            invoice.status = InvoiceStatus::Paid;
            invoice.payer = Some(payer.clone());
            invoice.paid_at = Some(now);
            e.storage().instance().set(&DataKey::Invoice(id), &invoice);
            crate::events::invoice_paid(&e, id, &payer);
        }
    }

    pub fn get_invoice(e: Env, invoice_id: u64) -> Invoice {
        Self::get_invoice_internal(&e, invoice_id)
    }

    fn get_invoice_internal(e: &Env, invoice_id: u64) -> Invoice {
        e.storage()
            .instance()
            .get(&DataKey::Invoice(invoice_id))
            .unwrap_or_else(|| panic_with_error!(e, InvoiceError::NotFound))
    }

    pub fn get_invoice_status(e: Env, invoice_id: u64) -> InvoiceStatus {
        Self::get_invoice_internal(&e, invoice_id).status
    }

    pub fn cancel_invoiced(e: Env, merchant: Address, invoice_id: u64) {
        merchant.require_auth();

        if e.storage().instance().get(&DataKey::Paused).unwrap_or(false) {
            panic_with_error!(&e, InvoiceError::ContractPaused);
        }

        let mut invoice = Self::get_invoice_internal(&e, invoice_id);
        if invoice.merchant != merchant {
            panic_with_error!(&e, InvoiceError::Unauthorized);
        }
        if invoice.status != InvoiceStatus::Pending {
            panic_with_error!(&e, InvoiceError::NotPending);
        }
        invoice.status = InvoiceStatus::Cancelled;
        e.storage().instance().set(&DataKey::Invoice(invoice_id), &invoice);
        crate::events::invoice_cancelled(&e, invoice_id);
    }

    pub fn request_refund(e: Env, payer: Address, invoice_id: u64) {
        payer.require_auth();
        let mut invoice = Self::get_invoice_internal(&e, invoice_id);
        if Some(payer.clone()) != invoice.payer {
            panic_with_error!(&e, InvoiceError::Unauthorized);
        }
        if invoice.status != InvoiceStatus::Paid {
            panic_with_error!(&e, InvoiceError::NotPaid);
        }
        invoice.status = InvoiceStatus::RefundRequested;
        e.storage().instance().set(&DataKey::Invoice(invoice_id), &invoice);
        crate::events::invoice_refund_req(&e, invoice_id, &payer);
    }

    pub fn batch_expire(e: Env, admin: Address, invoice_ids: Vec<u64>) {
        admin.require_auth();
        let now = e.ledger().timestamp();
        for id in invoice_ids.iter() {
            let mut invoice = Self::get_invoice_internal(&e, id);
            if invoice.status == InvoiceStatus::Pending && now >= invoice.expires_at {
                invoice.status = InvoiceStatus::Expired;
                e.storage().instance().set(&DataKey::Invoice(id), &invoice);
                crate::events::invoice_expired(&e, id);
            }
        }
    }

    pub fn pause(e: Env, admin: Address) {
        admin.require_auth();
        e.storage().instance().set(&DataKey::Paused, &true);
        crate::events::contract_paused(&e);
    }

    pub fn unpause(e: Env, admin: Address) {
        admin.require_auth();
        e.storage().instance().set(&DataKey::Paused, &false);
        crate::events::contract_unpaused(&e);
    }

    pub fn set_grace_window(e: Env, admin: Address, grace_window: u64) {
        admin.require_auth();
        e.storage().instance().set(&DataKey::GraceWindow, &grace_window);
    }

    pub fn get_grace_window(e: Env) -> u64 {
        e.storage().instance().get(&DataKey::GraceWindow).unwrap_or(0u64)
    }

    pub fn release_escrow(e: Env, admin: Address, invoice_id: u64) {
        admin.require_auth();
        let mut invoice = Self::get_invoice_internal(&e, invoice_id);
        if invoice.status != InvoiceStatus::Paid {
            panic_with_error!(&e, InvoiceError::NotPaid);
        }
        invoice.status = InvoiceStatus::Released;
        e.storage().instance().set(&DataKey::Invoice(invoice_id), &invoice);
        crate::events::escrow_released(&e, invoice_id);
    }
}

#[cfg(test)]
mod tests;
