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
