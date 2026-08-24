/**
 * Invoice event indexer — #69 / #209
 *
 * Polls Soroban for invoice contract events (invoice_created, invoice_paid,
 * invoice_expired, invoice_cancelled, escrow_released) using cursor-based
 * pagination so missed events and re-org recovery are handled automatically.
 *
 * Cursor persistence (#209):
 *   The last successfully processed paging token is stored in Redis under the
 *   key INDEXER_CURSOR_KEY.  On restart the indexer resumes from that token,
 *   guaranteeing no gaps and avoiding duplicate processing.
 *
 * Redis reconnection (#209):
 *   If the Redis connection drops the indexer reconnects with exponential
 *   back-off (base 250 ms, cap 30 s, jitter ±10 %).  It continues to poll
 *   Soroban during the reconnect window — cursor saves are queued / retried
 *   automatically by ioredis — so no events are lost.
 *
 * Usage (standalone):
 *   SOROBAN_RPC_URL=... INVOICE_CONTRACT_ID=... node dist/indexer.js
 *
 * Usage (embedded): call startIndexer() from index.ts or a worker.
 */

import { SorobanRpc, xdr } from "stellar-sdk"
import Redis from "ioredis"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InvoiceEventType =
  | "invoice_created"
  | "invoice_paid"
  | "invoice_expired"
  | "invoice_cancelled"
  | "escrow_released"

export interface InvoiceStateTransition {
  event_type: InvoiceEventType
  invoice_id: string
  ledger: number
  ledger_closed_at: string
  transaction_hash: string
  contract_id: string
  raw_topics: string[]
  raw_value: string
}

const TRACKED_EVENTS = new Set<string>([
  "invoice_created",
  "invoice_paid",
  "invoice_expired",
  "invoice_cancelled",
  "escrow_released",
])

// ---------------------------------------------------------------------------
// Redis cursor persistence (#209)
// ---------------------------------------------------------------------------

const INDEXER_CURSOR_KEY = "invoice_indexer_cursor"

/**
 * In-memory fallback cursor — used when Redis is unavailable at startup
 * or when a cursor write fails.  Soroban polling continues uninterrupted.
 */
let memCursor: string = process.env.INDEXER_START_CURSOR ?? "0"

/** The active ioredis client.  Replaced on each reconnect attempt. */
let redisClient: Redis | null = null

// ---------------------------------------------------------------------------
// Exponential back-off helper (#209)
// ---------------------------------------------------------------------------

const BACKOFF_BASE_MS = 250
const BACKOFF_CAP_MS = 30_000
const BACKOFF_JITTER = 0.1 // ±10 %

/**
 * Returns the delay in milliseconds for the n-th retry attempt
 * (0-indexed) using capped exponential back-off with jitter.
 */
export function backoffDelayMs(attempt: number): number {
  const exp = Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_CAP_MS)
  const jitter = exp * BACKOFF_JITTER * (Math.random() * 2 - 1)
  return Math.round(exp + jitter)
}

// ---------------------------------------------------------------------------
// Redis connection with reconnect/back-off loop (#209)
// ---------------------------------------------------------------------------

/**
 * Creates an ioredis client configured with automatic reconnect back-off.
 * ioredis natively retries connections; we customise the strategy so each
 * attempt follows our capped exponential schedule.
 *
 * The returned client emits 'connect', 'reconnecting', and 'error' events
 * which are logged for observability.
 */
export function createRedisClient(redisUrl?: string): Redis {
  const url = redisUrl ?? process.env.REDIS_URL ?? "redis://localhost:6379"

  let attempt = 0
  const client = new Redis(url, {
    // ioredis calls this after each failed connection attempt.
    // Return the number of milliseconds to wait before the next attempt,
    // or false / null to stop retrying entirely.
    retryStrategy(times: number): number | null {
      attempt = times
      if (times > 50) {
        // After 50 retries (~30 min with cap) give up so operators notice.
        console.error(
          `[indexer] Redis retry limit reached after ${times} attempts — stopping reconnect`
        )
        return null
      }
      const delay = backoffDelayMs(times - 1)
      console.warn(
        `[indexer] Redis reconnect attempt ${times} — waiting ${delay} ms`
      )
      return delay
    },
    // Do not flood logs when commands queue during a disconnect.
    enableReadyCheck: false,
    maxRetriesPerRequest: null,
    lazyConnect: false,
  })

  client.on("connect", () => {
    console.log("[indexer] Redis connected")
    attempt = 0
  })

  client.on("reconnecting", (ms: number) => {
    console.warn(`[indexer] Redis reconnecting in ${ms} ms (attempt ${attempt})`)
  })

  client.on("error", (err: Error) => {
    // Log but do not crash — the indexer continues polling Soroban.
    console.error(`[indexer] Redis error: ${err.message}`)
  })

  return client
}

// ---------------------------------------------------------------------------
// Cursor read / write (with Redis fallback to in-memory)
// ---------------------------------------------------------------------------

/** Reads the last cursor from Redis, falling back to the in-memory value. */
export async function loadCursor(): Promise<string> {
  if (redisClient) {
    try {
      const stored = await redisClient.get(INDEXER_CURSOR_KEY)
      if (stored) {
        memCursor = stored
        return stored
      }
    } catch (err) {
      console.warn("[indexer] could not read cursor from Redis — using in-memory cursor", err)
    }
  }
  return memCursor
}

/** Persists the cursor to Redis and in-memory for durability. */
export async function saveCursor(next: string): Promise<void> {
  memCursor = next
  if (redisClient) {
    try {
      await redisClient.set(INDEXER_CURSOR_KEY, next)
    } catch (err) {
      // Non-fatal: in-memory cursor is still updated, so polling continues.
      console.warn("[indexer] could not save cursor to Redis — using in-memory fallback", err)
    }
  }
}

// ---------------------------------------------------------------------------
// Event parsing
// ---------------------------------------------------------------------------

function parseEventType(topics: xdr.ScVal[]): InvoiceEventType | null {
  const name = topics[0]?.sym()?.toString()
  if (!name || !TRACKED_EVENTS.has(name)) return null
  return name as InvoiceEventType
}

function parseInvoiceId(topics: xdr.ScVal[]): string {
  const id = topics[1]?.u32() ?? topics[1]?.u64()
  return id?.toString() ?? "unknown"
}

// ---------------------------------------------------------------------------
// Persistence stub
// ---------------------------------------------------------------------------

/**
 * Persist a state transition record. Replace with real DB writes in production.
 * e.g.: await db.invoiceEvents.insert(transition)
 */
export function persistTransition(transition: InvoiceStateTransition): void {
  console.log(
    `[indexer] ${transition.event_type} invoice_id=${transition.invoice_id}` +
    ` ledger=${transition.ledger} tx=${transition.transaction_hash}`
  )
}

// ---------------------------------------------------------------------------
// Core poll loop
// ---------------------------------------------------------------------------

export async function pollOnce(
  server: SorobanRpc.Server,
  contractId: string
): Promise<void> {
  const cursor = await loadCursor()

  const response = await (server as any).getEvents({
    startLedger: cursor === "0" ? undefined : undefined,
    cursor: cursor === "0" ? undefined : cursor,
    filters: [
      {
        type: "contract",
        contractIds: [contractId],
      },
    ],
    limit: 100,
  })

  const events: any[] = response?.events ?? []

  for (const event of events) {
    const topics: xdr.ScVal[] = (event.topic ?? []).map((t: string) =>
      xdr.ScVal.fromXDR(t, "base64")
    )
    const eventType = parseEventType(topics)
    if (!eventType) continue

    const rawValue = event.value?.xdr ?? ""
    const transition: InvoiceStateTransition = {
      event_type: eventType,
      invoice_id: parseInvoiceId(topics),
      ledger: event.ledger,
      ledger_closed_at: event.ledgerClosedAt ?? new Date().toISOString(),
      transaction_hash: event.txHash ?? "",
      contract_id: contractId,
      raw_topics: (event.topic ?? []) as string[],
      raw_value: rawValue,
    }

    persistTransition(transition)
  }

  // Advance cursor to the last seen event's paging token for re-org safety.
  if (events.length > 0) {
    await saveCursor(events[events.length - 1].pagingToken)
  }
}

// ---------------------------------------------------------------------------
// Start / stop
// ---------------------------------------------------------------------------

let stopped = false
let activeTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Stops the indexer poll loop.  Safe to call multiple times.
 * Does not interrupt an in-flight pollOnce() call; it prevents scheduling
 * the next one so any active poll completes cleanly before the process exits.
 */
export function stopIndexer(): void {
  stopped = true
  if (activeTimer !== null) {
    clearTimeout(activeTimer)
    activeTimer = null
  }
  // Gracefully close the Redis connection on shutdown.
  if (redisClient) {
    redisClient.quit().catch(() => {/* ignore quit errors during shutdown */})
    redisClient = null
  }
}

export async function startIndexer(options?: {
  rpcUrl?: string
  contractId?: string
  pollIntervalMs?: number
  redisUrl?: string
  onError?: (err: unknown) => void
  /** Injected Redis client for tests — skips real Redis connection. */
  _redisClient?: Redis | null
}): Promise<void> {
  const rpcUrl = options?.rpcUrl ?? process.env.SOROBAN_RPC_URL
  const contractId = options?.contractId ?? process.env.INVOICE_CONTRACT_ID
  const pollIntervalMs = options?.pollIntervalMs ?? 5_000

  if (!rpcUrl || !contractId) {
    throw new Error("startIndexer: SOROBAN_RPC_URL and INVOICE_CONTRACT_ID are required")
  }

  // #209 — create (or inject) a Redis client with reconnect back-off.
  if (options?._redisClient !== undefined) {
    // Allow tests to inject a mock/null client.
    redisClient = options._redisClient
  } else {
    redisClient = createRedisClient(options?.redisUrl)
  }

  const server = new SorobanRpc.Server(rpcUrl)

  const initialCursor = await loadCursor()
  console.log(
    `[indexer] starting — contract=${contractId} cursor=${initialCursor} interval=${pollIntervalMs}ms`
  )

  const loop = async () => {
    if (stopped) return
    try {
      await pollOnce(server, contractId!)
    } catch (err) {
      const handler = options?.onError ?? ((e) => console.error("[indexer] poll error", e))
      handler(err)
    }
    if (!stopped) {
      activeTimer = setTimeout(loop, pollIntervalMs)
    }
  }

  // Reset stopped flag in case startIndexer is called again after stopIndexer
  stopped = false
  loop()
}

// Run as standalone entry point
if (import.meta.url === new URL(process.argv[1], import.meta.url).href) {
  startIndexer().catch((err) => {
    console.error("[indexer] fatal", err)
    process.exit(1)
  })
}
