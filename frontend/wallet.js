const WALLET_INSTALL_URLS = {
  freighter: 'https://www.freighter.app/',
  albedo: 'https://albedo.link/',
};

const WalletState = Object.freeze({
  IDLE: 'idle',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error',
});

class WalletError extends Error {
  constructor(message, code = 'UNKNOWN') {
    super(message);
    this.name = 'WalletError';
    this.code = code;
  }
}

function truncateAddress(address) {
  if (!address || address.length < 12) return address || '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

async function connectFreighter() {
  if (typeof window.freighter === 'undefined' && typeof window.freighterApi === 'undefined') {
    throw new WalletError(
      'Freighter extension is not installed. Please install it to continue.',
      'NOT_INSTALLED'
    );
  }

  try {
    const freighter = window.freighter ?? window.freighterApi;
    const isAllowed = await freighter.isConnected();
    if (!isAllowed) {
      await freighter.connect();
    }
    const { address } = await freighter.getAddress();
    const publicKey = await freighter.getPublicKey();
    return { address, publicKey, wallet: 'freighter' };
  } catch (err) {
    if (err instanceof WalletError) throw err;
    throw new WalletError(
      `Freighter connection failed: ${err.message}`,
      'CONNECTION_FAILED'
    );
  }
}

async function connectAlbedo() {
  if (typeof window.albedo === 'undefined') {
    throw new WalletError(
      'Albedo is not available. Please open Albedo or install the extension.',
      'NOT_INSTALLED'
    );
  }

  try {
    const result = await window.albedo.publicKey({});
    return {
      address: result.pubkey,
      publicKey: result.pubkey,
      wallet: 'albedo',
    };
  } catch (err) {
    throw new WalletError(
      `Albedo connection failed: ${err.message}`,
      'CONNECTION_FAILED'
    );
  }
}

const walletConnectors = {
  freighter: { connect: connectFreighter, name: 'Freighter' },
  albedo: { connect: connectAlbedo, name: 'Albedo' },
};

async function disconnectFreighter() {
  try {
    const freighter = window.freighter ?? window.freighterApi;
    if (freighter?.disconnect) {
      await freighter.disconnect();
    }
  } catch {
  }
}

async function disconnectAlbedo() {
  try {
    if (window.albedo?.publicKey) {
      await window.albedo.publicKey({ forget: true });
    }
  } catch {
  }
}

const walletDisconnectors = {
  freighter: disconnectFreighter,
  albedo: disconnectAlbedo,
};
