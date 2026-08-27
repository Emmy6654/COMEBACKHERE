import { MongoClient, type Db, type Collection, MongoServerSelectionError } from "mongodb"

export type InvoiceStatus = "Pending" | "Paid" | "Expired" | "Cancelled" | "RefundRequested" | "Released"

export interface LegacyInvoiceRecord {
  invoice_id: string
  merchant_address: string
  token: string
  amount: number
  due_date: number
  status: InvoiceStatus
  created_at: Date
  updated_at: Date
}

export interface InvoiceRecord {
  invoice_id: string
  merchant_address: string
  token: string
  amount: number
  due_date: number
  status: InvoiceStatus
  created_at: Date
  updated_at: Date
}

export interface SettlementRecord {
  id: number
  merchant_address: string
  amount: string
  token: string
  approvals: string[]
  approval_weight: number
  status: "Pending" | "Executed" | "PartiallyExecuted" | "OnHold" | "Cancelled"
  hold_reason: string | null
  updated_at: Date
  proposed_tx_hash?: string
  executed_tx_hash?: string
}

export type ComplianceAuditEventType = "address_allowed" | "address_allowed_until" | "address_blocked" | "address_cleared"

export interface ComplianceAuditRecord {
  event_id: string
  event_type: ComplianceAuditEventType
  address: string
  expires_at: number | null
  ledger: number
  ledger_closed_at: string | null
  transaction_hash: string
  contract_id: string
  paging_token: string | null
  created_at: Date
}

export interface IndexerCursor {
  _id: string
  paging_token: string | null
  last_ledger: number
  updated_at: Date
  /** Event IDs already applied — used for reorg / replay deduplication. */
  processed_event_ids?: string[]
}

export type InvoiceStatus =
  | "Pending"
  | "Paid"
  | "Expired"
  | "Cancelled"
  | "RefundRequested"
  | "Released"

export interface InvoiceRecord {
  invoice_id: string
  merchant_address: string
  payer_address: string | null
  token: string
  amount: string
  status: InvoiceStatus
  created_at: number | null   // Unix timestamp (seconds)
  expires_at: number | null   // Unix timestamp (seconds)
  paid_at: number | null      // Unix timestamp (seconds)
  tx_hash: string | null
  updated_at: Date
}

export interface InvoiceSearchFilter {
  status?: InvoiceStatus
  merchant_address?: string
}

export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100

let client: MongoClient | null = null
let db: Db | null = null

// ---------------------------------------------------------------------------
// #210 — Connection options: explicit pool size and timeouts so a slow or
// unreachable MongoDB fails fast instead of hanging indefinitely.
// ---------------------------------------------------------------------------

const MONGO_OPTIONS = {
  /** Maximum number of connections in the pool. */
  maxPoolSize: 10,
  /** Minimum number of idle connections to maintain. */
  minPoolSize: 2,
  /**
   * How long (ms) the driver will wait when selecting a server before
   * throwing a MongoServerSelectionError.  Default is 30 000; we tighten
   * it so startup failures are discovered quickly.
   */
  serverSelectionTimeoutMS: 5_000,
  /**
   * How long (ms) to wait for a new connection to be established.
   * Prevents requests from hanging when all pool slots are busy.
   */
  connectTimeoutMS: 10_000,
  /**
   * How long (ms) to wait for a socket operation to complete before
   * giving up and returning an error to the caller.
   */
  socketTimeoutMS: 45_000,
}

export async function connectMongo(): Promise<Db> {
  if (db) return db

  const uri = process.env.MONGODB_URI ?? "mongodb://localhost:27017"
  const dbName = process.env.MONGODB_DB ?? "comebackhere"

  client = new MongoClient(uri, MONGO_OPTIONS)

  try {
    await client.connect()
  } catch (err) {
    // Provide a clear, actionable error message rather than letting the raw
    // driver error bubble up silently.
    const message =
      err instanceof MongoServerSelectionError
        ? `MongoDB unreachable at ${uri} — check that the server is running and MONGODB_URI is correct. ` +
          `Original error: ${err.message}`
        : `Failed to connect to MongoDB: ${err instanceof Error ? err.message : String(err)}`

    console.error(`[mongo] ${message}`)
    // Re-throw so callers (routes, startup health-checks) can respond with 5xx.
    throw Object.assign(new Error(message), { status: 503 })
  }

  db = client.db(dbName)

  // Attach a top-level error handler so an unexpected mid-run topology
  // failure is logged clearly rather than crashing the process silently.
  client.on("error", (err: Error) => {
    console.error("[mongo] client error", err.message)
  })

  client.on("close", () => {
    console.warn("[mongo] connection closed — subsequent requests will reconnect")
    // Reset cached references so the next call to connectMongo() re-establishes
    // the connection instead of returning a stale db handle.
    db = null
    client = null
  })

  const settlements = db.collection<SettlementRecord>("settlements")
  await settlements.createIndex({ id: 1 }, { unique: true })
  await settlements.createIndex({ status: 1 })

  const invoices = db.collection<InvoiceRecord>("invoices")
  await invoices.createIndex({ invoice_id: 1 }, { unique: true })
  await invoices.createIndex({ status: 1 })
  await invoices.createIndex({ merchant_address: 1 })
  await invoices.createIndex({ status: 1, merchant_address: 1 })

  const cursors = db.collection<IndexerCursor>("indexer_cursors")
  await cursors.createIndex({ _id: 1 }, { unique: true })

  const complianceAudit = db.collection<ComplianceAuditRecord>("compliance_audit")
  await complianceAudit.createIndex({ event_id: 1 }, { unique: true })
  await complianceAudit.createIndex({ address: 1, ledger: -1 })
  await complianceAudit.createIndex({ event_type: 1, ledger: -1 })
  await complianceAudit.createIndex({ ledger: -1 })

  const invoices = db.collection<InvoiceRecord>("invoices")
  await invoices.createIndex({ invoice_id: 1 }, { unique: true })
  await invoices.createIndex({ status: 1 })
  await invoices.createIndex({ merchant_address: 1 })
  await invoices.createIndex({ created_at: -1 })

  return db
}

export function getInvoicesCollection(database: Db): Collection<InvoiceRecord> {
  return database.collection<InvoiceRecord>("invoices")
}

export function getSettlementsCollection(database: Db): Collection<SettlementRecord> {
  return database.collection<SettlementRecord>("settlements")
}

export function getCursorsCollection(database: Db): Collection<IndexerCursor> {
  return database.collection<IndexerCursor>("indexer_cursors")
}

export function getComplianceAuditCollection(database: Db): Collection<ComplianceAuditRecord> {
  return database.collection<ComplianceAuditRecord>("compliance_audit")
}

export async function closeMongo(): Promise<void> {
  if (client) {
    await client.close()
    client = null
    db = null
  }
}

/** Exported for tests — resets the cached singleton so each test gets a fresh connection. */
export function _resetMongoSingleton(): void {
  client = null
  db = null
}
