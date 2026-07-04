import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { LogOut, Plus, Ban, Play, Trash2, UserCog, Users, DollarSign, HardDrive, Infinity, CalendarPlus } from "lucide-react";
import { superApi, SUPER_TOKEN_KEY, TENANT_TOKEN_KEY, formatBytes, apiError } from "@/lib/api";
import Footer from "@/components/Footer";
import ThemeToggle from "@/components/ThemeToggle";
import useTitle from "@/lib/useTitle";

function StatCard({ icon: Icon, label, value, tint }) {
  return (
    <div className="sa-card p-6" data-testid={`super-stat-${label.toLowerCase().replace(/\s/g, "-")}`}>
      <div className="flex items-center justify-between">
        <span className="sa-label">{label}</span>
        <Icon size={18} style={{ color: tint }} />
      </div>
      <div className="font-display text-4xl mt-3">{value}</div>
    </div>
  );
}

export default function SuperAdminDashboard() {
  useTitle("Super Admin Console");
  const nav = useNavigate();
  const [tenants, setTenants] = useState([]);
  const [overview, setOverview] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ business_name: "", email: "", password: "", plan: "starter" });
  const [showPaypal, setShowPaypal] = useState(false);
  const [paypal, setPaypal] = useState({ client_id: "", secret: "", mode: "sandbox", currency: "GBP", configured: false });

  const loadPaypal = () => superApi.get("/super-admin/paypal").then(({ data }) => setPaypal({ ...data, secret: "" })).catch(() => {});
  const savePaypal = async (e) => {
    e.preventDefault();
    try { await superApi.put("/super-admin/paypal", paypal); toast.success("PayPal settings saved"); setShowPaypal(false); loadPaypal(); }
    catch (err) { toast.error(apiError(err)); }
  };

  const load = async () => {
    try {
      const [t, o] = await Promise.all([superApi.get("/super-admin/tenants"), superApi.get("/super-admin/overview")]);
      setTenants(t.data);
      setOverview(o.data);
    } catch (err) {
      if (err?.response?.status === 401 || err?.response?.status === 403) nav("/super-admin");
      else toast.error(apiError(err));
    }
  };

  useEffect(() => {
    if (!localStorage.getItem(SUPER_TOKEN_KEY)) { nav("/super-admin"); return; }
    load();
    loadPaypal();
  }, []);

  const createTenant = async (e) => {
    e.preventDefault();
    try {
      await superApi.post("/super-admin/tenants", form);
      toast.success("Studio created");
      setShowCreate(false);
      setForm({ business_name: "", email: "", password: "", plan: "starter" });
      load();
    } catch (err) { toast.error(apiError(err)); }
  };

  const toggleSuspend = async (t) => {
    try {
      await superApi.put(`/super-admin/tenants/${t.id}/${t.suspended ? "unsuspend" : "suspend"}`);
      toast.success(t.suspended ? "Reactivated" : "Suspended");
      load();
    } catch (err) { toast.error(apiError(err)); }
  };

  const del = async (t) => {
    if (!window.confirm(`Delete ${t.business_name}? This removes ALL galleries, files and backups permanently.`)) return;
    try { await superApi.delete(`/super-admin/tenants/${t.id}`); toast.success("Deleted"); load(); }
    catch (err) { toast.error(apiError(err)); }
  };

  const impersonate = async (t) => {
    try {
      const { data } = await superApi.post(`/super-admin/tenants/${t.id}/impersonate`);
      localStorage.setItem(TENANT_TOKEN_KEY, data.token);
      toast.success(`Impersonating ${t.business_name}`);
      window.location.href = "/admin";
    } catch (err) { toast.error(apiError(err)); }
  };

  const extendTrial = async (t, days) => {
    try { await superApi.put(`/super-admin/tenants/${t.id}/trial`, { days }); toast.success(`Trial extended by ${days} days`); load(); }
    catch (err) { toast.error(apiError(err)); }
  };

  const compTenant = async (t) => {
    try { await superApi.put(`/super-admin/tenants/${t.id}/trial`, { unlimited: true }); toast.success(`${t.business_name} set to unlimited (comp)`); load(); }
    catch (err) { toast.error(apiError(err)); }
  };

  const logout = () => { localStorage.removeItem(SUPER_TOKEN_KEY); nav("/super-admin"); };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--sa-bg)" }}>
      <header className="border-b" style={{ borderColor: "var(--sa-border)" }}>
        <div className="max-w-7xl mx-auto px-6 sm:px-10 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-display text-2xl font-bold" style={{ color: "var(--sa-gold)" }}>StudioApp</span>
            <span className="sa-label">Super Admin Console</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button className="sa-btn-ghost" onClick={() => setShowPaypal(true)} data-testid="paypal-settings-btn"><DollarSign size={16} /> Payments{paypal.configured ? " ✓" : ""}</button>
            <button className="sa-btn-ghost" onClick={logout} data-testid="super-logout"><LogOut size={16} /> Sign out</button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-6 sm:px-10 py-10 w-full">
        {overview && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-10">
            <StatCard icon={Users} label="Studios" value={overview.tenant_count} tint="#D4AF37" />
            <StatCard icon={Play} label="Active" value={overview.active_count} tint="#4ade80" />
            <StatCard icon={DollarSign} label="MRR" value={`£${overview.mrr}`} tint="#60a5fa" />
            <StatCard icon={HardDrive} label="Galleries" value={overview.total_galleries} tint="#a78bfa" />
          </div>
        )}

        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-3xl">Studios</h2>
          <button className="sa-btn" onClick={() => setShowCreate(true)} data-testid="create-tenant-btn"><Plus size={18} /> New Studio</button>
        </div>

        <div className="sa-card overflow-hidden">
          <table className="w-full text-sm" data-testid="tenants-table">
            <thead>
              <tr className="text-left" style={{ color: "var(--sa-muted)", borderBottom: "1px solid var(--sa-border)" }}>
                <th className="p-4 font-medium">Studio</th>
                <th className="p-4 font-medium">Plan</th>
                <th className="p-4 font-medium">Galleries</th>
                <th className="p-4 font-medium">Subdomain</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id} style={{ borderBottom: "1px solid var(--sa-border)" }} data-testid={`tenant-row-${t.id}`}>
                  <td className="p-4">
                    <div className="font-semibold">{t.business_name}</div>
                    <div style={{ color: "var(--sa-muted)" }} className="text-xs">{t.email}</div>
                  </td>
                  <td className="p-4">{t.plan_label}</td>
                  <td className="p-4">{t.gallery_count} / {t.gallery_limit}</td>
                  <td className="p-4"><span style={{ color: "var(--sa-muted)" }}>{t.subdomain}.studio-app.uk</span></td>
                  <td className="p-4">
                    {t.suspended ? (
                      <span className="px-2 py-1 rounded text-xs" style={{ background: "rgba(248,113,113,0.15)", color: "#f87171" }}>Suspended</span>
                    ) : t.subscription_status === "comp" ? (
                      <span className="px-2 py-1 rounded text-xs" style={{ background: "rgba(96,165,250,0.15)", color: "#60a5fa" }}>Comp · Unlimited</span>
                    ) : t.subscription_status === "active" ? (
                      <span className="px-2 py-1 rounded text-xs" style={{ background: "rgba(74,222,128,0.15)", color: "#4ade80" }}>Active</span>
                    ) : t.trial_expired ? (
                      <span className="px-2 py-1 rounded text-xs" style={{ background: "rgba(248,113,113,0.15)", color: "#f87171" }}>Trial ended</span>
                    ) : (
                      <span className="px-2 py-1 rounded text-xs" style={{ background: "rgba(212,175,55,0.15)", color: "var(--sa-gold)" }}>Trial · {t.trial_days_left}d</span>
                    )}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center justify-end gap-2">
                      <button title="Extend trial +7 days" className="sa-btn-ghost !p-2" onClick={() => extendTrial(t, 7)} data-testid={`extend-${t.id}`}><CalendarPlus size={15} /></button>
                      <button title="Comp — unlimited free access" className="sa-btn-ghost !p-2" onClick={() => compTenant(t)} data-testid={`comp-${t.id}`}><Infinity size={15} color="#60a5fa" /></button>
                      <button title="Impersonate" className="sa-btn-ghost !p-2" onClick={() => impersonate(t)} data-testid={`impersonate-${t.id}`}><UserCog size={15} /></button>
                      <button title={t.suspended ? "Unsuspend" : "Suspend"} className="sa-btn-ghost !p-2" onClick={() => toggleSuspend(t)} data-testid={`suspend-${t.id}`}>{t.suspended ? <Play size={15} /> : <Ban size={15} />}</button>
                      <button title="Delete" className="sa-btn-ghost !p-2" onClick={() => del(t)} data-testid={`delete-${t.id}`}><Trash2 size={15} color="#f87171" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {tenants.length === 0 && <tr><td colSpan={6} className="p-8 text-center" style={{ color: "var(--sa-muted)" }}>No studios yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </main>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }} onClick={() => setShowCreate(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={createTenant} className="sa-card p-8 w-full max-w-md space-y-4" data-testid="create-tenant-modal">
            <h3 className="font-display text-2xl">New Studio</h3>
            <div><label className="sa-label block mb-2">Business name</label><input className="sa-input" value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} required data-testid="ct-name" /></div>
            <div><label className="sa-label block mb-2">Admin email</label><input className="sa-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required data-testid="ct-email" /></div>
            <div><label className="sa-label block mb-2">Temp password</label><input className="sa-input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required data-testid="ct-password" /></div>
            <div><label className="sa-label block mb-2">Plan</label>
              <select className="sa-input" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} data-testid="ct-plan">
                <option value="starter">Starter — 10 galleries</option>
                <option value="professional">Professional — 30 galleries</option>
                <option value="studio">Studio — 60 galleries</option>
              </select>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" className="sa-btn-ghost flex-1" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="sa-btn flex-1" data-testid="ct-submit">Create</button>
            </div>
          </form>
        </div>
      )}

      {showPaypal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }} onClick={() => setShowPaypal(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={savePaypal} className="sa-card p-8 w-full max-w-md space-y-4" data-testid="paypal-modal">
            <h3 className="font-display text-2xl">PayPal — Print Payments</h3>
            <p className="text-sm" style={{ color: "var(--sa-muted)" }}>Collect print-order payments platform-wide. Get keys at developer.paypal.com.</p>
            <div><label className="sa-label block mb-2">Client ID</label><input className="sa-input" value={paypal.client_id} onChange={(e) => setPaypal({ ...paypal, client_id: e.target.value })} data-testid="pp-client-id" /></div>
            <div><label className="sa-label block mb-2">Secret{paypal.configured ? " (saved — leave blank to keep)" : ""}</label><input type="password" className="sa-input" value={paypal.secret} onChange={(e) => setPaypal({ ...paypal, secret: e.target.value })} placeholder={paypal.configured ? "••••••••" : ""} data-testid="pp-secret" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="sa-label block mb-2">Mode</label>
                <select className="sa-input" value={paypal.mode} onChange={(e) => setPaypal({ ...paypal, mode: e.target.value })} data-testid="pp-mode">
                  <option value="sandbox">Sandbox</option><option value="live">Live</option>
                </select>
              </div>
              <div><label className="sa-label block mb-2">Currency</label><input className="sa-input" value={paypal.currency} onChange={(e) => setPaypal({ ...paypal, currency: e.target.value })} data-testid="pp-currency" /></div>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" className="sa-btn-ghost flex-1" onClick={() => setShowPaypal(false)}>Cancel</button>
              <button className="sa-btn flex-1" data-testid="pp-save">Save</button>
            </div>
          </form>
        </div>
      )}

      <Footer />
    </div>
  );
}
