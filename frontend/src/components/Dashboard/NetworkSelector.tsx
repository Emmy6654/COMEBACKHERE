import { useNetwork } from "../../hooks/useNetwork";
import "./NetworkSelector.css";

export default function NetworkSelector() {
  const { network, setNetwork, isMainnet } = useNetwork();

  return (
    <div className="network-selector">
      <select
        className="network-selector__select"
        value={network}
        onChange={(e) => setNetwork(e.target.value as "testnet" | "mainnet")}
        aria-label="Select network"
      >
        <option value="testnet">Testnet</option>
        <option value="mainnet">Mainnet</option>
      </select>
      {isMainnet && (
        <div className="network-selector__warning" role="alert">
          ⚠️ You are connected to <strong>Mainnet</strong>. Transactions are
          irreversible and use real funds.
        </div>
      )}
    </div>
  );
}
