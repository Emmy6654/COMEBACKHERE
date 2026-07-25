import { useState, useCallback } from "react";

export type Network = "testnet" | "mainnet";

const NETWORK_STORAGE_KEY = "comebackhere-network";

const RPC_ENDPOINTS: Record<Network, string> = {
  testnet:
    import.meta.env.VITE_SOROBAN_RPC_TESTNET ??
    "https://soroban-testnet.stellar.org",
  mainnet:
    import.meta.env.VITE_SOROBAN_RPC_MAINNET ??
    "https://soroban-mainnet.stellar.org",
};

function getStoredNetwork(): Network {
  const stored = window.localStorage.getItem(NETWORK_STORAGE_KEY);
  return stored === "mainnet" ? "mainnet" : "testnet";
}

export function useNetwork() {
  const [network, setNetworkState] = useState<Network>(getStoredNetwork);

  const setNetwork = useCallback((next: Network) => {
    window.localStorage.setItem(NETWORK_STORAGE_KEY, next);
    setNetworkState(next);
  }, []);

  return {
    network,
    setNetwork,
    isMainnet: network === "mainnet",
    rpcUrl: RPC_ENDPOINTS[network],
  };
}
