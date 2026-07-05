import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Building2, Plus, Trash2, Power, LogOut, Users, Layers, LayoutDashboard,
  CreditCard, Mail, Send, TrendingUp, Clock, CheckCircle2, Loader2,
  Infinity as InfinityIcon, FileText, Pencil, X, CalendarPlus, HardDrive, Wifi,
  ArrowUpCircle, ArrowDownCircle
} from "lucide-react";
import {
  superLogin, superListTenants, superCreateTenant, superSetStatus, superSetPlan, superDeleteTenant, getErrorMessage,
  superOverview, superPayments, superGetEmail, superSaveEmail, superTestEmail, superBroadcastRecipients, superBroadcast,
  superExtendTrial, superEmailTenant, superListTemplates, superCreateTemplate, superUpdateTemplate, superDeleteTemplate,
  superStorage, superBandwidth,
} from "@/lib/api";

const FOREVER_DATE = "9999-12-31T23:59:59+00:00";
const isForever = (t) => t.trial_forever || t.trial_ends_at === FOREVER_DATE;

const PLAN_LABELS = { starter: "Starter · 10 · £15", pro: "Professional · 30 · £35", studio: "Studio · 60 · £65" };
const gbp = (n) => "£" + Number(n || 0).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtDate = (s) => { try { return new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); } catch { return "—"; } };

export default function SuperAdmin() {
  const [authed, setAuthed] = useState(!!localStorage.getItem("super_token"));
  const [creds, setCreds] = useState({ username: "", password: "" });
  const [tab, setTab] = useState("overview");
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ business_name: "", username: "", password: "", plan: "starter" });
  const [extendFor, setExtendFor] = useState(null);
  const [emailFor, setEmailFor] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await superListTenants(); setTenants(data); }
    catch (e) { toast.error(getErrorMessage(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (authed) load(); }, [authed, load]);

  const doLogin = async (e) => {
    e.preventDefault();
    try {
      const { data } = await superLogin(creds);
      localStorage.setItem("super_token", data.token);
      setAuthed(true);
      toast.success("Welcome back");
    } catch (err) { toast.error(getErrorMessage(err, "Invalid credentials")); }
  };

  const create = async () => {
    if (!form.business_name || !form.username || !form.password) return toast.error("All fields required");
    try {
      await superCreateTenant(form);
      toast.success(`${form.business_name} created`);
      setShowCreate(false); setForm({ business_name: "", username: "", password: "", plan: "starter" });
      load();
    } catch (err) { toast.error(getErrorMessage(err)); }
  };

  const toggleStatus = async (t) => {
    const next = t.status === "suspended" ? "active" : "suspended";
    try { await superSetStatus(t.id, next); toast.success(`${t.business_name} ${next}`); load(); }
    catch (err) { toast.error(getErrorMessage(err)); }
  };

  const changePlan = async (t, plan) => {
    try { await superSetPlan(t.id, plan); toast.success("Plan updated"); load(); }
    catch (err) { toast.error(getErrorMessage(err)); }
  };

  const remove = async (t) => {
    if (!window.confirm(`Permanently delete ${t.business_name} and ALL its galleries? This cannot be undone.`)) return;
    try { await superDeleteTenant(t.id); toast.success("Tenant deleted"); load(); }
    catch (err) { toast.error(getErrorMessage(err)); }
  };

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ background: "#0B0B0F", color: "#F5F5F4" }}>
        <form onSubmit={doLogin} className="w-full max-w-sm" data-testid="super-login-form">
          <div className="mb-10 text-center">
            <img src="/studioapp-logo.png" alt="StudioApp" className="h-16 w-auto mx-auto rounded-lg" />
            <p className="text-sm mt-3" style={{ color: "#A1A1AA" }}>Platform Administration</p>
          </div>
          <Label className="text-xs tracking-wider" style={{ color: "#A1A1AA" }}>Username</Label>
          <Input data-testid="super-username" value={creds.username} onChange={(e) => setCreds({ ...creds, username: e.target.value })}
            className="mb-4 bg-transparent border-white/15 text-white" />
          <Label className="text-xs tracking-wider" style={{ color: "#A1A1AA" }}>Password</Label>
          <Input data-testid="super-password" type="password" value={creds.password} onChange={(e) => setCreds({ ...creds, password: e.target.value })}
            className="mb-8 bg-transparent border-white/15 text-white" />
          <Button data-testid="super-login-btn" type="submit" className="w-full rounded-sm uppercase tracking-widest text-xs font-bold"
            style={{ background: "#D4AF37", color: "#0B0B0F" }}>Sign In</Button>
        </form>
      </div>
    );
  }

  const TABS = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "photographers", label: "Photographers", icon: Users },
    { id: "usage", label: "Storage & Usage", icon: HardDrive },
    { id: "payments", label: "Payments", icon: CreditCard },
    { id: "email", label: "Broadcast Email", icon: Mail },
  ];

  return (
    <div className="min-h-screen" style={{ background: "#0B0B0F", color: "#F5F5F4" }}>
      <header className="border-b border-white/10 sticky top-0 z-30" style={{ background: "rgba(11,11,15,0.9)", backdropFilter: "blur(12px)" }}>
        <div className="max-w-screen-lg mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <img src="/studioapp-logo.png" alt="StudioApp" className="h-9 w-auto rounded" /> <span className="text-xs font-normal" style={{ color: "#71717A" }}>· Platform</span>
          </div>
          <div className="flex items-center gap-2">
            {tab === "photographers" && (
              <Button data-testid="super-new-tenant-btn" onClick={() => setShowCreate(true)} className="rounded-sm gap-2 text-xs uppercase tracking-wider font-bold" style={{ background: "#D4AF37", color: "#0B0B0F" }}>
                <Plus className="w-4 h-4" /> New Photographer
              </Button>
            )}
            <Button data-testid="super-logout-btn" variant="ghost" onClick={() => { localStorage.removeItem("super_token"); setAuthed(false); }} className="text-white/70">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="max-w-screen-lg mx-auto px-6 flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button key={t.id} data-testid={`super-tab-${t.id}`} onClick={() => setTab(t.id)}
              className="flex items-center gap-2 px-4 py-3 text-sm border-b-2 whitespace-nowrap transition-colors"
              style={{ borderColor: tab === t.id ? "#D4AF37" : "transparent", color: tab === t.id ? "#F5F5F4" : "#71717A" }}>
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-screen-lg mx-auto px-6 py-10">
        {tab === "overview" && <OverviewTab />}
        {tab === "usage" && <UsageTab />}
        {tab === "payments" && <PaymentsTab />}
        {tab === "email" && <EmailTab />}
        {tab === "photographers" && (
          <>
            <h2 className="text-sm uppercase tracking-widest mb-4" style={{ color: "#A1A1AA" }}>Photographers</h2>
            {loading ? <p className="text-white/50">Loading…</p> : (
              <div className="space-y-3" data-testid="tenant-list">
                {tenants.length === 0 && <p className="text-white/40 text-sm">No photographers yet. Create the first one.</p>}
                {tenants.map((t) => (
                  <div key={t.id} data-testid={`tenant-row-${t.id}`} className="rounded-lg border border-white/10 p-4 flex items-center justify-between gap-4" style={{ background: "rgba(255,255,255,0.02)" }}>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{t.business_name}</span>
                        <span className="text-xs px-2 py-0.5 rounded" style={{ background: t.status === "suspended" ? "rgba(248,113,113,0.15)" : "rgba(74,222,128,0.15)", color: t.status === "suspended" ? "#f87171" : "#4ade80" }}>
                          {t.status === "suspended" ? "suspended" : "active"}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded" style={{ background: "rgba(212,175,55,0.12)", color: "#D4AF37" }}>
                          {isForever(t) ? "lifetime" : (t.subscription_status || "trialing")}
                        </span>
                      </div>
                      <div className="text-xs mt-1" style={{ color: "#71717A" }}>
                        @{t.admin_username || "—"} · /s/{t.subdomain}/… · {t.gallery_count || 0} galleries
                        {isForever(t)
                          ? " · lifetime access"
                          : (t.trial_ends_at && (t.subscription_status || "trialing") === "trialing" ? ` · trial ends ${fmtDate(t.trial_ends_at)}` : "")}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Select value={t.plan || "starter"} onValueChange={(v) => changePlan(t, v)}>
                        <SelectTrigger data-testid={`tenant-plan-${t.id}`} className="w-[190px] h-9 bg-transparent border-white/15 text-white text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="starter">{PLAN_LABELS.starter}</SelectItem>
                          <SelectItem value="pro">{PLAN_LABELS.pro}</SelectItem>
                          <SelectItem value="studio">{PLAN_LABELS.studio}</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button data-testid={`tenant-extend-${t.id}`} variant="ghost" size="sm" onClick={() => setExtendFor(t)} className="text-white/70" title="Extend trial"><CalendarPlus className="w-4 h-4" /></Button>
                      <Button data-testid={`tenant-email-${t.id}`} variant="ghost" size="sm" onClick={() => setEmailFor(t)} className="text-white/70" title="Email photographer"><Mail className="w-4 h-4" /></Button>
                      <Button data-testid={`tenant-toggle-${t.id}`} variant="ghost" size="sm" onClick={() => toggleStatus(t)} className="text-white/70"><Power className="w-4 h-4" /></Button>
                      <Button data-testid={`tenant-delete-${t.id}`} variant="ghost" size="sm" onClick={() => remove(t)}><Trash2 className="w-4 h-4" style={{ color: "#f87171" }} /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent data-testid="create-tenant-dialog">
          <DialogHeader><DialogTitle>New Photographer</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Business name</Label><Input data-testid="ct-business" value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} placeholder="e.g. Rose Photography" /></div>
            <div><Label>Login username</Label><Input data-testid="ct-username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></div>
            <div><Label>Password</Label><Input data-testid="ct-password" type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
            <div><Label>Plan</Label>
              <Select value={form.plan} onValueChange={(v) => setForm({ ...form, plan: v })}>
                <SelectTrigger data-testid="ct-plan"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="starter">{PLAN_LABELS.starter}</SelectItem>
                  <SelectItem value="pro">{PLAN_LABELS.pro}</SelectItem>
                  <SelectItem value="studio">{PLAN_LABELS.studio}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button data-testid="ct-submit" onClick={create}>Create photographer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {extendFor && <ExtendTrialDialog tenant={extendFor} onClose={() => setExtendFor(null)} onDone={load} />}
      {emailFor && <TenantEmailDialog tenant={emailFor} onClose={() => setEmailFor(null)} />}
    </div>
  );
}

function Stat({ icon, label, value, accent }) {
  return (
    <div className="rounded-lg border border-white/10 p-5" style={{ background: "rgba(255,255,255,0.02)" }}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider" style={{ color: "#71717A" }}>{icon} {label}</div>
      <div className="text-3xl font-semibold mt-2" style={{ color: accent || "#F5F5F4" }}>{value}</div>
    </div>
  );
}

function OverviewTab() {
  const [d, setD] = useState(null);
  useEffect(() => { superOverview().then(r => setD(r.data)).catch(e => toast.error(getErrorMessage(e))); }, []);
  if (!d) return <p className="text-white/50" data-testid="overview-loading">Loading…</p>;
  return (
    <div data-testid="overview-tab">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Stat icon={<Users className="w-5 h-5" />} label="Photographers" value={d.total_tenants} />
        <Stat icon={<CheckCircle2 className="w-5 h-5" />} label="Subscribed" value={d.subscribed} accent="#4ade80" />
        <Stat icon={<Clock className="w-5 h-5" />} label="On trial" value={d.trialing} accent="#D4AF37" />
        <Stat icon={<Layers className="w-5 h-5" />} label="Galleries" value={d.total_galleries} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-10">
        <Stat icon={<TrendingUp className="w-5 h-5" />} label="MRR" value={gbp(d.mrr)} accent="#4ade80" />
        <Stat icon={<CreditCard className="w-5 h-5" />} label="Total revenue" value={gbp(d.total_revenue)} />
        <Stat icon={<Building2 className="w-5 h-5" />} label="Suspended" value={d.suspended} accent={d.suspended ? "#f87171" : undefined} />
      </div>
      <h2 className="text-sm uppercase tracking-widest mb-4" style={{ color: "#A1A1AA" }}>Trials ending in the next 7 days</h2>
      {(d.trials_ending_soon || []).length === 0 ? (
        <p className="text-white/40 text-sm">No trials ending soon.</p>
      ) : (
        <div className="space-y-2" data-testid="trials-ending-list">
          {(d.trials_ending_soon || []).map((t, i) => (
            <div key={i} className="rounded-lg border border-white/10 p-3 flex items-center justify-between" style={{ background: "rgba(255,255,255,0.02)" }}>
              <span className="font-medium">{t.business_name}</span>
              <span className="text-xs" style={{ color: "#D4AF37" }}>ends {fmtDate(t.trial_ends_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const fmtBytes = (b) => {
  const n = Number(b || 0);
  const gb = n / (1024 ** 3);
  if (gb >= 1024) return (gb / 1024).toFixed(2) + " TB";
  if (gb >= 1) return gb.toFixed(2) + " GB";
  const mb = n / (1024 ** 2);
  if (mb >= 1) return mb.toFixed(1) + " MB";
  if (n >= 1024) return (n / 1024).toFixed(0) + " KB";
  return n + " B";
};

function UsageTab() {
  const [storage, setStorage] = useState(null);
  const [bw, setBw] = useState(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    superBandwidth().then(r => setBw(r.data)).catch(e => { setErr(true); toast.error(getErrorMessage(e)); });
    superStorage().then(r => setStorage(r.data)).catch(e => { setErr(true); toast.error(getErrorMessage(e)); });
  }, []);

  return (
    <div data-testid="usage-tab" className="space-y-12">
      {/* Storage */}
      <section>
        <h2 className="text-sm uppercase tracking-widest mb-4 flex items-center gap-2" style={{ color: "#A1A1AA" }}>
          <HardDrive className="w-4 h-4" /> Total storage
        </h2>
        {!storage ? <p className="text-white/50" data-testid="storage-loading">Loading…</p> : (
          <>
            <div className="rounded-lg border border-white/10 p-6 mb-6" style={{ background: "rgba(212,175,55,0.06)" }}>
              <div className="text-xs uppercase tracking-wider" style={{ color: "#71717A" }}>Platform-wide (database + media on disk)</div>
              <div className="text-5xl font-semibold mt-2" style={{ color: "#D4AF37" }} data-testid="storage-total">{fmtBytes(storage.total_bytes)}</div>
              <div className="text-xs mt-2" style={{ color: "#71717A" }}>{storage.tenant_count} photographer{storage.tenant_count === 1 ? "" : "s"}</div>
            </div>
            <h3 className="text-xs uppercase tracking-widest mb-3" style={{ color: "#71717A" }}>Per photographer</h3>
            <div className="space-y-2" data-testid="storage-per-tenant">
              {storage.per_tenant.length === 0 && <p className="text-white/40 text-sm">No photographers yet.</p>}
              {storage.per_tenant.map((t) => (
                <div key={t.tenant_id} className="rounded-lg border border-white/10 p-3 flex items-center justify-between gap-4" style={{ background: "rgba(255,255,255,0.02)" }}>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{t.business_name}</div>
                    <div className="text-xs mt-0.5" style={{ color: "#71717A" }}>media {fmtBytes(t.disk_bytes)} · db {fmtBytes(t.db_bytes)}</div>
                  </div>
                  <div className="text-lg font-semibold shrink-0" style={{ color: "#F5F5F4" }}>{fmtBytes(t.total_bytes)}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Bandwidth */}
      <section>
        <h2 className="text-sm uppercase tracking-widest mb-4 flex items-center gap-2" style={{ color: "#A1A1AA" }}>
          <Wifi className="w-4 h-4" /> Internet usage (bandwidth)
        </h2>
        {!bw ? <p className="text-white/50" data-testid="bandwidth-loading">Loading…</p> : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="rounded-lg border border-white/10 p-5" style={{ background: "rgba(255,255,255,0.02)" }}>
                <div className="text-xs uppercase tracking-wider mb-3" style={{ color: "#71717A" }}>Today</div>
                <div className="text-3xl font-semibold" data-testid="bw-today-total">{fmtBytes(bw.today.total_bytes)}</div>
                <div className="flex gap-4 mt-3 text-sm">
                  <span className="flex items-center gap-1" style={{ color: "#4ade80" }}><ArrowUpCircle className="w-4 h-4" /> {fmtBytes(bw.today.upload_bytes)}</span>
                  <span className="flex items-center gap-1" style={{ color: "#60a5fa" }}><ArrowDownCircle className="w-4 h-4" /> {fmtBytes(bw.today.download_bytes)}</span>
                </div>
              </div>
              <div className="rounded-lg border border-white/10 p-5" style={{ background: "rgba(255,255,255,0.02)" }}>
                <div className="text-xs uppercase tracking-wider mb-3" style={{ color: "#71717A" }}>This week (last 7 days)</div>
                <div className="text-3xl font-semibold" data-testid="bw-week-total">{fmtBytes(bw.week.total_bytes)}</div>
                <div className="flex gap-4 mt-3 text-sm">
                  <span className="flex items-center gap-1" style={{ color: "#4ade80" }}><ArrowUpCircle className="w-4 h-4" /> {fmtBytes(bw.week.upload_bytes)}</span>
                  <span className="flex items-center gap-1" style={{ color: "#60a5fa" }}><ArrowDownCircle className="w-4 h-4" /> {fmtBytes(bw.week.download_bytes)}</span>
                </div>
              </div>
            </div>
            <p className="text-xs mb-4" style={{ color: "#71717A" }}>
              <ArrowUpCircle className="w-3 h-3 inline mr-1" style={{ color: "#4ade80" }} />Uploads
              <ArrowDownCircle className="w-3 h-3 inline mx-1 ml-3" style={{ color: "#60a5fa" }} />Downloads &amp; streaming · History builds up from now.
            </p>
            <h3 className="text-xs uppercase tracking-widest mb-3" style={{ color: "#71717A" }}>Per photographer (this week)</h3>
            <div className="space-y-2" data-testid="bandwidth-per-tenant">
              {(bw.per_tenant_week || []).length === 0 && <p className="text-white/40 text-sm">No bandwidth recorded yet.</p>}
              {(bw.per_tenant_week || []).map((t) => (
                <div key={t.tenant_id} className="rounded-lg border border-white/10 p-3 flex items-center justify-between gap-4" style={{ background: "rgba(255,255,255,0.02)" }}>
                  <div className="font-medium truncate">{t.business_name}</div>
                  <div className="flex gap-4 text-sm shrink-0">
                    <span className="flex items-center gap-1" style={{ color: "#4ade80" }}><ArrowUpCircle className="w-4 h-4" /> {fmtBytes(t.upload_bytes)}</span>
                    <span className="flex items-center gap-1" style={{ color: "#60a5fa" }}><ArrowDownCircle className="w-4 h-4" /> {fmtBytes(t.download_bytes)}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}


function PaymentsTab() {
  const [d, setD] = useState(null);
  useEffect(() => { superPayments().then(r => setD(r.data)).catch(e => toast.error(getErrorMessage(e))); }, []);
  if (!d) return <p className="text-white/50" data-testid="payments-loading">Loading…</p>;
  return (
    <div data-testid="payments-tab">
      <div className="grid grid-cols-2 gap-4 mb-8">
        <Stat icon={<TrendingUp className="w-5 h-5" />} label="Collected (paid)" value={gbp(d.paid_total)} accent="#4ade80" />
        <Stat icon={<CreditCard className="w-5 h-5" />} label="Transactions" value={d.count} />
      </div>
      <h2 className="text-sm uppercase tracking-widest mb-4" style={{ color: "#A1A1AA" }}>All transactions</h2>
      {d.payments.length === 0 ? (
        <p className="text-white/40 text-sm">No payments yet. They'll appear here as photographers subscribe.</p>
      ) : (
        <div className="rounded-lg border border-white/10 overflow-hidden" data-testid="payments-table">
          <div className="grid grid-cols-12 px-4 py-2 text-xs uppercase tracking-wider" style={{ color: "#71717A", background: "rgba(255,255,255,0.03)" }}>
            <div className="col-span-4">Photographer</div><div className="col-span-2">Plan</div>
            <div className="col-span-2">Amount</div><div className="col-span-2">Status</div><div className="col-span-2">Date</div>
          </div>
          {d.payments.map((p, i) => (
            <div key={i} className="grid grid-cols-12 px-4 py-3 text-sm border-t border-white/5 items-center">
              <div className="col-span-4 truncate">{p.business_name}</div>
              <div className="col-span-2 capitalize">{p.plan}</div>
              <div className="col-span-2">{gbp(p.amount)}</div>
              <div className="col-span-2">
                <span className="text-xs px-2 py-0.5 rounded" style={{ background: p.is_paid ? "rgba(74,222,128,0.15)" : "rgba(161,161,170,0.15)", color: p.is_paid ? "#4ade80" : "#A1A1AA" }}>
                  {p.is_paid ? "paid" : (p.payment_status || "pending")}
                </span>
              </div>
              <div className="col-span-2 text-xs" style={{ color: "#71717A" }}>{fmtDate(p.created_at)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmailTab() {
  const [smtp, setSmtp] = useState(null);
  const [recips, setRecips] = useState({ count: 0 });
  const [msg, setMsg] = useState({ subject: "", body: "" });
  const [savingSmtp, setSavingSmtp] = useState(false);
  const [testing, setTesting] = useState(false);
  const [sending, setSending] = useState(false);
  const [templates, setTemplates] = useState([]);

  const loadTemplates = () => superListTemplates().then(r => setTemplates(r.data)).catch(() => {});
  useEffect(() => {
    superGetEmail().then(r => setSmtp(r.data)).catch(e => toast.error(getErrorMessage(e)));
    superBroadcastRecipients().then(r => setRecips(r.data)).catch(() => {});
    loadTemplates();
  }, []);

  const saveSmtp = async () => {
    setSavingSmtp(true);
    try { await superSaveEmail(smtp); toast.success("Email settings saved"); }
    catch (e) { toast.error(getErrorMessage(e)); }
    finally { setSavingSmtp(false); }
  };
  const testSmtp = async () => {
    setTesting(true);
    try { const r = await superTestEmail(); toast.success(r.data.message || "Test sent"); }
    catch (e) { toast.error(getErrorMessage(e)); }
    finally { setTesting(false); }
  };
  const send = async () => {
    if (!msg.subject.trim() || !msg.body.trim()) return toast.error("Subject and message are required");
    if (!window.confirm(`Send this to all ${recips.count} photographer(s)?`)) return;
    setSending(true);
    try {
      const r = await superBroadcast(msg);
      toast.success(`Sent to ${r.data.sent}${r.data.failed ? `, ${r.data.failed} failed` : ""}`);
      setMsg({ subject: "", body: "" });
    } catch (e) { toast.error(getErrorMessage(e)); }
    finally { setSending(false); }
  };

  if (!smtp) return <p className="text-white/50" data-testid="email-loading">Loading…</p>;
  const inp = "bg-transparent border-white/15 text-white";

  return (
    <div data-testid="email-tab">
      <div className="grid md:grid-cols-2 gap-8">
      <div>
        <h2 className="text-sm uppercase tracking-widest mb-4" style={{ color: "#A1A1AA" }}>Platform email account (SMTP)</h2>
        <div className="space-y-3">
          <div><Label className="text-xs" style={{ color: "#A1A1AA" }}>SMTP server</Label>
            <Input data-testid="smtp-server" className={inp} value={smtp.smtp_server} onChange={e => setSmtp({ ...smtp, smtp_server: e.target.value })} placeholder="smtp.yourprovider.com" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs" style={{ color: "#A1A1AA" }}>Port</Label>
              <Input data-testid="smtp-port" type="number" className={inp} value={smtp.smtp_port} onChange={e => setSmtp({ ...smtp, smtp_port: parseInt(e.target.value) || 465 })} /></div>
            <div><Label className="text-xs" style={{ color: "#A1A1AA" }}>Sender name</Label>
              <Input data-testid="smtp-sender" className={inp} value={smtp.sender_name} onChange={e => setSmtp({ ...smtp, sender_name: e.target.value })} placeholder="StudioApp" /></div>
          </div>
          <div><Label className="text-xs" style={{ color: "#A1A1AA" }}>From email</Label>
            <Input data-testid="smtp-email" className={inp} value={smtp.smtp_email} onChange={e => setSmtp({ ...smtp, smtp_email: e.target.value })} placeholder="hello@studioappgallery.uk" /></div>
          <div><Label className="text-xs" style={{ color: "#A1A1AA" }}>Password</Label>
            <Input data-testid="smtp-password" type="password" className={inp} value={smtp.smtp_password} onChange={e => setSmtp({ ...smtp, smtp_password: e.target.value })} placeholder="••••••••" /></div>
          <div className="flex gap-2 pt-1">
            <Button data-testid="smtp-save" onClick={saveSmtp} disabled={savingSmtp} className="rounded-sm text-xs uppercase tracking-wider font-bold" style={{ background: "#D4AF37", color: "#0B0B0F" }}>
              {savingSmtp ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
            </Button>
            <Button data-testid="smtp-test" onClick={testSmtp} disabled={testing} variant="outline" className="rounded-sm text-xs border-white/20 text-white/80">
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send test"}
            </Button>
          </div>
          <p className="text-xs" style={{ color: "#71717A" }}>Port 465 = SSL, 587 = TLS. Use an app password if your provider requires one.</p>
        </div>
      </div>

      <div>
        <h2 className="text-sm uppercase tracking-widest mb-4" style={{ color: "#A1A1AA" }}>Broadcast to all photographers</h2>
        <div className="rounded-lg border border-white/10 p-3 mb-4 text-sm" style={{ background: "rgba(212,175,55,0.06)", color: "#D4AF37" }}>
          <Users className="w-4 h-4 inline mr-2" /> {recips.count} photographer(s) will receive this
        </div>
        <div className="space-y-3">
          {templates.length > 0 && (
            <div>
              <Label className="text-xs" style={{ color: "#A1A1AA" }}>Load a template (optional)</Label>
              <Select onValueChange={(id) => { const tp = templates.find(x => x.id === id); if (tp) setMsg({ subject: tp.subject, body: tp.body }); }}>
                <SelectTrigger data-testid="broadcast-template-picker" className="bg-transparent border-white/15 text-white text-sm"><SelectValue placeholder="Choose a saved template…" /></SelectTrigger>
                <SelectContent>{templates.map(tp => <SelectItem key={tp.id} value={tp.id}>{tp.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div><Label className="text-xs" style={{ color: "#A1A1AA" }}>Subject</Label>
            <Input data-testid="broadcast-subject" className={inp} value={msg.subject} onChange={e => setMsg({ ...msg, subject: e.target.value })} placeholder="e.g. New feature: bulk uploads" /></div>
          <div><Label className="text-xs" style={{ color: "#A1A1AA" }}>Message</Label>
            <Textarea data-testid="broadcast-body" rows={8} className={inp} value={msg.body} onChange={e => setMsg({ ...msg, body: e.target.value })} placeholder="Write your announcement…" /></div>
          <Button data-testid="broadcast-send" onClick={send} disabled={sending} className="rounded-sm gap-2 text-xs uppercase tracking-wider font-bold w-full" style={{ background: "#D4AF37", color: "#0B0B0F" }}>
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" /> Send to all</>}
          </Button>
        </div>
      </div>
      </div>
      <TemplatesManager templates={templates} reload={loadTemplates} />
    </div>
  );
}


function TemplatesManager({ templates, reload }) {
  const [editing, setEditing] = useState(null); // {id?, name, subject, body}
  const inp = "bg-transparent border-white/15 text-white";
  const save = async () => {
    if (!editing.name.trim()) return toast.error("Template name is required");
    try {
      if (editing.id) await superUpdateTemplate(editing.id, editing);
      else await superCreateTemplate(editing);
      toast.success("Template saved");
      setEditing(null); reload();
    } catch (e) { toast.error(getErrorMessage(e)); }
  };
  const del = async (t) => {
    if (!window.confirm(`Delete template "${t.name}"?`)) return;
    try { await superDeleteTemplate(t.id); toast.success("Template deleted"); reload(); }
    catch (e) { toast.error(getErrorMessage(e)); }
  };
  return (
    <div className="mt-12 pt-8 border-t border-white/10" data-testid="templates-manager">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm uppercase tracking-widest flex items-center gap-2" style={{ color: "#A1A1AA" }}><FileText className="w-4 h-4" /> Email templates</h2>
        <Button data-testid="new-template-btn" onClick={() => setEditing({ name: "", subject: "", body: "" })} className="rounded-sm gap-2 text-xs uppercase tracking-wider font-bold" style={{ background: "#D4AF37", color: "#0B0B0F" }}><Plus className="w-4 h-4" /> New template</Button>
      </div>
      {templates.length === 0 ? (
        <p className="text-white/40 text-sm">No templates yet. Save one to reuse for broadcasts or single sends.</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3" data-testid="templates-list">
          {templates.map(t => (
            <div key={t.id} className="rounded-lg border border-white/10 p-4 flex items-start justify-between gap-3" style={{ background: "rgba(255,255,255,0.02)" }}>
              <div className="min-w-0">
                <div className="font-medium truncate">{t.name}</div>
                <div className="text-xs mt-0.5 truncate" style={{ color: "#71717A" }}>{t.subject || "(no subject)"}</div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="sm" onClick={() => setEditing(t)} className="text-white/70"><Pencil className="w-4 h-4" /></Button>
                <Button variant="ghost" size="sm" onClick={() => del(t)}><Trash2 className="w-4 h-4" style={{ color: "#f87171" }} /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent data-testid="template-dialog">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit template" : "New template"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>Template name</Label><Input data-testid="tpl-name" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. Trial ending reminder" /></div>
              <div><Label>Subject</Label><Input data-testid="tpl-subject" value={editing.subject} onChange={e => setEditing({ ...editing, subject: e.target.value })} /></div>
              <div><Label>Message</Label><Textarea data-testid="tpl-body" rows={7} value={editing.body} onChange={e => setEditing({ ...editing, body: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter><Button data-testid="tpl-save" onClick={save}>Save template</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ExtendTrialDialog({ tenant, onClose, onDone }) {
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const submit = async (forever) => {
    setBusy(true);
    try {
      await superExtendTrial(tenant.id, forever ? { forever: true } : { days: parseInt(days) || 0 });
      toast.success(forever ? `${tenant.business_name} set to lifetime access` : `Trial extended by ${days} days`);
      onClose(); onDone && onDone();
    } catch (e) { toast.error(getErrorMessage(e)); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="extend-trial-dialog">
        <DialogHeader><DialogTitle>Extend trial — {tenant.business_name}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Extend by (days)</Label>
            <Input data-testid="extend-days-input" type="number" min="1" value={days} onChange={e => setDays(e.target.value)} />
            <p className="text-xs mt-1 text-muted-foreground">Adds to their current trial end if it's still active.</p>
          </div>
          <div className="flex gap-2">
            <Button data-testid="extend-days-btn" onClick={() => submit(false)} disabled={busy} className="flex-1 gap-2"><CalendarPlus className="w-4 h-4" /> Extend {days} days</Button>
            <Button data-testid="extend-forever-btn" onClick={() => submit(true)} disabled={busy} variant="outline" className="flex-1 gap-2"><InfinityIcon className="w-4 h-4" /> Lifetime (never expires)</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TenantEmailDialog({ tenant, onClose }) {
  const [msg, setMsg] = useState({ subject: "", body: "" });
  const [templates, setTemplates] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { superListTemplates().then(r => setTemplates(r.data)).catch(() => {}); }, []);
  const send = async () => {
    if (!msg.subject.trim() || !msg.body.trim()) return toast.error("Subject and message are required");
    setBusy(true);
    try {
      const r = await superEmailTenant(tenant.id, msg);
      toast.success(`Sent to ${r.data.sent_to}`);
      onClose();
    } catch (e) { toast.error(getErrorMessage(e)); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="tenant-email-dialog">
        <DialogHeader><DialogTitle>Email {tenant.business_name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {templates.length > 0 && (
            <div>
              <Label>Load a template (optional)</Label>
              <Select onValueChange={(id) => { const tp = templates.find(x => x.id === id); if (tp) setMsg({ subject: tp.subject, body: tp.body }); }}>
                <SelectTrigger data-testid="tenant-email-template-picker"><SelectValue placeholder="Choose a saved template…" /></SelectTrigger>
                <SelectContent>{templates.map(tp => <SelectItem key={tp.id} value={tp.id}>{tp.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div><Label>Subject</Label><Input data-testid="tenant-email-subject" value={msg.subject} onChange={e => setMsg({ ...msg, subject: e.target.value })} /></div>
          <div><Label>Message</Label><Textarea data-testid="tenant-email-body" rows={7} value={msg.body} onChange={e => setMsg({ ...msg, body: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button data-testid="tenant-email-send" onClick={send} disabled={busy} className="gap-2">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" /> Send</>}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
