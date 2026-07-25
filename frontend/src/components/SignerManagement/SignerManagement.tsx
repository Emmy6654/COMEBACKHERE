import { useState } from 'react'
import { useSigners } from '../../hooks/useSigners'
import { SignerInfo } from '../../types'
import './SignerManagement.css'

const STELLAR_ADDRESS_RE = /^[G][A-Z0-9]{55}$/

function shorten(addr: string): string {
  if (!addr || addr.length < 12) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

function ConfirmModal({
  title,
  message,
  onConfirm,
  onCancel,
  danger,
}: {
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void
  danger?: boolean
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal">
        <h3 id="modal-title" className="modal__title">{title}</h3>
        <p className="modal__message">{message}</p>
        <div className="modal__actions">
          <button className="btn btn--secondary" onClick={onCancel}>Cancel</button>
          <button
            className={`btn ${danger ? 'btn--danger' : 'btn--primary'}`}
            onClick={onConfirm}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}

function AddSignerForm({ onAdd }: { onAdd: (address: string, weight: number) => Promise<void> }) {
  const [address, setAddress] = useState('')
  const [weight, setWeight] = useState('')
  const [addressErr, setAddressErr] = useState('')
  const [weightErr, setWeightErr] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitErr, setSubmitErr] = useState('')

  const validateAddress = (val: string) => {
    if (!STELLAR_ADDRESS_RE.test(val)) {
      setAddressErr('Invalid Stellar address (G + 55 alphanumeric chars)')
      return false
    }
    setAddressErr('')
    return true
  }

  const validateWeight = (val: string) => {
    const n = parseInt(val, 10)
    if (!val || isNaN(n) || n <= 0 || !Number.isInteger(n)) {
      setWeightErr('Weight must be a positive integer')
      return false
    }
    setWeightErr('')
    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitErr('')
    const addrOk = validateAddress(address)
    const wtOk = validateWeight(weight)
    if (!addrOk || !wtOk) return
    setSubmitting(true)
    try {
      await onAdd(address, parseInt(weight, 10))
      setAddress('')
      setWeight('')
    } catch (err: any) {
      setSubmitErr(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="add-signer-form" onSubmit={handleSubmit} noValidate>
      <h3 className="signer-section-title">Add Signer</h3>
      <div className="form-row">
        <div className="form-field">
          <label className="form-label" htmlFor="signer-address">Address</label>
          <input
            id="signer-address"
            className={`form-input${addressErr ? ' form-input--error' : ''}`}
            type="text"
            placeholder="GXXXXXXX..."
            maxLength={56}
            value={address}
            onChange={e => { setAddress(e.target.value); if (addressErr) validateAddress(e.target.value) }}
            onBlur={() => address && validateAddress(address)}
          />
          {addressErr && <p className="form-error">{addressErr}</p>}
        </div>
        <div className="form-field form-field--weight">
          <label className="form-label" htmlFor="signer-weight">Weight</label>
          <input
            id="signer-weight"
            className={`form-input${weightErr ? ' form-input--error' : ''}`}
            type="number"
            min="1"
            step="1"
            placeholder="1"
            value={weight}
            onChange={e => { setWeight(e.target.value); if (weightErr) validateWeight(e.target.value) }}
            onBlur={() => weight && validateWeight(weight)}
          />
          {weightErr && <p className="form-error">{weightErr}</p>}
        </div>
        <button className="btn btn--primary form-submit-btn" type="submit" disabled={submitting}>
          {submitting ? 'Adding...' : 'Add Signer'}
        </button>
      </div>
      {submitErr && <p className="form-error">{submitErr}</p>}
    </form>
  )
}

function SignerRow({
  signer,
  onRemove,
}: {
  signer: SignerInfo
  onRemove: (address: string) => void
}) {
  return (
    <tr className="signer-row">
      <td className="signer-td signer-td--address" title={signer.address}>
        <span className="address-full">{signer.address}</span>
        <span className="address-short">{shorten(signer.address)}</span>
      </td>
      <td className="signer-td">
        <span className="weight-badge">{signer.weight}</span>
      </td>
      <td className="signer-td">
        <button
          className="btn btn--danger btn--sm"
          onClick={() => onRemove(signer.address)}
          aria-label={`Remove signer ${shorten(signer.address)}`}
        >
          Remove
        </button>
      </td>
    </tr>
  )
}

export default function SignerManagement() {
  const { signers, loading, error, addSigner, removeSigner, rotateSigners } = useSigners()
  const [removeTarget, setRemoveTarget] = useState<string | null>(null)
  const [showRotateConfirm, setShowRotateConfirm] = useState(false)
  const [actionErr, setActionErr] = useState<string | null>(null)

  const handleRemoveConfirm = async () => {
    if (!removeTarget) return
    setActionErr(null)
    try {
      await removeSigner(removeTarget)
    } catch (e: any) {
      setActionErr(`Failed to remove signer: ${e.message}`)
    } finally {
      setRemoveTarget(null)
    }
  }

  const handleRotateConfirm = async () => {
    setActionErr(null)
    setShowRotateConfirm(false)
    try {
      await rotateSigners()
    } catch (e: any) {
      setActionErr(`Failed to rotate signers: ${e.message}`)
    }
  }

  if (loading && signers.length === 0) {
    return <div className="signer-panel"><p>Loading signers...</p></div>
  }

  if (error && signers.length === 0) {
    return <div className="signer-panel"><p className="signer-panel__error">Error: {error}</p></div>
  }

  return (
    <div className="signer-panel">
      <div className="signer-panel__header">
        <h2 className="signer-panel__title">Signer Management</h2>
        <button
          className="btn btn--secondary"
          onClick={() => setShowRotateConfirm(true)}
        >
          Trigger Rotation
        </button>
      </div>

      {actionErr && <p className="signer-panel__error">{actionErr}</p>}

      <div className="signer-table-wrap">
        {signers.length === 0 ? (
          <p className="signer-empty">No signers configured.</p>
        ) : (
          <table className="signer-table">
            <thead>
              <tr>
                <th className="signer-th">Address</th>
                <th className="signer-th">Weight</th>
                <th className="signer-th">Actions</th>
              </tr>
            </thead>
            <tbody>
              {signers.map(s => (
                <SignerRow key={s.address} signer={s} onRemove={setRemoveTarget} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <AddSignerForm onAdd={addSigner} />

      {removeTarget && (
        <ConfirmModal
          title="Remove Signer"
          message={`Remove signer ${shorten(removeTarget)}? This action cannot be undone.`}
          onConfirm={handleRemoveConfirm}
          onCancel={() => setRemoveTarget(null)}
          danger
        />
      )}

      {showRotateConfirm && (
        <ConfirmModal
          title="Trigger Signer Rotation"
          message="This will initiate a signer rotation on the treasury contract. Are you sure?"
          onConfirm={handleRotateConfirm}
          onCancel={() => setShowRotateConfirm(false)}
        />
      )}
    </div>
  )
}
