import { useState, useCallback } from "react"

interface CopyableTextProps {
  text: string
  label?: string
  className?: string
}

export function CopyableText({ text, label, className }: CopyableTextProps) {
  const [copied, setCopied] = useState(false)
  const [announcement, setAnnouncement] = useState("")

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    // Clear first so identical consecutive copies still mutate the live
    // region's content, since screen readers only announce on a change.
    setAnnouncement("")
    window.setTimeout(() => setAnnouncement(`Copied ${label ?? text} to clipboard`), 50)
    setTimeout(() => setCopied(false), 2000)
  }, [text, label])

  return (
    <span
      className={`copyable-text ${className ?? ""}`}
      onClick={handleCopy}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleCopy() } }}
      role="button"
      tabIndex={0}
      title={`Click to copy: ${text}`}
      aria-label={`${label ?? "Copy"}: ${text}`}
      style={{ cursor: "pointer", position: "relative", display: "inline-flex", alignItems: "center", gap: "4px" }}
    >
      <span>{text}</span>
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={{ opacity: 0.5, flexShrink: 0 }}
      >
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
      {copied && (
        <span
          style={{
            position: "absolute",
            top: "-24px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#22c55e",
            color: "#fff",
            padding: "2px 8px",
            borderRadius: "4px",
            fontSize: "12px",
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}
        >
          Copied!
        </span>
      )}
      {/* Always mounted so screen readers pick up the text mutation; a
          region inserted at the same time as its content is unreliably
          announced. */}
      <span
        role="status"
        aria-live="polite"
        style={{
          position: "absolute",
          width: "1px",
          height: "1px",
          padding: 0,
          margin: "-1px",
          overflow: "hidden",
          clip: "rect(0, 0, 0, 0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      >
        {announcement}
      </span>
    </span>
  )
}
