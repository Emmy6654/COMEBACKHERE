import { useRef, useEffect, useCallback } from 'react'
import { renderQRToCanvas, downloadQRAsPNG } from '../utils/qrcode'

interface InvoiceQRCodeProps {
  invoiceId: string
  paymentBaseUrl?: string
}

function getPaymentUrl(invoiceId: string, baseUrl?: string): string {
  const base = baseUrl || `${window.location.origin}${window.location.pathname}`
  const url = new URL(base)
  url.searchParams.set('invoiceId', invoiceId)
  return url.toString()
}

export function InvoiceQRCode({ invoiceId, paymentBaseUrl }: InvoiceQRCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const paymentUrl = getPaymentUrl(invoiceId, paymentBaseUrl)

  useEffect(() => {
    if (canvasRef.current) {
      renderQRToCanvas(canvasRef.current, paymentUrl, 6, 4)
    }
  }, [paymentUrl])

  const handleDownload = useCallback(() => {
    downloadQRAsPNG(paymentUrl, `invoice-${invoiceId}-qr.png`)
  }, [paymentUrl, invoiceId])

  return (
    <div className="qr-code-section">
      <h3 className="qr-code-section__title">Payment QR Code</h3>
      <p className="qr-code-section__desc">
        Scan this QR code to open the payment page for Invoice #{invoiceId}
      </p>
      <div className="qr-code-section__canvas-wrap">
        <canvas ref={canvasRef} className="qr-code-section__canvas" />
      </div>
      <button
        className="btn btn--secondary qr-code-section__download"
        onClick={handleDownload}
        type="button"
      >
        Download QR Code (PNG)
      </button>
      <p className="qr-code-section__url">{paymentUrl}</p>
    </div>
  )
}
