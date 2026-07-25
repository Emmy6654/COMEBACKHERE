import type { FC } from "react"

interface WalletBarProps {
  connected: boolean
  connecting: boolean
  address: string | null
  network: string | null
  expectedNetwork: string
  onConnect: () => void
}

export const WalletBar: FC<WalletBarProps> = ({
  connected,
  connecting,
  address,
  network,
  expectedNetwork,
  onConnect,
}) => {
  const wrongNetwork = connected && network !== null && network !== expectedNetwork

  if (!connected) {
    return (
      <div className="wallet-bar">
        <button
          className="btn btn--primary btn--sm"
          onClick={onConnect}
          disabled={connecting}
          data-testid="connect-wallet-btn"
        >
          {connecting ? "Connecting..." : "Connect Wallet"}
        </button>
      </div>
    )
  }

  return (
    <div className="wallet-bar">
      {wrongNetwork && (
        <span className="network-warning" role="alert" data-testid="network-warning">
          Wrong network — please switch to {expectedNetwork}
        </span>
      )}
      <span className="wallet-address" data-testid="wallet-address">
        {address?.slice(0, 6)}...{address?.slice(-4)}
      </span>
    </div>
  )
}
