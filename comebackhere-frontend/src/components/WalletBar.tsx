import type { FC } from "react"

interface WalletBarProps {
  connected: boolean
  connecting: boolean
  address: string | null
  network: string | null
  expectedNetwork: string
  onConnect: () => void
  error?: string | null
  isLocked?: boolean
  isNotInstalled?: boolean
  onRetry?: () => void
}

export const WalletBar: FC<WalletBarProps> = ({
  connected,
  connecting,
  address,
  network,
  expectedNetwork,
  onConnect,
  error,
  isLocked = false,
  isNotInstalled = false,
  onRetry,
}) => {
  const wrongNetwork = connected && network !== null && network !== expectedNetwork

  // Show error state if wallet is locked or not installed
  if (isLocked) {
    return (
      <div className="wallet-bar">
        <div className="wallet-error wallet-error--locked" role="alert">
          <span className="wallet-error__icon">🔒</span>
          <span className="wallet-error__message">Wallet is locked</span>
          <button
            className="btn btn--small btn--text"
            onClick={onRetry}
            disabled={connecting}
            data-testid="unlock-wallet-btn"
          >
            {connecting ? "Retrying..." : "Unlock & Retry"}
          </button>
        </div>
      </div>
    )
  }

  if (isNotInstalled) {
    return (
      <div className="wallet-bar">
        <div className="wallet-error wallet-error--not-installed" role="alert">
          <span className="wallet-error__icon">⚠️</span>
          <span className="wallet-error__message">Freighter wallet not detected</span>
          <a
            href="https://www.freighter.app/"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn--small btn--text"
          >
            Install Extension
          </a>
        </div>
      </div>
    )
  }

  if (error && !connected) {
    return (
      <div className="wallet-bar">
        <div className="wallet-error wallet-error--generic" role="alert">
          <span className="wallet-error__icon">❌</span>
          <span className="wallet-error__message">{error}</span>
          <button
            className="btn btn--small btn--text"
            onClick={onRetry || onConnect}
            disabled={connecting}
            data-testid="retry-connect-btn"
          >
            {connecting ? "Retrying..." : "Try Again"}
          </button>
        </div>
      </div>
    )
  }

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
