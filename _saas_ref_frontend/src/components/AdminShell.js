import React from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { LayoutGrid, Settings, LogOut, Activity } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import Footer from "@/components/Footer";
import ThemeToggle from "@/components/ThemeToggle";

export default function AdminShell({ children }) {
  const { tenant, admin, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const accent = tenant?.accent_color || "var(--sa-gold)";

  const link = (to, label, Icon) => {
    const active = loc.pathname === to;
    return (
      <Link to={to} className="flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors"
        style={{ color: active ? accent : "var(--sa-muted)", background: active ? "rgba(255,255,255,0.04)" : "transparent" }}
        data-testid={`nav-${label.toLowerCase()}`}>
        <Icon size={16} /> {label}
      </Link>
    );
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--sa-bg)" }}>
      <header className="sticky top-0 z-40 border-b" style={{ borderColor: "var(--sa-border)", background: "var(--sa-header-bg)", backdropFilter: "blur(16px)" }}>
        <div className="max-w-7xl mx-auto px-6 sm:px-10 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {tenant?.logo_url
              ? <img src={tenant.logo_url} alt="logo" className="h-8 object-contain" />
              : <span className="font-display text-xl font-semibold" style={{ color: accent }}>{tenant?.business_name || "Studio"}</span>}
            <nav className="hidden sm:flex items-center gap-1">
              {link("/admin", "Galleries", LayoutGrid)}
              {link("/admin/settings", "Settings", Settings)}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {admin?.impersonated && <span className="text-xs px-2 py-1 rounded" style={{ background: "rgba(212,175,55,0.15)", color: accent }}>Impersonating</span>}
            <ThemeToggle />
            <button className="sa-btn-ghost !py-2" onClick={() => { logout(); nav("/login"); }} data-testid="admin-logout"><LogOut size={15} /> Sign out</button>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-7xl mx-auto px-6 sm:px-10 py-8 w-full">{children}</main>
      <Footer />
    </div>
  );
}
