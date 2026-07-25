const connectBtn = document.getElementById('connectWalletBtn');
const modal = document.getElementById('walletModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const walletList = document.getElementById('walletList');
const connectionError = document.getElementById('connectionError');
const errorText = document.getElementById('errorText');
const installLink = document.getElementById('installLink');
const connectionLoading = document.getElementById('connectionLoading');
const appContent = document.getElementById('appContent');
const accountAddress = document.getElementById('accountAddress');
const disconnectBtn = document.getElementById('disconnectBtn');

let currentWallet = null;
let currentAddress = null;

function showModal() {
  modal.classList.remove('hidden');
  connectionError.classList.add('hidden');
  connectionLoading.classList.add('hidden');
  document.querySelectorAll('.wallet-option').forEach((btn) => (btn.disabled = false));
}

function hideModal() {
  modal.classList.add('hidden');
}

function showLoading() {
  connectionLoading.classList.remove('hidden');
  connectionError.classList.add('hidden');
  document.querySelectorAll('.wallet-option').forEach((btn) => (btn.disabled = true));
}

function showError(message, installUrl) {
  connectionLoading.classList.add('hidden');
  connectionError.classList.remove('hidden');
  errorText.textContent = message;
  document.querySelectorAll('.wallet-option').forEach((btn) => (btn.disabled = false));
  if (installUrl) {
    installLink.classList.remove('hidden');
    installLink.href = installUrl;
  } else {
    installLink.classList.add('hidden');
  }
}

function showConnected(wallet, address) {
  currentWallet = wallet;
  currentAddress = address;
  hideModal();
  connectBtn.classList.add('hidden');
  appContent.classList.remove('hidden');
  accountAddress.textContent = truncateAddress(address);
}

function disconnect() {
  const disconnector = walletDisconnectors[currentWallet];
  if (disconnector) {
    disconnector().catch(() => {});
  }
  currentWallet = null;
  currentAddress = null;
  connectBtn.classList.remove('hidden');
  appContent.classList.add('hidden');
}

async function handleWalletConnect(walletType) {
  const connector = walletConnectors[walletType];
  if (!connector) return;

  showLoading();

  try {
    const result = await connector.connect();
    showConnected(result.wallet, result.address);
  } catch (err) {
    let installUrl = null;
    if (err.code === 'NOT_INSTALLED') {
      installUrl = WALLET_INSTALL_URLS[walletType];
    }
    showError(err.message, installUrl);
  }
}

connectBtn.addEventListener('click', showModal);

closeModalBtn.addEventListener('click', hideModal);

modal.addEventListener('click', (e) => {
  if (e.target === modal) hideModal();
});

walletList.addEventListener('click', (e) => {
  const option = e.target.closest('.wallet-option');
  if (!option) return;
  const walletType = option.dataset.wallet;
  handleWalletConnect(walletType);
});

disconnectBtn.addEventListener('click', disconnect);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideModal();
});
