import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import DashboardLayout from "./components/Dashboard/DashboardLayout";
import SettlementProposalForm from "./components/SettlementProposal/SettlementProposalForm";
import DisputeVotingPanel from "./components/DisputeVoting/DisputeVotingPanel";
import SignerManagement from "./components/SignerManagement/SignerManagement";
import ABIExplorer from "./components/ABIExplorer";
import InvoiceSearchFilter from "./components/InvoiceSearchFilter";
import { ErrorBoundary } from "./components/ErrorBoundary";
import OnboardingWizard from "./components/OnboardingWizard/OnboardingWizard";
import GraceWindowSettings from "./components/GraceWindowSettings/GraceWindowSettings";
import SettlementDetail from "./components/SettlementDetail/SettlementDetail";
import OnHoldSettlements from "./components/OnHoldSettlements/OnHoldSettlements";
import TreasuryManagerPage from "./components/TreasuryManagerPage/TreasuryManagerPage";
import { ThemeProvider, useTheme } from "./theme";
import { Invoice } from "./types";

// Placeholder data — replace with real API hook when the invoices endpoint is ready
const MOCK_INVOICES: Invoice[] = [];

function InvoicesPage() {
  return (
    <section>
      <h3 style={{ marginBottom: 16 }}>Invoices</h3>
      <InvoiceSearchFilter invoices={MOCK_INVOICES} />
    </section>
  );
}

function SettlementsPage() {
  return (
    <ErrorBoundary fallbackTitle="Failed to load settlements">
      <SettlementProposalForm />
    </ErrorBoundary>
  );
}

function SettlementDetailPage() {
  return (
    <ErrorBoundary fallbackTitle="Failed to load settlement detail">
      <SettlementDetail
        settlement={{ id: 0, merchant_address: "", amount: "0", approvals: [], approval_weight: 0, status: "Pending", hold_reason: null }}
        threshold={2}
        signers={[]}
      />
    </ErrorBoundary>
  );
}

function DisputesPage() {
  return (
    <ErrorBoundary fallbackTitle="Failed to load disputes">
      <DisputeVotingPanel />
    </ErrorBoundary>
  );
}

function SignersPage() {
  return (
    <ErrorBoundary fallbackTitle="Failed to load signer management">
      <SignerManagement />
    </ErrorBoundary>
  );
}

function OnHoldPage() {
  return (
    <ErrorBoundary fallbackTitle="Failed to load on-hold settlements">
      <OnHoldSettlements />
    </ErrorBoundary>
  );
}

function TreasuryPage() {
  return (
    <ErrorBoundary fallbackTitle="Failed to load treasury">
      <TreasuryManagerPage />
    </ErrorBoundary>
  );
}

function SettingsPage() {
  const { theme, toggleTheme } = useTheme();
  const nextTheme = theme === "dark" ? "light" : "dark";

  return (
    <>
      <GraceWindowSettings />
      <ThresholdConfig />
      <section className="settings-panel">
        <div>
          <h3 className="settings-panel__title">Appearance</h3>
          <p className="settings-panel__description">
            Current theme: {theme}. Your choice is remembered on this device.
          </p>
        </div>
        <button
          type="button"
          className="theme-toggle theme-toggle--wide"
          onClick={toggleTheme}
          aria-label={`Switch to ${nextTheme} theme`}
        >
          <span>Use {nextTheme} theme</span>
        </button>
      </section>
    </>
  );
}

function OnboardingPage() {
  const navigate = useNavigate();
  return <OnboardingWizard onComplete={() => navigate("/invoices")} />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="onboarding" element={<OnboardingPage />} />
      <Route element={<DashboardLayout />}>
        <Route index element={<Navigate to="/invoices" replace />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="settlements" element={<SettlementsPage />} />
        <Route path="settlements/:id" element={<SettlementDetailPage />} />
        <Route path="on-hold" element={<OnHoldPage />} />
        <Route path="treasury" element={<TreasuryPage />} />
        <Route path="disputes" element={<DisputesPage />} />
        <Route path="signers" element={<SignersPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="abi" element={<ErrorBoundary fallbackTitle="Failed to load ABI explorer"><ABIExplorer /></ErrorBoundary>} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppRoutes />
    </ThemeProvider>
  );
}
