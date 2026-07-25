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
}

export function useWallet() {
  const [wallet, setWallet] = useState<WalletState>({
    address: null,
    connected: false,
    connecting: false,
  })

  useEffect(() => {
    const checkConnection = async () => {
      if ((window as WindowWithFreighter).freighterApi) {
        try {
          const { address } =
            await (window as WindowWithFreighter).freighterApi!.getAddress()
          setWallet({
            address,
            connected: true,
            connecting: false,
          })
        } catch {
          setWallet({
            address: null,
            connected: false,
            connecting: false,
          })
        }
      }
    }
    checkConnection()
  }, [])

  const connect = useCallback(async () => {
    setWallet((prev) => ({ ...prev, connecting: true }))
    try {
      if ((window as WindowWithFreighter).freighterApi) {
        const { address } =
          await (window as WindowWithFreighter).freighterApi!.getAddress()
        setWallet({
          address,
          connected: true,
          connecting: false,
        })
      } else {
        throw new Error("Freighter wallet not detected")
      }
    } catch (err: unknown) {
      setWallet({
        address: null,
        connected: false,
        connecting: false,
      })
      throw err
    }
  }, [])

  const disconnect = useCallback(() => {
    setWallet({
      address: null,
      connected: false,
      connecting: false,
    })
  }, [])

  return { ...wallet, connect, disconnect }
}
