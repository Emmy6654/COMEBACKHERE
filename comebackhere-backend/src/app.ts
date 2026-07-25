import express from "express"
import invoicesRouter from "./routes/invoices.js"
import complianceRouter from "./routes/compliance.js"
import releaseEscrowRouter from "./routes/release-escrow.js"
import treasuryRouter from "./routes/treasury.js"
import invoiceSettingsRouter from "./routes/invoice-settings.js"
import thresholdRouter from "./routes/threshold.js"
import disputesRouter from "./routes/disputes.js"
import { rateLimitMiddleware } from "./middleware/rateLimiter.js"

export function createApp() {
  const app = express()
  app.use(express.json())
  app.use(rateLimitMiddleware)
  app.use("/invoices", invoicesRouter)
  app.use("/invoices", releaseEscrowRouter)
  app.use("/compliance", complianceRouter)
  app.use("/api/treasury", treasuryRouter)
  app.use("/api/invoice", invoiceSettingsRouter)
  app.use("/api/treasury", thresholdRouter)
  app.use("/disputes", disputesRouter)
  return app
}
