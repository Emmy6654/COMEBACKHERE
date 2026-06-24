import { useState, useCallback } from "react"
import type { Invoice, PaymentResult } from "../types"
import { fetchInvoice, payInvoice, requestRefund } from "../utils/soroban"

const CONTRACT_ID = import.meta.env.VITE_INVOICE_CONTRACT_ID as string

interface UseInvoiceReturn {
  invoice: Invoice | null
  loading: boolean
  error: string | null
  loadInvoice: (id: number) => Promise<void>
  pay: (publicKey: string) => Promise<PaymentResult>
  refund: (publicKey: string) => Promise<PaymentResult>
}

export function useInvoice(): UseInvoiceReturn {
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadInvoice = useCallback(async (id: number) => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchInvoice(CONTRACT_ID, id)
      setInvoice(result)
    } catch (err: any) {
      setError(err?.message ?? "Failed to load invoice")
    } finally {
      setLoading(false)
    }
  }, [])

  const pay = useCallback(
    async (publicKey: string): Promise<PaymentResult> => {
      if (!invoice) {
        return { success: false, error: "No invoice loaded" }
      }
      const result = await payInvoice(CONTRACT_ID, Number(invoice.id), publicKey)
      if (result.success) {
        await loadInvoice(Number(invoice.id))
      }
      return result
    },
    [invoice, loadInvoice]
  )

  const refund = useCallback(
    async (publicKey: string): Promise<PaymentResult> => {
      if (!invoice) {
        return { success: false, error: "No invoice loaded" }
      }
      const result = await requestRefund(
        CONTRACT_ID,
        Number(invoice.id),
        publicKey
      )
      if (result.success) {
        await loadInvoice(Number(invoice.id))
      }
      return result
    },
    [invoice, loadInvoice]
  )

  return { invoice, loading, error, loadInvoice, pay, refund }
}
