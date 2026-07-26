import { describe, it, expect } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, fireEvent } from '@testing-library/react'
import { ToastProvider, useToast } from './Toast'

function Fire({ messages }: { messages: string[] }) {
  const { addToast } = useToast()
  return (
    <button onClick={() => messages.forEach((m) => addToast('info', m))}>
      fire
    </button>
  )
}

function renderWithProvider(messages: string[]) {
  render(
    <ToastProvider>
      <Fire messages={messages} />
    </ToastProvider>,
  )
  fireEvent.click(screen.getByText('fire'))
}

describe('Toast queueing', () => {
  it('shows all toasts when the count is within the visible cap', () => {
    renderWithProvider(['first', 'second', 'third'])

    expect(screen.getByText('first')).toBeInTheDocument()
    expect(screen.getByText('second')).toBeInTheDocument()
    expect(screen.getByText('third')).toBeInTheDocument()
  })

  it('caps simultaneously visible toasts and queues the rest', () => {
    renderWithProvider(['first', 'second', 'third', 'fourth'])

    expect(screen.getByText('first')).toBeInTheDocument()
    expect(screen.getByText('second')).toBeInTheDocument()
    expect(screen.getByText('third')).toBeInTheDocument()
    expect(screen.queryByText('fourth')).not.toBeInTheDocument()
  })

  it('promotes the next queued toast once a visible one is dismissed', () => {
    renderWithProvider(['first', 'second', 'third', 'fourth'])

    expect(screen.queryByText('fourth')).not.toBeInTheDocument()

    const dismissButtons = screen.getAllByLabelText('Dismiss')
    fireEvent.click(dismissButtons[0])

    expect(screen.queryByText('first')).not.toBeInTheDocument()
    expect(screen.getByText('fourth')).toBeInTheDocument()
  })

  it('throws when useToast is used outside of a ToastProvider', () => {
    function Broken() {
      useToast()
      return null
    }

    expect(() => render(<Broken />)).toThrow('useToast must be used within a ToastProvider')
  })
})
