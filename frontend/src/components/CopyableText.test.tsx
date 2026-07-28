import { describe, it, expect, beforeEach, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CopyableText } from './CopyableText'

const writeTextMock = vi.fn()

describe('CopyableText accessible copy confirmation', () => {
  beforeEach(() => {
    writeTextMock.mockReset().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
    })
  })

  it('shows the existing visual "Copied!" feedback on copy', async () => {
    render(<CopyableText text="GABC...ADDR" />)

    fireEvent.click(screen.getByRole('button'))

    expect(await screen.findByText('Copied!')).toBeInTheDocument()
  })

  it('announces the copy via a polite, always-mounted aria-live region', async () => {
    render(<CopyableText text="GABC...ADDR" label="Address" />)

    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(status).toHaveTextContent('')

    fireEvent.click(screen.getByRole('button', { name: /Address/ }))

    await waitFor(() => {
      expect(status).toHaveTextContent('Copied Address to clipboard')
    })
  })

  it('keeps the live region mounted before and after the announcement (never conditionally inserted)', async () => {
    render(<CopyableText text="GABC...ADDR" />)

    expect(screen.getByRole('status')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/Copied/)
    })

    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('copies the raw text to the clipboard', async () => {
    render(<CopyableText text="GABC...ADDR" />)

    fireEvent.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith('GABC...ADDR')
    })
  })
})
