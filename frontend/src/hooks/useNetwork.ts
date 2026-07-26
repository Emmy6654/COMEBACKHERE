import { useState, useCallback, useEffect } from "react";

export type Network = "testnet" | "mainnet";

const NETWORK_STORAGE_KEY = "comebackhere-network";

// Network passphrases for Stellar networks
const NETWORK_PASSPHRASES: Record<Network, string> = {
  testnet: "Test SDF Network ; September 2015",
  mainnet: "Public Global Stellar Network ; September 2015",
};

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

/**
 * Get the wallet's network passphrase via Freighter API
 * Returns null if wallet is not available or cannot be determined
 */
async function getWalletNetworkPassphrase(): Promise<string | null> {
  try {
    if (typeof window === "undefined" || !(window as any).freighterApi) {
      return null;
    }

    const { getNetworkDetails } = (window as any).freighterApi;
    if (!getNetworkDetails) {
      return null;
    }

    const networkDetails = await getNetworkDetails();
    return networkDetails?.passphrase ?? null;
  } catch {
    return null;
  }
}

/**
 * Determine if wallet network matches app configuration
 */
function isNetworkMismatch(appNetwork: Network, walletPassphrase: string | null): boolean {
  if (!walletPassphrase) {
    return false; // Cannot determine, so no mismatch
  }
  return walletPassphrase !== NETWORK_PASSPHRASES[appNetwork];
}

/**
 * Get the wallet's network based on its passphrase
 */
function getNetworkFromPassphrase(
  passphrase: string | null
): Network | null {
  if (!passphrase) return null;
  return passphrase === NETWORK_PASSPHRASES.mainnet ? "mainnet" : "testnet";
}

export function useNetwork() {
  const [network, setNetworkState] = useState<Network>(getStoredNetwork);
  const [walletPassphrase, setWalletPassphrase] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Poll for wallet network on mount and periodically
  useEffect(() => {
    const checkWalletNetwork = async () => {
      setIsLoading(true);
      const passphrase = await getWalletNetworkPassphrase();
      setWalletPassphrase(passphrase);
      setIsLoading(false);
    };

    checkWalletNetwork();
    const interval = setInterval(checkWalletNetwork, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, []);

  const setNetwork = useCallback((next: Network) => {
    window.localStorage.setItem(NETWORK_STORAGE_KEY, next);
    setNetworkState(next);
  }, []);

  const hasNetworkMismatch = isNetworkMismatch(network, walletPassphrase);
  const walletNetwork = getNetworkFromPassphrase(walletPassphrase);

  return {
    network,
    setNetwork,
    isMainnet: network === "mainnet",
    rpcUrl: RPC_ENDPOINTS[network],
    // Network mismatch detection
    hasNetworkMismatch,
    walletPassphrase,
    walletNetwork,
    isCheckingWallet: isLoading,
  };
}
