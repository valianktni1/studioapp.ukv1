import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Check } from "lucide-react";
import AdminShell from "@/components/AdminShell";
import { tenantApi, apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import useTitle from "@/lib/useTitle";

export default function AdminSettings() {
  const { tenant, refresh } = useAuth();
  useTitle("Settings");
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState(params.get("tab") || "branding");
  const [brand, setBrand] = useState({ business_name: "", contact_email: "", phone: "", website: "", logo_url: "", accent_color: "#D4AF37", secondary_color: "#0A0A0B" });
  const [pw, setPw] = useState({ current_password: "", new_password: "" });
  const [smtp, setSmtp] = useState({ smtp_host: "", smtp_port: 587, smtp_email: "", sender_name: "", smtp_password: "" });
  const [testTo, setTestTo] = useState("");
  const [plans, setPlans] = useState({});
  const [billingBusy, setBillingBusy] = useState("");

  useEffect(() => {
    if (tenant) setBrand({
      business_name: tenant.business_name || "", phone: tenant.phone || "", website: tenant.website || "",
      logo_url: tenant.logo_url || "", accent_color: tenant.accent_color || "#D4AF37", secondary_color: tenant.secondary_color || "#0A0A0B",
    });
  }, [tenant]);

  const saveBrand = async (e) => {
    e.preventDefault();
    try { await tenantApi.put("/admin/branding", brand); await refresh(); toast.success("Branding saved"); }
    catch (err) { toast.error(apiError(err)); }
  };
  const savePw = async (e) => {
    e.preventDefault();
    try { await tenantApi.put("/admin/change-password", pw); toast.success("Password updated"); setPw({ current_password: "", new_password: "" }); }
    catch (err) { toast.error(apiError(err)); }
  };

  // Billing: load plans + poll after Stripe redirect
  useEffect(() => { tenantApi.get("/billing/plans").then(({ data }) => setPlans(data)).catch(() => {}); }, []);

  useEffect(() => {
    const sid = params.get("session_id");
    if (!sid) return;
    let n = 0;
    const poll = async () => {
      try {
        const { data } = await tenantApi.get(`/billing/status/${sid}`);
        if (data.payment_status === "paid") { toast.success("Payment successful — plan upgraded!"); await refresh(); params.delete("session_id"); setParams(params, { replace: true }); return; }
        if (data.status === "expired") { toast.error("Payment expired"); params.delete("session_id"); setParams(params, { replace: true }); return; }
      } catch {}
      if (n++ < 6) setTimeout(poll, 2000);
    };
    toast.info("Confirming payment…");
    poll();
  }, []); // eslint-disable-line

  const subscribe = async (planKey) => {
    setBillingBusy(planKey);
    try {
      const { data } = await tenantApi.post("/billing/checkout", { plan: planKey, origin_url: window.location.origin });
      window.location.href = data.url;
    } catch (err) { toast.error(apiError(err)); setBillingBusy(""); }
  };

  const tabs = [["branding", "Branding"], ["billing", "Billing"], ["password", "Password"], ["email", "Email (SMTP)"], ["twofa", "2FA"]];

  return (
    <AdminShell>
      <h1 className="font-display text-4xl mb-6">Settings</h1>
      <div className="flex flex-wrap gap-2 mb-6">
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className="px-4 py-2 rounded text-sm"
            style={{ background: tab === k ? "var(--sa-gold)" : "var(--sa-surface)", color: tab === k ? "#0A0A0B" : "var(--sa-text)", border: "1px solid var(--sa-border)" }}
            data-testid={`settings-tab-${k}`}>{l}</button>
        ))}
      </div>

      {tab === "branding" && (
        <form onSubmit={saveBrand} className="sa-card p-8 max-w-xl space-y-5" data-testid="branding-form">
          <div><label className="sa-label block mb-2">Business name</label><input className="sa-input" value={brand.business_name} onChange={(e) => setBrand({ ...brand, business_name: e.target.value })} data-testid="br-name" /></div>
          <div><label className="sa-label block mb-2">Logo URL</label><input className="sa-input" value={brand.logo_url} onChange={(e) => setBrand({ ...brand, logo_url: e.target.value })} data-testid="br-logo" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="sa-label block mb-2">Phone</label><input className="sa-input" value={brand.phone} onChange={(e) => setBrand({ ...brand, phone: e.target.value })} /></div>
            <div><label className="sa-label block mb-2">Website</label><input className="sa-input" value={brand.website} onChange={(e) => setBrand({ ...brand, website: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="sa-label block mb-2">Accent colour</label><input type="color" className="sa-input h-12 p-1" value={brand.accent_color} onChange={(e) => setBrand({ ...brand, accent_color: e.target.value })} data-testid="br-accent" /></div>
            <div><label className="sa-label block mb-2">Background</label><input type="color" className="sa-input h-12 p-1" value={brand.secondary_color} onChange={(e) => setBrand({ ...brand, secondary_color: e.target.value })} /></div>
          </div>
          <button className="sa-btn" data-testid="br-save">Save branding</button>
        </form>
      )}

      {tab === "billing" && (
        <div className="max-w-3xl" data-testid="billing-panel">
          <div className="sa-card p-5 mb-6 flex items-center justify-between">
            <div>
              <span className="sa-label">Current plan</span>
              <div className="font-display text-3xl">{tenant?.plan_label} &middot; £{tenant?.price}/mo</div>
              <p className="text-sm" style={{ color: "var(--sa-muted)" }}>{tenant?.gallery_limit} galleries included</p>
            </div>
            <div className="text-right">
              <span className="sa-label">Your subdomain</span>
              <div className="font-medium" style={{ color: "var(--sa-gold)" }}>{tenant?.subdomain}.studio-app.uk</div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.entries(plans).map(([key, p]) => {
              const current = tenant?.plan === key;
              return (
                <div key={key} className="sa-card p-6 flex flex-col" style={current ? { borderColor: "var(--sa-gold)" } : {}} data-testid={`billing-plan-${key}`}>
                  <h3 className="font-display text-2xl">{p.label}</h3>
                  <div className="my-3"><span className="text-3xl font-bold">£{p.price}</span><span style={{ color: "var(--sa-muted)" }}>/mo</span></div>
                  <p className="mb-5 text-sm" style={{ color: "var(--sa-muted)" }}>{p.gallery_limit} galleries</p>
                  {current
                    ? <span className="sa-btn-ghost mt-auto justify-center" style={{ color: "var(--sa-gold)" }}><Check size={16} /> Current plan</span>
                    : <button className="sa-btn mt-auto" disabled={billingBusy === key} onClick={() => subscribe(key)} data-testid={`subscribe-${key}`}>{billingBusy === key ? "Redirecting…" : `Switch to ${p.label}`}</button>}
                </div>
              );
            })}
          </div>
          <p className="text-xs mt-4" style={{ color: "var(--sa-muted)" }}>Secure card payments via Stripe. PayPal coming soon.</p>
        </div>
      )}

      {tab === "password" && (
        <form onSubmit={savePw} className="sa-card p-8 max-w-md space-y-5" data-testid="password-form">
          <div><label className="sa-label block mb-2">Current password</label><input type="password" className="sa-input" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} required data-testid="pw-current" /></div>
          <div><label className="sa-label block mb-2">New password</label><input type="password" className="sa-input" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} required data-testid="pw-new" /></div>
          <button className="sa-btn" data-testid="pw-save">Update password</button>
        </form>
      )}

      {(tab === "email" || tab === "twofa") && (
        <div className="sa-card p-8 max-w-xl" style={{ color: "var(--sa-muted)" }}>
          <p>{tab === "email" ? "Per-studio SMTP configuration" : "TOTP two-factor authentication"} is coming in the next release.</p>
        </div>
      )}
    </AdminShell>
  );
}
