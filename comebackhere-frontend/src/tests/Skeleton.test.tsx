import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { Skeleton, InvoiceListSkeleton, SettlementListSkeleton, DashboardStatsSkeleton } from "../components/Skeleton"

describe("Skeleton", () => {
  it("renders with role=status", () => {
    render(<Skeleton />)
    expect(screen.getByRole("status")).toBeInTheDocument()
  })

  it("applies skeleton class", () => {
    render(<Skeleton />)
    expect(screen.getByRole("status")).toHaveClass("skeleton")
  })

  it("uses provided aria-label", () => {
    render(<Skeleton aria-label="Loading data" />)
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Loading data")
  })

  it("defaults aria-label to Loading...", () => {
    render(<Skeleton />)
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Loading...")
  })
})

describe("InvoiceListSkeleton", () => {
  it("renders default 3 rows", () => {
    const { container } = render(<InvoiceListSkeleton />)
    expect(container.querySelectorAll(".skeleton-invoice-row")).toHaveLength(3)
  })

  it("renders correct number of rows", () => {
    const { container } = render(<InvoiceListSkeleton rows={5} />)
    expect(container.querySelectorAll(".skeleton-invoice-row")).toHaveLength(5)
  })

  it("has accessible label on wrapper", () => {
    render(<InvoiceListSkeleton />)
    expect(screen.getByLabelText("Loading invoices")).toBeInTheDocument()
  })
})

describe("SettlementListSkeleton", () => {
  it("renders a table", () => {
    const { container } = render(<SettlementListSkeleton />)
    expect(container.querySelector("table")).toBeInTheDocument()
  })

  it("renders correct number of body rows", () => {
    const { container } = render(<SettlementListSkeleton rows={3} />)
    expect(container.querySelectorAll("tbody tr")).toHaveLength(3)
  })

  it("has accessible label on table", () => {
    render(<SettlementListSkeleton />)
    expect(screen.getByLabelText("Loading settlements")).toBeInTheDocument()
  })
})

describe("DashboardStatsSkeleton", () => {
  it("renders 3 stat card placeholders", () => {
    const { container } = render(<DashboardStatsSkeleton />)
    expect(container.querySelectorAll(".skeleton-stats-card")).toHaveLength(3)
  })

  it("has accessible label on wrapper", () => {
    render(<DashboardStatsSkeleton />)
    expect(screen.getByLabelText("Loading dashboard statistics")).toBeInTheDocument()
  })
})
