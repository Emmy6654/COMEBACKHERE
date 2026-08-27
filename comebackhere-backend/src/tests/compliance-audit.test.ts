import { beforeEach, describe, expect, it, vi } from "vitest"
import request from "supertest"
import { createApp } from "../app.js"
import * as mongo from "../db/mongo.js"

const VALID_ADDRESS = "GDR7WUDWIKWVBCUBVYLOGT3TJF5FGNQU5U7TACDDA2ZIQUETGGUET5XT"

const events = [
  { event_id: "2", event_type: "address_cleared", address: VALID_ADDRESS, ledger: 20 },
  { event_id: "1", event_type: "address_blocked", address: VALID_ADDRESS, ledger: 10 },
]

function mockCollection() {
  const chain = {
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    toArray: vi.fn().mockResolvedValue(events),
  }
  return {
    find: vi.fn().mockReturnValue(chain),
    countDocuments: vi.fn().mockResolvedValue(events.length),
  }
}

describe("GET /compliance/audit", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("returns normalized paginated events with filters", async () => {
    const collection = mockCollection()
    vi.spyOn(mongo, "connectMongo").mockResolvedValue({} as any)
    vi.spyOn(mongo, "getComplianceAuditCollection").mockReturnValue(collection as any)

    const response = await request(createApp()).get("/compliance/audit").query({
      address: VALID_ADDRESS, event_type: "address_cleared", page: 2, limit: 10,
    })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ page: 2, limit: 10, total: 2, has_more: false })
    expect(response.body.events).toHaveLength(2)
    expect(collection.find).toHaveBeenCalledWith({ address: VALID_ADDRESS, event_type: "address_cleared" })
  })

  it("rejects an invalid ledger range", async () => {
    const response = await request(createApp()).get("/compliance/audit").query({ from_ledger: 20, to_ledger: 10 })
    expect(response.status).toBe(400)
    expect(response.body.error).toMatch(/from_ledger/i)
  })

  it("rejects a limit above the public maximum", async () => {
    const response = await request(createApp()).get("/compliance/audit").query({ limit: 101 })
    expect(response.status).toBe(400)
  })
})
