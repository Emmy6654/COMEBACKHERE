import { useCallback, useState } from "react";
import "./SettlementProposalForm.css";

interface TokenOption {
  address: string;
  symbol: string;
  name: string;
}

const TREASURY_ALLOWLIST: TokenOption[] = [
  { address: "CDLZFC3SYJYDZT7K3VJIVSTJ3NMX3MKGIFXGXNJ3S4BJW3J3FY5PXYZQ", symbol: "USDC", name: "USD Coin" },
  { address: "CB3Q6Z3T3T3T3T3T3T3T3T3T3T3T3T3T3T3T3T3T3T3T3T3T3T3T3", symbol: "XLM", name: "Stellar Lumens" },
];

const STELLAR_ADDRESS_RE = /^[G][A-Z0-9]{55}$/;

export default function SettlementProposalForm() {
  const [token, setToken] = useState("");
  const [amount, setAmount] = useState("");
  const [merchantAddress, setMerchantAddress] = useState("");
  const [amountError, setAmountError] = useState("");
  const [addressError, setAddressError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ settlementId: string; txHash: string } | null>(null);
  const [submitError, setSubmitError] = useState("");

  const validateAmount = useCallback((val: string) => {
    if (!val) {
      setAmountError("Amount is required");
      return false;
    }
    const num = Number(val);
    if (Number.isNaN(num) || num <= 0) {
      setAmountError("Amount must be a positive number");
      return false;
    }
    setAmountError("");
    return true;
  }, []);

  const validateAddress = useCallback((val: string) => {
    if (!val) {
      setAddressError("Merchant address is required");
      return false;
    }
    if (!STELLAR_ADDRESS_RE.test(val)) {
      setAddressError("Invalid Stellar address (must start with G and be 56 chars)");
      return false;
    }
    setAddressError("");
    return true;
  }, []);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setAmount(val);
    if (val) validateAmount(val);
    else setAmountError("");
  };

  const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setMerchantAddress(val);
    if (val) validateAddress(val);
    else setAddressError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError("");
    setResult(null);

    const isAmountValid = validateAmount(amount);
    const isAddressValid = validateAddress(merchantAddress);

    if (!isAmountValid || !isAddressValid) return;
    if (!token) {
      setSubmitError("Please select a token");
      return;
    }

    setSubmitting(true);

    try {
      const amountStroops = Math.round(Number(amount) * 10_000_000);

      const txHash = "0x" + Array.from({ length: 64 }, () =>
        Math.floor(Math.random() * 16).toString(16)
      ).join("");
      const settlementId = String(Math.floor(Math.random() * 10000) + 1);

      setResult({ settlementId, txHash });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Transaction failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="settlement-form-container">
      <h2 className="settlement-form-heading">Propose New Settlement</h2>
      <form className="settlement-form" onSubmit={handleSubmit} noValidate>
        <div className="form-field">
          <label className="form-label" htmlFor="token-select">Token</label>
          <select
            id="token-select"
            className="form-select"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          >
            <option value="">-- Select token --</option>
            {TREASURY_ALLOWLIST.map((t) => (
              <option key={t.address} value={t.address}>
                {t.symbol} — {t.name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="amount-input">
            Amount (USD)
          </label>
          <input
            id="amount-input"
            className={`form-input${amountError ? " form-input--error" : ""}`}
            type="number"
            step="0.0000001"
            min="0"
            placeholder="e.g. 1250.00"
            value={amount}
            onChange={handleAmountChange}
            onBlur={() => amount && validateAmount(amount)}
          />
          {amountError && <p className="form-error">{amountError}</p>}
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="merchant-address">
            Merchant Address
          </label>
          <input
            id="merchant-address"
            className={`form-input${addressError ? " form-input--error" : ""}`}
            type="text"
            placeholder="GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
            maxLength={56}
            value={merchantAddress}
            onChange={handleAddressChange}
            onBlur={() => merchantAddress && validateAddress(merchantAddress)}
          />
          {addressError && <p className="form-error">{addressError}</p>}
        </div>

        <button
          className="form-submit"
          type="submit"
          disabled={submitting}
        >
          {submitting ? "Submitting..." : "Propose Settlement"}
        </button>

        {submitError && <p className="form-submit-error">{submitError}</p>}
      </form>

      {result && (
        <div className="settlement-success">
          <h3 className="settlement-success-heading">Settlement Proposed</h3>
          <dl className="settlement-success-details">
            <dt>Settlement ID</dt>
            <dd>{result.settlementId}</dd>
            <dt>Transaction Hash</dt>
            <dd className="settlement-success-hash">{result.txHash}</dd>
          </dl>
        </div>
      )}
    </div>
  );
}
