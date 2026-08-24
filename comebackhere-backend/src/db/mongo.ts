import { MongoClient, type Db, type Collection, MongoServerSelectionError } from "mongodb"

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

export interface IndexerCursor {
  _id: string
  paging_token: string | null
  last_ledger: number
  updated_at: Date
  /** Event IDs already applied — used for reorg / replay deduplication. */
  processed_event_ids?: string[]
}

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

  const cursors = db.collection<IndexerCursor>("indexer_cursors")
  await cursors.createIndex({ _id: 1 }, { unique: true })

  return db
}

export function getSettlementsCollection(database: Db): Collection<SettlementRecord> {
  return database.collection<SettlementRecord>("settlements")
}

export function getCursorsCollection(database: Db): Collection<IndexerCursor> {
  return database.collection<IndexerCursor>("indexer_cursors")
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
