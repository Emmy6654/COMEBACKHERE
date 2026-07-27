import { createApp } from "./app.js"
import { startTreasuryIndexer } from "./services/treasury-indexer.js"

// ---------------------------------------------------------------------------
// Startup environment variable validation (issue #222)
//
// Fail fast with a single clear message listing every missing variable rather
// than crashing on first use deep inside the application.
// ---------------------------------------------------------------------------

/** All env vars that must be present for the server to function correctly. */
export const REQUIRED_ENV_VARS = [
  "MONGODB_URI",
  "REDIS_URL",
  "SOROBAN_RPC_URL",
  "TREASURY_CONTRACT_ID",
  "INVOICE_CONTRACT_ID",
  "ADMIN_KEY",
  "WEBHOOK_SECRET",
] as const

/**
 * Validates that all required environment variables are set.
 * Accepts an optional env map so that tests can pass a controlled object
 * rather than relying on `process.env`.
 *
 * Throws an Error that lists *every* missing variable in one message.
 */
export function validateEnv(env: Record<string, string | undefined> = process.env): void {
  const missing = REQUIRED_ENV_VARS.filter((key) => !env[key])
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable${missing.length > 1 ? "s" : ""}:\n` +
        missing.map((k) => `  - ${k}`).join("\n") +
        "\nSet the above variables before starting the server.",
    )
  }
}

// Only execute the server bootstrap when this file is run as the main entry
// point, not when it is imported by tests or other modules.
const isMain =
  process.argv[1] != null &&
  new URL(import.meta.url).pathname === new URL(process.argv[1], import.meta.url).pathname

if (isMain) {
  validateEnv()

  const PORT = process.env.PORT ?? "3000"
  const app = createApp()

  startTreasuryIndexer()

  app.listen(Number(PORT), () => {
    console.log(`comebackhere-backend listening on port ${PORT}`)
  })
}
