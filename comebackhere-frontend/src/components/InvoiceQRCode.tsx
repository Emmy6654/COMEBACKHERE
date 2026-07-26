import { useRef, useEffect, useCallback, useState } from 'react'
import { renderQRToCanvas, downloadQRAsPNG, getQRDataURL } from '../utils/qrcode'

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

/**
 * Convert data URL to Blob for Web Share API
 */
async function dataURLToBlob(dataURL: string): Promise<Blob> {
  const response = await fetch(dataURL)
  return response.blob()
}

export function InvoiceQRCode({ invoiceId, paymentBaseUrl }: InvoiceQRCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isSharing, setIsSharing] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)
  const [showShareFallback, setShowShareFallback] = useState(false)

  const paymentUrl = getPaymentUrl(invoiceId, paymentBaseUrl)
  const filename = `invoice-${invoiceId}-qr.png`

  useEffect(() => {
    if (canvasRef.current) {
      renderQRToCanvas(canvasRef.current, paymentUrl, 6, 4)
    }
  }, [paymentUrl])

  const handleDownload = useCallback(() => {
    downloadQRAsPNG(paymentUrl, filename)
    setShareError(null)
  }, [paymentUrl, filename])

  const handleShare = useCallback(async () => {
    setShareError(null)
    setIsSharing(true)

    // Check if Web Share API is supported
    if (!navigator.share) {
      setShowShareFallback(true)
      setIsSharing(false)
      return
    }

    try {
      const dataURL = getQRDataURL(paymentUrl, 10, 4)
      const blob = await dataURLToBlob(dataURL)
      const file = new File([blob], filename, { type: 'image/png' })

      // Check if canShare is supported for files
      if (navigator.canShare && !navigator.canShare({ files: [file] })) {
        // Fallback to copying URL if file sharing isn't supported
        await navigator.share({
          title: `Invoice ${invoiceId} QR Code`,
          text: `Scan this QR code to pay Invoice #${invoiceId}`,
          url: paymentUrl,
        })
      } else if (navigator.canShare) {
        await navigator.share({
          files: [file],
          title: `Invoice ${invoiceId} QR Code`,
          text: `Scan this QR code to pay Invoice #${invoiceId}`,
        })
      } else {
        // Fallback for browsers that don't support file sharing
        await navigator.share({
          title: `Invoice ${invoiceId} QR Code`,
          text: `Scan this QR code to pay Invoice #${invoiceId}`,
          url: paymentUrl,
        })
      }
      setShowShareFallback(false)
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error && error.name !== 'AbortError'
          ? error.message
          : 'Share failed or was cancelled'
      setShareError(errorMessage)
      setShowShareFallback(true)
    } finally {
      setIsSharing(false)
    }
  }, [paymentUrl, filename, invoiceId])

  const handleCopyUrl = useCallback(() => {
    navigator.clipboard
      .writeText(paymentUrl)
      .then(() => {
        setShareError(null)
      })
      .catch(() => {
        setShareError('Failed to copy URL')
      })
  }, [paymentUrl])

  const supportsWebShare = typeof navigator !== 'undefined' && !!navigator.share

  return (
    <div className="qr-code-section">
      <h3 className="qr-code-section__title">Payment QR Code</h3>
      <p className="qr-code-section__desc">
        Scan this QR code to open the payment page for Invoice #{invoiceId}
      </p>
      <div className="qr-code-section__canvas-wrap">
        <canvas ref={canvasRef} className="qr-code-section__canvas" />
      </div>

      <div className="qr-code-section__actions">
        <button
          className="btn btn--secondary qr-code-section__download"
          onClick={handleDownload}
          type="button"
          title="Download QR code as PNG image"
        >
          📥 Download QR Code
        </button>

        {supportsWebShare && (
          <button
            className="btn btn--secondary qr-code-section__share"
            onClick={handleShare}
            disabled={isSharing}
            type="button"
            title="Share QR code using native share menu"
          >
            {isSharing ? '⏳ Sharing...' : '📤 Share'}
          </button>
        )}

        {showShareFallback && (
          <button
            className="btn btn--secondary qr-code-section__copy"
            onClick={handleCopyUrl}
            type="button"
            title="Copy payment URL to clipboard"
          >
            🔗 Copy URL
          </button>
        )}
      </div>

      {shareError && (
        <div className="qr-code-section__error" role="alert">
          ⚠️ {shareError}
        </div>
      )}

      <details className="qr-code-section__details">
        <summary className="qr-code-section__summary">Show Payment URL</summary>
        <p className="qr-code-section__url">{paymentUrl}</p>
      </details>
    </div>
  )
}
