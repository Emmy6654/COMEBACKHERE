/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_SOROBAN_RPC: string
  readonly VITE_HORIZON_URL: string
  readonly VITE_NETWORK_PASSPHRASE: string
  readonly VITE_INVOICE_CONTRACT_ID: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
