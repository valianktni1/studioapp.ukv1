import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Check } from "lucide-react";
import AdminShell from "@/components/AdminShell";
import LogoUpload from "@/components/LogoUpload";
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
  const [sizes, setSizes] = useState([]);
  const [orders, setOrders] = useState([]);
  const [currency, setCurrency] = useState("GBP");

  useEffect(() => {
    if (tab !== "prints") return;
    tenantApi.get("/admin/print-sizes").then(({ data }) => { setSizes(data.sizes || []); setCurrency(data.currency || "GBP"); }).catch(() => {});
    tenantApi.get("/admin/orders").then(({ data }) => setOrders(data || [])).catch(() => {});
  }, [tab]);

  const saveSizes = async () => {
    try { const { data } = await tenantApi.put("/admin/print-sizes", { sizes }); setSizes(data.sizes); toast.success("Print sizes saved"); }
    catch (err) { toast.error(apiError(err)); }
  };
  const setOrderStatus = async (o, status) => {
    try { await tenantApi.put(`/admin/orders/${o.id}/status`, { status }); setOrders((p) => p.map((x) => x.id === o.id ? { ...x, status } : x)); }
    catch (err) { toast.error(apiError(err)); }
  };

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

  const [smtpBusy, setSmtpBusy] = useState(false);
  const [smtpHasPw, setSmtpHasPw] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [tpl, setTpl] = useState({ id: "", name: "", subject: "", body: "" });
  const loadTemplates = () => tenantApi.get("/admin/email-templates").then(({ data }) => setTemplates(data || [])).catch(() => {});
  useEffect(() => { if (tab === "email") loadTemplates(); }, [tab]);
  const saveTpl = async (e) => {
    e.preventDefault();
    try {
      if (tpl.id) await tenantApi.put(`/admin/email-templates/${tpl.id}`, tpl);
      else await tenantApi.post("/admin/email-templates", tpl);
      toast.success("Template saved"); setTpl({ id: "", name: "", subject: "", body: "" }); loadTemplates();
    } catch (err) { toast.error(apiError(err)); }
  };
  const delTpl = async (t) => { try { await tenantApi.delete(`/admin/email-templates/${t.id}`); loadTemplates(); if (tpl.id === t.id) setTpl({ id: "", name: "", subject: "", body: "" }); } catch (err) { toast.error(apiError(err)); } };
  useEffect(() => {
    tenantApi.get("/admin/settings/smtp").then(({ data }) => {
      setSmtp({ smtp_host: data.smtp_host || "", smtp_port: data.smtp_port || 587, smtp_email: data.smtp_email || "", sender_name: data.sender_name || "", smtp_password: "" });
      setSmtpHasPw(!!data.has_password);
    }).catch(() => {});
  }, []);

  const saveSmtp = async (e) => {
    e.preventDefault();
    setSmtpBusy(true);
    try { await tenantApi.post("/admin/settings/smtp", smtp); toast.success("Email settings saved"); if (smtp.smtp_password) setSmtpHasPw(true); setSmtp({ ...smtp, smtp_password: "" }); }
    catch (err) { toast.error(apiError(err)); }
    finally { setSmtpBusy(false); }
  };

  const testSmtp = async () => {
    if (!testTo) return toast.error("Enter a recipient email to test");
    setSmtpBusy(true);
    try { await tenantApi.post("/admin/settings/smtp/test", { to: testTo }); toast.success(`Test email sent to ${testTo}`); }
    catch (err) { toast.error(apiError(err)); }
    finally { setSmtpBusy(false); }
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

  const tabs = [["branding", "Branding"], ["billing", "Billing"], ["prints", "Prints & Orders"], ["password", "Password"], ["email", "Email (SMTP)"], ["twofa", "2FA"]];

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
          <div><label className="sa-label block mb-2">Logo</label><LogoUpload value={brand.logo_url} onUploaded={(url) => { setBrand({ ...brand, logo_url: url }); refresh(); }} /></div>
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

      {tab === "email" && (
        <>
        <form onSubmit={saveSmtp} className="sa-card p-8 max-w-xl space-y-5" data-testid="smtp-form">
          <div>
            <h3 className="font-display text-2xl mb-1">Email (SMTP)</h3>
            <p className="text-sm" style={{ color: "var(--sa-muted)" }}>Send branded "gallery ready" emails to your clients from your own address.</p>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2"><label className="sa-label block mb-2">SMTP host</label><input className="sa-input" value={smtp.smtp_host} onChange={(e) => setSmtp({ ...smtp, smtp_host: e.target.value })} placeholder="smtp.hostinger.com" data-testid="smtp-host" /></div>
            <div><label className="sa-label block mb-2">Port</label><input type="number" className="sa-input" value={smtp.smtp_port} onChange={(e) => setSmtp({ ...smtp, smtp_port: e.target.value })} placeholder="465" data-testid="smtp-port" /></div>
          </div>
          <div><label className="sa-label block mb-2">From email</label><input className="sa-input" value={smtp.smtp_email} onChange={(e) => setSmtp({ ...smtp, smtp_email: e.target.value })} placeholder="hello@yourstudio.com" data-testid="smtp-email" /></div>
          <div><label className="sa-label block mb-2">Sender name</label><input className="sa-input" value={smtp.sender_name} onChange={(e) => setSmtp({ ...smtp, sender_name: e.target.value })} placeholder={tenant?.business_name || "Your Studio"} data-testid="smtp-sender" /></div>
          <div><label className="sa-label block mb-2">Password{smtpHasPw ? " (saved — leave blank to keep)" : ""}</label><input type="password" className="sa-input" value={smtp.smtp_password} onChange={(e) => setSmtp({ ...smtp, smtp_password: e.target.value })} placeholder={smtpHasPw ? "••••••••" : "SMTP password"} data-testid="smtp-password" /></div>
          <div className="flex gap-3">
            <button type="submit" className="sa-btn" disabled={smtpBusy} data-testid="smtp-save">{smtpBusy ? "Saving…" : "Save email settings"}</button>
          </div>
          <div className="pt-4" style={{ borderTop: "1px solid var(--sa-border)" }}>
            <label className="sa-label block mb-2">Send a test email</label>
            <div className="flex gap-3">
              <input className="sa-input flex-1" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" data-testid="smtp-test-to" />
              <button type="button" className="sa-btn-ghost" disabled={smtpBusy} onClick={testSmtp} data-testid="smtp-test-btn">Send test</button>
            </div>
          </div>
        </form>

        <div className="sa-card p-8 max-w-2xl mt-8" data-testid="templates-card">
          <h3 className="font-display text-2xl mb-1">Email Templates</h3>
          <p className="text-sm mb-5" style={{ color: "var(--sa-muted)" }}>Reusable messages. Use <code>{"{couple_name}"}</code>, <code>{"{gallery_link}"}</code> and <code>{"{password}"}</code> — they're filled in automatically when you send from a gallery.</p>
          {templates.length > 0 && (
            <div className="space-y-2 mb-6">
              {templates.map((t) => (
                <div key={t.id} className="flex items-center justify-between p-3 rounded" style={{ border: "1px solid var(--sa-border)" }} data-testid={`tpl-${t.id}`}>
                  <div><div className="font-medium">{t.name}</div><div className="text-xs" style={{ color: "var(--sa-muted)" }}>{t.subject}</div></div>
                  <div className="flex gap-2">
                    <button className="sa-btn-ghost !py-1 !px-3 !text-xs" onClick={() => setTpl(t)} data-testid={`tpl-edit-${t.id}`}>Edit</button>
                    <button className="sa-btn-ghost !py-1 !px-3 !text-xs" style={{ color: "#f87171" }} onClick={() => delTpl(t)} data-testid={`tpl-del-${t.id}`}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <form onSubmit={saveTpl} className="space-y-3">
            <input className="sa-input" placeholder="Template name" value={tpl.name} onChange={(e) => setTpl({ ...tpl, name: e.target.value })} required data-testid="tpl-name" />
            <input className="sa-input" placeholder="Subject (e.g. Your photos are ready, {couple_name}!)" value={tpl.subject} onChange={(e) => setTpl({ ...tpl, subject: e.target.value })} data-testid="tpl-subject" />
            <textarea className="sa-input" rows={5} placeholder="Message body… use {gallery_link} and {password}" value={tpl.body} onChange={(e) => setTpl({ ...tpl, body: e.target.value })} data-testid="tpl-body" />
            <div className="flex gap-3">
              <button className="sa-btn" data-testid="tpl-save">{tpl.id ? "Update template" : "Add template"}</button>
              {tpl.id && <button type="button" className="sa-btn-ghost" onClick={() => setTpl({ id: "", name: "", subject: "", body: "" })}>Cancel</button>}
            </div>
          </form>
        </div>
        </>
      )}

      {tab === "twofa" && (
        <div className="sa-card p-8 max-w-xl" style={{ color: "var(--sa-muted)" }}>
          <p>TOTP two-factor authentication is coming in the next release.</p>
        </div>
      )}

      {tab === "prints" && (
        <div className="space-y-8">
          <div className="sa-card p-8 max-w-2xl" data-testid="print-sizes-card">
            <h3 className="font-display text-2xl mb-1">Print Sizes</h3>
            <p className="text-sm mb-5" style={{ color: "var(--sa-muted)" }}>Offer prints to your clients. Prices in {currency}. Payments are collected via PayPal (configured by the platform).</p>
            <div className="space-y-3">
              {sizes.map((s, i) => (
                <div key={s.id || i} className="grid grid-cols-12 gap-2 items-center" data-testid={`size-row-${i}`}>
                  <input className="sa-input col-span-4" placeholder="Label (e.g. 8x10)" value={s.label} onChange={(e) => setSizes((p) => p.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} data-testid={`size-label-${i}`} />
                  <input className="sa-input col-span-4" placeholder="Dimensions (e.g. 8in x 10in)" value={s.dimensions} onChange={(e) => setSizes((p) => p.map((x, j) => j === i ? { ...x, dimensions: e.target.value } : x))} data-testid={`size-dim-${i}`} />
                  <input type="number" step="0.01" className="sa-input col-span-3" placeholder="Price" value={s.price} onChange={(e) => setSizes((p) => p.map((x, j) => j === i ? { ...x, price: e.target.value } : x))} data-testid={`size-price-${i}`} />
                  <button className="col-span-1 text-center" onClick={() => setSizes((p) => p.filter((_, j) => j !== i))} data-testid={`size-remove-${i}`} style={{ color: "#f87171" }}>✕</button>
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-5">
              <button className="sa-btn-ghost" onClick={() => setSizes((p) => [...p, { id: "", label: "", dimensions: "", price: 0 }])} data-testid="add-size">+ Add size</button>
              <button className="sa-btn" onClick={saveSizes} data-testid="save-sizes">Save sizes</button>
            </div>
          </div>

          <div className="sa-card p-8" data-testid="orders-card">
            <h3 className="font-display text-2xl mb-4">Print Orders</h3>
            {orders.length === 0 ? <p className="text-sm" style={{ color: "var(--sa-muted)" }}>No orders yet.</p> : (
              <div className="space-y-3">
                {orders.map((o) => (
                  <div key={o.id} className="flex flex-wrap items-center justify-between gap-3 p-3 rounded" style={{ border: "1px solid var(--sa-border)" }} data-testid={`order-${o.id}`}>
                    <div>
                      <div className="font-medium">{o.customer?.name || "—"} · {o.customer?.email}</div>
                      <div className="text-xs" style={{ color: "var(--sa-muted)" }}>{o.items?.reduce((a, i) => a + i.qty, 0)} prints · {o.currency} {o.total?.toFixed(2)} · {new Date(o.created_at).toLocaleDateString()}</div>
                    </div>
                    <select className="sa-input !w-auto" value={o.status} onChange={(e) => setOrderStatus(o, e.target.value)} data-testid={`order-status-${o.id}`}>
                      {["pending", "paid", "awaiting_contact", "printing", "shipped", "completed", "cancelled", "failed"].map((st) => <option key={st} value={st}>{st}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </AdminShell>
  );
}
