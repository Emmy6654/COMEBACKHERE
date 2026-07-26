import { useState, useEffect, useCallback } from "react"

interface FreighterApi {
  getAddress: () => Promise<{ address: string }>
}

interface WindowWithFreighter extends Window {
  freighterApi?: FreighterApi
}

interface WalletState {
  address: string | null
  connected: boolean
  connecting: boolean
  error: string | null
  isLocked: boolean
  isNotInstalled: boolean
}

/**
 * Determine if an error is due to wallet extension being locked
 */
function isWalletLockedError(error: unknown): boolean {
  if (!error) return false
  const errorStr = error instanceof Error ? error.message : String(error)
  const lockedIndicators = [
    "locked",
    "user rejected",
    "not approved",
    "not allowed",
    "unauthorized",
  ]
  return lockedIndicators.some((indicator) =>
    errorStr.toLowerCase().includes(indicator)
  )
}

export function useWallet() {
  const [wallet, setWallet] = useState<WalletState>({
    address: null,
    connected: false,
    connecting: false,
    error: null,
    isLocked: false,
    isNotInstalled: false,
  })

  useEffect(() => {
    const checkConnection = async () => {
      const freighterApi = (window as WindowWithFreighter).freighterApi

      if (!freighterApi) {
        setWallet((prev) => ({
          ...prev,
          isNotInstalled: true,
          isLocked: false,
          error: null,
        }))
        return
      }

      try {
        const { address } = await freighterApi.getAddress()
        setWallet({
          address,
          connected: true,
          connecting: false,
          error: null,
          isLocked: false,
          isNotInstalled: false,
        })
      } catch (err: unknown) {
        const isLocked = isWalletLockedError(err)
        const errorMessage = err instanceof Error ? err.message : "Unknown error"

        setWallet({
          address: null,
          connected: false,
          connecting: false,
          error: errorMessage,
          isLocked,
          isNotInstalled: false,
        })
      }
    }

    checkConnection()
  }, [])

  const connect = useCallback(async () => {
    setWallet((prev) => ({ ...prev, connecting: true, error: null }))

    const freighterApi = (window as WindowWithFreighter).freighterApi

    if (!freighterApi) {
      setWallet({
        address: null,
        connected: false,
        connecting: false,
        error: "Freighter wallet not detected",
        isLocked: false,
        isNotInstalled: true,
      })
      return
    }

    try {
      const { address } = await freighterApi.getAddress()
      setWallet({
        address,
        connected: true,
        connecting: false,
        error: null,
        isLocked: false,
        isNotInstalled: false,
      })
    } catch (err: unknown) {
      const isLocked = isWalletLockedError(err)
      const errorMessage = err instanceof Error ? err.message : "Failed to connect wallet"

      setWallet({
        address: null,
        connected: false,
        connecting: false,
        error: errorMessage,
        isLocked,
        isNotInstalled: false,
      })
      throw err
    }
  }, [])

  const disconnect = useCallback(() => {
    setWallet({
      address: null,
      connected: false,
      connecting: false,
      error: null,
      isLocked: false,
      isNotInstalled: false,
    })
  }, [])

  const retryConnect = useCallback(async () => {
    // Clear the locked/error state and retry
    await connect()
  }, [connect])

  return {
    ...wallet,
    connect,
    disconnect,
    retryConnect,
  }
}
