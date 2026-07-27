import { useState, useEffect } from "react";
import "./OnboardingWizard.css";

type Step = "wallet" | "verify" | "invoice" | "dashboard";

const STEPS: { key: Step; title: string; description: string }[] = [
  {
    key: "wallet",
    title: "Connect Wallet",
    description: "Link your Stellar wallet to start accepting payments.",
  },
  {
    key: "verify",
    title: "Verify Address",
    description: "Confirm your Stellar address to enable payouts.",
  },
  {
    key: "invoice",
    title: "Create Invoice",
    description: "Set up your first invoice and share it with a customer.",
  },
  {
    key: "dashboard",
    title: "View Dashboard",
    description: "Explore your merchant dashboard and monitor activity.",
  },
];

interface OnboardingWizardProps {
  onComplete: () => void;
}

interface WizardState {
  currentStep: number;
  walletAddress: string;
  verified: boolean;
  invoiceAmount: string;
  invoiceRecipient: string;
  invoiceCreated: boolean;
}

const STORAGE_KEY = "comebackhere_onboarding_state";

function loadState(): WizardState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error("Failed to load wizard state:", e);
  }
  return {
    currentStep: 0,
    walletAddress: "",
    verified: false,
    invoiceAmount: "",
    invoiceRecipient: "",
    invoiceCreated: false,
  };
}

function saveState(state: WizardState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error("Failed to save wizard state:", e);
  }
}

export default function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const initialState = loadState();
  const [currentStep, setCurrentStep] = useState(initialState.currentStep);
  const [walletAddress, setWalletAddress] = useState(initialState.walletAddress);
  const [verified, setVerified] = useState(initialState.verified);
  const [invoiceAmount, setInvoiceAmount] = useState(initialState.invoiceAmount);
  const [invoiceRecipient, setInvoiceRecipient] = useState(initialState.invoiceRecipient);
  const [invoiceCreated, setInvoiceCreated] = useState(initialState.invoiceCreated);
  const [error, setError] = useState<string | null>(null);

  // Persist state to localStorage whenever it changes
  useEffect(() => {
    const state: WizardState = {
      currentStep,
      walletAddress,
      verified,
      invoiceAmount,
      invoiceRecipient,
      invoiceCreated,
    };
    saveState(state);
  }, [currentStep, walletAddress, verified, invoiceAmount, invoiceRecipient, invoiceCreated]);

  const step = STEPS[currentStep];

  // Validation functions for each step
  function validateWalletStep(): boolean {
    return walletAddress.length > 0;
  }

  function validateVerifyStep(): boolean {
    return verified;
  }

  function validateInvoiceStep(): boolean {
    return invoiceCreated;
  }

  function canProceedToNext(): boolean {
    switch (currentStep) {
      case 0: // wallet
        return validateWalletStep();
      case 1: // verify
        return validateVerifyStep();
      case 2: // invoice
        return validateInvoiceStep();
      default:
        return true;
    }
  }

  function handleConnectWallet() {
    setError(null);
    if (typeof window !== "undefined" && (window as any).freighterApi) {
      (window as any).freighterApi
        .getPublicKey()
        .then((key: string) => {
          setWalletAddress(key);
          setCurrentStep(1);
        })
        .catch(() => setError("Failed to connect wallet. Is Freighter installed?"));
    } else {
      setError("Freighter wallet extension not detected. Please install it and try again.");
    }
  }

  function handleVerifyAddress() {
    setError(null);
    if (!walletAddress) {
      setError("No wallet connected. Go back and connect your wallet first.");
      return;
    }
    if (!walletAddress.startsWith("G") || walletAddress.length !== 56) {
      setError("Invalid Stellar address format.");
      return;
    }
    setVerified(true);
    setCurrentStep(2);
  }

  function handleCreateInvoice() {
    setError(null);
    const amount = parseFloat(invoiceAmount);
    if (!amount || amount <= 0) {
      setError("Enter a valid invoice amount greater than zero.");
      return;
    }
    if (!invoiceRecipient.trim()) {
      setError("Enter a recipient email or wallet address.");
      return;
    }
    setInvoiceCreated(true);
    setCurrentStep(3);
  }

  function handleNext() {
    if (!canProceedToNext()) {
      switch (currentStep) {
        case 0: // wallet
          setError("Please connect your wallet to proceed.");
          break;
        case 1: // verify
          setError("Please verify your address to proceed.");
          break;
        case 2: // invoice
          setError("Please create an invoice to proceed.");
          break;
      }
      return;
    }
    setError(null);
    if (currentStep < STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      handleGoToDashboard();
    }
  }

  function handleGoToDashboard() {
    // Clear saved state on completion
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.error("Failed to clear wizard state:", e);
    }
    onComplete();
  }

  function handleBack() {
    setError(null);
    setCurrentStep((prev) => Math.max(0, prev - 1));
  }

  function renderStepContent() {
    switch (step.key) {
      case "wallet":
        return (
          <div className="wizard-step-content">
            <p>{step.description}</p>
            {walletAddress ? (
              <div className="wizard-wallet-connected">
                <span className="wizard-check">&#10003;</span>
                <span className="wizard-address">{walletAddress}</span>
              </div>
            ) : (
              <button className="wizard-btn wizard-btn--primary" onClick={handleConnectWallet}>
                Connect Freighter Wallet
              </button>
            )}
          </div>
        );
      case "verify":
        return (
          <div className="wizard-step-content">
            <p>{step.description}</p>
            <div className="wizard-field">
              <label className="wizard-label">Wallet Address</label>
              <input
                className="wizard-input"
                type="text"
                value={walletAddress}
                readOnly
              />
            </div>
            {verified ? (
              <div className="wizard-verified">
                <span className="wizard-check">&#10003;</span> Address verified
              </div>
            ) : (
              <button className="wizard-btn wizard-btn--primary" onClick={handleVerifyAddress}>
                Verify Address
              </button>
            )}
          </div>
        );
      case "invoice":
        return (
          <div className="wizard-step-content">
            <p>{step.description}</p>
            <div className="wizard-field">
              <label className="wizard-label">Amount (USDC)</label>
              <input
                className="wizard-input"
                type="number"
                min="0"
                step="0.01"
                placeholder="100.00"
                value={invoiceAmount}
                onChange={(e) => setInvoiceAmount(e.target.value)}
                disabled={invoiceCreated}
              />
            </div>
            <div className="wizard-field">
              <label className="wizard-label">Recipient</label>
              <input
                className="wizard-input"
                type="text"
                placeholder="customer@example.com or G..."
                value={invoiceRecipient}
                onChange={(e) => setInvoiceRecipient(e.target.value)}
                disabled={invoiceCreated}
              />
            </div>
            {invoiceCreated ? (
              <div className="wizard-verified">
                <span className="wizard-check">&#10003;</span> Invoice created
              </div>
            ) : (
              <button className="wizard-btn wizard-btn--primary" onClick={handleCreateInvoice}>
                Create Invoice
              </button>
            )}
          </div>
        );
      case "dashboard":
        return (
          <div className="wizard-step-content">
            <p>You&#39;re all set! Your merchant account is configured and your first invoice is ready.</p>
            <button className="wizard-btn wizard-btn--primary" onClick={handleGoToDashboard}>
              Go to Dashboard
            </button>
          </div>
        );
    }
  }

  return (
    <div className="wizard-overlay">
      <div className="wizard-container">
        <div className="wizard-header">
          <h2 className="wizard-title">Welcome to COMEBACKHERE</h2>
          <p className="wizard-subtitle">Complete these steps to start accepting payments</p>
        </div>

        <div className="wizard-progress">
          {STEPS.map((s, i) => (
            <div
              key={s.key}
              className={`wizard-progress-step${i === currentStep ? " wizard-progress-step--active" : ""}${i < currentStep ? " wizard-progress-step--done" : ""}`}
            >
              <div className="wizard-progress-circle">
                {i < currentStep ? "✓" : i + 1}
              </div>
              <span className="wizard-progress-label">{s.title}</span>
            </div>
          ))}
        </div>

        <div className="wizard-body">
          <h3 className="wizard-step-title">{step.title}</h3>
          {renderStepContent()}
          {error && <p className="wizard-error">{error}</p>}
        </div>

        <div className="wizard-footer">
          {currentStep > 0 && (
            <button className="wizard-btn wizard-btn--secondary" onClick={handleBack}>
              Back
            </button>
          )}
          {currentStep < STEPS.length - 1 && (
            <button
              className="wizard-btn wizard-btn--primary"
              onClick={handleNext}
              disabled={!canProceedToNext()}
              aria-label={`Proceed to step ${currentStep + 2} of ${STEPS.length}`}
            >
              Next
            </button>
          )}
          {currentStep === STEPS.length - 1 && error && (
            <p className="wizard-progress-info">
              Step {currentStep + 1} of {STEPS.length}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
