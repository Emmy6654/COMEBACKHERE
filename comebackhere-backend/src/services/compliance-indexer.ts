import { xdr } from "stellar-sdk"
import { buildSorobanClient, type SorobanClient } from "../lib/soroban.js"
import { connectMongo, getCursorsCollection, getComplianceAuditCollection, type ComplianceAuditRecord } from "../db/mongo.js"

const CURSOR_ID = "compliance_audit_events"
const EVENT_LIMIT = 100
const POLL_INTERVAL_MS = 5_000
const EVENT_TYPES = new Set(["address_allowed", "address_allowed_until", "address_blocked", "address_cleared"])

function symbol(topic: xdr.ScVal[] | undefined, index: number): string {
  return topic?.[index]?.sym()?.toString() ?? ""
}

function address(value: xdr.ScVal | undefined): string {
  return value?.address()?.toString() ?? ""
}

function eventAddress(event: any, eventType: string): string {
  return address(eventType === "address_cleared" || eventType === "address_allowed_until"
    ? event.value?.vec()?.[0]
    : event.value)
}

function eventExpiry(event: any, eventType: string): number | null {
  if (eventType !== "address_allowed_until") return null
  return Number(event.value?.vec()?.[1]?.u64()?.toString() ?? 0) || null
}

export function complianceEventId(event: any, eventType: string, addressValue: string): string {
  return event.pagingToken ?? `${event.txHash ?? ""}:${eventType}:${addressValue}`
}

async function loadCursor(database: Awaited<ReturnType<typeof connectMongo>>) {
  return (await getCursorsCollection(database).findOne({ _id: CURSOR_ID })) ?? {
    _id: CURSOR_ID, paging_token: null, last_ledger: 0, updated_at: new Date(), processed_event_ids: [],
  }
}

export async function processComplianceIndexerBatch(
  client: SorobanClient,
  contractId: string,
  database: Awaited<ReturnType<typeof connectMongo>>,
): Promise<number> {
  const cursor = await loadCursor(database)
  const seen = new Set(cursor.processed_event_ids ?? [])
  const startLedger = cursor.last_ledger > 0 ? cursor.last_ledger : undefined
  const response = await client.getEvents({
    startLedger,
    ...(cursor.paging_token ? { cursor: cursor.paging_token } : {}),
    filters: [{ type: "contract", contractIds: [contractId] }],
    limit: EVENT_LIMIT,
  })
  const collection = getComplianceAuditCollection(database)
  const newIds: string[] = []
  let processed = 0
  let lastToken = cursor.paging_token

  for (const event of response.events ?? []) {
    const eventType = symbol(event.topic, 0)
    if (!EVENT_TYPES.has(eventType)) continue
    const addressValue = eventAddress(event, eventType)
    const id = complianceEventId(event, eventType, addressValue)
    lastToken = event.pagingToken ?? lastToken
    if (seen.has(id)) continue
    const record: ComplianceAuditRecord = {
      event_id: id,
      event_type: eventType as ComplianceAuditRecord["event_type"],
      address: addressValue,
      expires_at: eventExpiry(event, eventType),
      ledger: event.ledger ?? 0,
      ledger_closed_at: event.ledgerClosedAt ?? null,
      transaction_hash: event.txHash ?? "",
      contract_id: contractId,
      paging_token: event.pagingToken ?? null,
      created_at: new Date(),
    }
    await collection.updateOne({ event_id: id }, { $setOnInsert: record }, { upsert: true })
    seen.add(id)
    newIds.push(id)
    processed++
  }

  await getCursorsCollection(database).updateOne(
    { _id: CURSOR_ID },
    {
      $set: { paging_token: lastToken, last_ledger: response.latestLedger ?? cursor.last_ledger, updated_at: new Date() },
      ...(newIds.length ? { $push: { processed_event_ids: { $each: newIds, $slice: -1000 } } } : {}),
    } as any,
    { upsert: true },
  )
  return processed
}

let timer: ReturnType<typeof setInterval> | null = null
export function startComplianceIndexer(): void {
  if (timer) return
  const rpcUrl = process.env.SOROBAN_RPC_URL
  const contractId = process.env.COMPLIANCE_CONTRACT_ID
  if (!rpcUrl || !contractId) return
  const client = buildSorobanClient(rpcUrl)
  const tick = async () => {
    try { await processComplianceIndexerBatch(client, contractId, await connectMongo()) }
    catch (err) { console.error("[compliance-indexer] error:", err instanceof Error ? err.message : err) }
  }
  void tick()
  timer = setInterval(() => void tick(), POLL_INTERVAL_MS)
}
export function stopComplianceIndexer(): void {
  if (timer) { clearInterval(timer); timer = null }
}
