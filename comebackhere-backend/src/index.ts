import { createApp } from "./app.js"
import { startTreasuryIndexer } from "./services/treasury-indexer.js"

const PORT = process.env.PORT ?? "3000"
const app = createApp()

startTreasuryIndexer()

app.listen(Number(PORT), () => {
  console.log(`comebackhere-backend listening on port ${PORT}`)
})
