import { useNetwork } from "../hooks/useNetwork";
import "./NetworkMismatchBanner.css";

export default function NetworkMismatchBanner() {
  const { hasNetworkMismatch, network, walletNetwork, isCheckingWallet } = useNetwork();

  if (isCheckingWallet || !hasNetworkMismatch) {
    return null;
  }

  return (
    <div className="network-mismatch-banner" role="alert">
      <div className="network-mismatch-banner__content">
        <h3 className="network-mismatch-banner__title">Network Mismatch</h3>
        <p className="network-mismatch-banner__message">
          Your wallet is connected to <strong>{walletNetwork}</strong>, but COMEBACKHERE is
          configured for <strong>{network}</strong>. Please switch your wallet network or change the
          app configuration to proceed with transactions.
        </p>
        <div className="network-mismatch-banner__details">
          <div>
            <span className="network-mismatch-banner__label">App Network:</span>
            <span className="network-mismatch-banner__value">{network}</span>
          </div>
          <div>
            <span className="network-mismatch-banner__label">Wallet Network:</span>
            <span className="network-mismatch-banner__value">{walletNetwork || "Unknown"}</span>
          </div>
        </div>
        <p className="network-mismatch-banner__action">
          ⚠️ Transactions will fail until networks match.
        </p>
      </div>
    </div>
  );
}
