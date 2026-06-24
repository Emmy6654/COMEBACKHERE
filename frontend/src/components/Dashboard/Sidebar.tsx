import { NavLink } from "react-router-dom";
import "./Sidebar.css";

const links = [
  { to: "/invoices", label: "Invoices", icon: "receipt" },
  { to: "/settlements", label: "Settlements", icon: "account_balance" },
  { to: "/disputes", label: "Disputes", icon: "gavel" },
  { to: "/settings", label: "Settings", icon: "settings" },
];

const iconMap: Record<string, string> = {
  receipt: "\u{1F4CB}",
  account_balance: "\u{1F3E6}",
  gavel: "\u{2696}\u{FE0F}",
  settings: "\u{2699}\u{FE0F}",
};

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1 className="sidebar-logo">COMEBACKHERE</h1>
        <p className="sidebar-subtitle">Merchant Dashboard</p>
      </div>
      <nav className="sidebar-nav">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              `sidebar-link${isActive ? " sidebar-link--active" : ""}`
            }
          >
            <span className="sidebar-link-icon">{iconMap[link.icon]}</span>
            <span className="sidebar-link-label">{link.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-footer">
        <p className="sidebar-version">v1.0.0</p>
      </div>
    </aside>
  );
}
