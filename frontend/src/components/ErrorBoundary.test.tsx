import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { ErrorBoundary } from "./ErrorBoundary"

const ThrowError = () => {
  throw new Error("Test error message")
}

const ValidComponent = () => <div>Valid component</div>

describe("ErrorBoundary", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  it("should render children when no error occurs", () => {
    render(
      <ErrorBoundary>
        <ValidComponent />
      </ErrorBoundary>,
    )
    expect(screen.getByText("Valid component")).toBeInTheDocument()
  })

  it("should catch render errors from child components", () => {
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>,
    )
    expect(screen.getByText("Something went wrong")).toBeInTheDocument()
  })

  it("should display the fallback UI with error message", () => {
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>,
    )
    expect(screen.getByText("Something went wrong")).toBeInTheDocument()
    expect(
      screen.getByText("An unexpected error occurred in this section. You can try again or reload the page."),
    ).toBeInTheDocument()
    expect(screen.getByText("Test error message")).toBeInTheDocument()
  })

  it("should display custom fallback title when provided", () => {
    render(
      <ErrorBoundary fallbackTitle="Custom Error Title">
        <ThrowError />
      </ErrorBoundary>,
    )
    expect(screen.getByText("Custom Error Title")).toBeInTheDocument()
  })

  it("should display Try Again button", () => {
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>,
    )
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument()
  })

  it("should reset error state when Try Again button is clicked", async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>,
    )
    expect(screen.getByText("Something went wrong")).toBeInTheDocument()

    const tryAgainButton = screen.getByRole("button", { name: /try again/i })
    await user.click(tryAgainButton)

    rerender(
      <ErrorBoundary>
        <ValidComponent />
      </ErrorBoundary>,
    )
    expect(screen.getByText("Valid component")).toBeInTheDocument()
  })

  it("should keep the rest of the app interactive when error occurs", () => {
    const InteractiveApp = () => (
      <div>
        <div>App Header</div>
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
        <div>App Footer</div>
      </div>
    )

    render(<InteractiveApp />)
    expect(screen.getByText("App Header")).toBeInTheDocument()
    expect(screen.getByText("App Footer")).toBeInTheDocument()
    expect(screen.getByText("Something went wrong")).toBeInTheDocument()
  })
})
