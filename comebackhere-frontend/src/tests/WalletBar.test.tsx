import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi } from "vitest"
import { WalletBar } from "../components/WalletBar"

const NETWORK = "Standalone Network ; February 2025"
const ADDRESS = "GBDXOEXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"

const defaults = {
  connected: false,
  connecting: false,
  address: null,
  network: null,
  expectedNetwork: NETWORK,
  onConnect: vi.fn(),
  error: null,
  isLocked: false,
  isNotInstalled: false,
}

describe("WalletBar — disconnected state", () => {
  it("renders connect wallet button", () => {
    render(<WalletBar {...defaults} />)
    expect(screen.getByTestId("connect-wallet-btn")).toBeInTheDocument()
    expect(screen.getByText("Connect Wallet")).toBeInTheDocument()
  })

  it("button calls onConnect when clicked", async () => {
    const onConnect = vi.fn()
    render(<WalletBar {...defaults} onConnect={onConnect} />)
    await userEvent.click(screen.getByTestId("connect-wallet-btn"))
    expect(onConnect).toHaveBeenCalledOnce()
  })

  it("button is disabled while connecting", () => {
    render(<WalletBar {...defaults} connecting={true} />)
    expect(screen.getByTestId("connect-wallet-btn")).toBeDisabled()
    expect(screen.getByText("Connecting...")).toBeInTheDocument()
  })

  it("does not render wallet address", () => {
    render(<WalletBar {...defaults} />)
    expect(screen.queryByTestId("wallet-address")).not.toBeInTheDocument()
  })
})

describe("WalletBar — locked wallet state", () => {
  const lockedProps = {
    ...defaults,
    isLocked: true,
    error: "User rejected",
  }

  it("renders locked wallet error message", () => {
    render(<WalletBar {...lockedProps} />)
    expect(screen.getByText("Wallet is locked")).toBeInTheDocument()
  })

  it("shows lock icon", () => {
    render(<WalletBar {...lockedProps} />)
    expect(screen.getByText("🔒")).toBeInTheDocument()
  })

  it("renders unlock and retry button", () => {
    render(<WalletBar {...lockedProps} />)
    const btn = screen.getByTestId("unlock-wallet-btn")
    expect(btn).toBeInTheDocument()
    expect(btn).toHaveTextContent("Unlock & Retry")
  })

  it("unlock button calls onRetry when clicked", async () => {
    const onRetry = vi.fn()
    render(<WalletBar {...lockedProps} onRetry={onRetry} />)
    await userEvent.click(screen.getByTestId("unlock-wallet-btn"))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it("unlock button is disabled while retrying", () => {
    const onRetry = vi.fn()
    render(
      <WalletBar {...lockedProps} onRetry={onRetry} connecting={true} />
    )
    expect(screen.getByTestId("unlock-wallet-btn")).toBeDisabled()
    expect(screen.getByText("Retrying...")).toBeInTheDocument()
  })

  it("has alert role for accessibility", () => {
    render(<WalletBar {...lockedProps} />)
    const alert = screen.getByRole("alert")
    expect(alert).toBeInTheDocument()
  })
})

describe("WalletBar — not installed state", () => {
  const notInstalledProps = {
    ...defaults,
    isNotInstalled: true,
    error: "Freighter wallet not detected",
  }

  it("renders not installed error message", () => {
    render(<WalletBar {...notInstalledProps} />)
    expect(screen.getByText("Freighter wallet not detected")).toBeInTheDocument()
  })

  it("shows warning icon", () => {
    render(<WalletBar {...notInstalledProps} />)
    expect(screen.getByText("⚠️")).toBeInTheDocument()
  })

  it("renders install extension link", () => {
    render(<WalletBar {...notInstalledProps} />)
    const link = screen.getByText("Install Extension")
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute("href", "https://www.freighter.app/")
    expect(link).toHaveAttribute("target", "_blank")
  })
})

describe("WalletBar — generic error state", () => {
  const errorProps = {
    ...defaults,
    connected: false,
    error: "Connection failed",
  }

  it("renders generic error message", () => {
    render(<WalletBar {...errorProps} />)
    expect(screen.getByText("Connection failed")).toBeInTheDocument()
  })

  it("shows error icon", () => {
    render(<WalletBar {...errorProps} />)
    expect(screen.getByText("❌")).toBeInTheDocument()
  })

  it("renders try again button", () => {
    render(<WalletBar {...errorProps} />)
    const btn = screen.getByTestId("retry-connect-btn")
    expect(btn).toBeInTheDocument()
    expect(btn).toHaveTextContent("Try Again")
  })

  it("try again button calls onRetry", async () => {
    const onRetry = vi.fn()
    render(<WalletBar {...errorProps} onRetry={onRetry} />)
    await userEvent.click(screen.getByTestId("retry-connect-btn"))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})

describe("WalletBar — connected state (correct network)", () => {
  const connectedProps = {
    ...defaults,
    connected: true,
    address: ADDRESS,
    network: NETWORK,
  }

  it("renders truncated wallet address", () => {
    render(<WalletBar {...connectedProps} />)
    const addr = screen.getByTestId("wallet-address")
    expect(addr).toBeInTheDocument()
    expect(addr).toHaveTextContent("GBDXOE")
    expect(addr).toHaveTextContent(ADDRESS.slice(-4))
  })

  it("does not render connect button", () => {
    render(<WalletBar {...connectedProps} />)
    expect(screen.queryByTestId("connect-wallet-btn")).not.toBeInTheDocument()
  })

  it("does not show network warning", () => {
    render(<WalletBar {...connectedProps} />)
    expect(screen.queryByTestId("network-warning")).not.toBeInTheDocument()
  })
})

describe("WalletBar — wrong-network state", () => {
  const wrongNetworkProps = {
    ...defaults,
    connected: true,
    address: ADDRESS,
    network: "Public Global Stellar Network ; September 2015",
  }

  it("renders network warning alert", () => {
    render(<WalletBar {...wrongNetworkProps} />)
    const warning = screen.getByTestId("network-warning")
    expect(warning).toBeInTheDocument()
    expect(warning).toHaveAttribute("role", "alert")
  })

  it("network warning mentions expected network", () => {
    render(<WalletBar {...wrongNetworkProps} />)
    expect(screen.getByTestId("network-warning")).toHaveTextContent(NETWORK)
  })

  it("still shows wallet address alongside warning", () => {
    render(<WalletBar {...wrongNetworkProps} />)
    expect(screen.getByTestId("wallet-address")).toBeInTheDocument()
  })
})
