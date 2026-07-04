import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Building2, Plus, Trash2, Power, LogOut, Users, Layers } from "lucide-react";
import {
  superLogin, superListTenants, superCreateTenant, superSetStatus, superSetPlan, superDeleteTenant, getErrorMessage,
} from "@/lib/api";

const PLAN_LABELS = { starter: "Starter · 10 · £15", pro: "Professional · 30 · £35", studio: "Studio · 60 · £65" };

export default function SuperAdmin() {
  const [authed, setAuthed] = useState(!!localStorage.getItem("super_token"));
  const [creds, setCreds] = useState({ username: "", password: "" });
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ business_name: "", username: "", password: "", plan: "starter" });

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
            <div className="inline-flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <Layers className="w-6 h-6" style={{ color: "#D4AF37" }} /> StudioApp
            </div>
            <p className="text-sm mt-2" style={{ color: "#A1A1AA" }}>Platform Administration</p>
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

  return (
    <div className="min-h-screen" style={{ background: "#0B0B0F", color: "#F5F5F4" }}>
      <header className="border-b border-white/10 sticky top-0 z-30" style={{ background: "rgba(11,11,15,0.9)", backdropFilter: "blur(12px)" }}>
        <div className="max-w-screen-lg mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <Layers className="w-5 h-5" style={{ color: "#D4AF37" }} /> StudioApp <span className="text-xs font-normal" style={{ color: "#71717A" }}>· Platform</span>
          </div>
          <div className="flex items-center gap-2">
            <Button data-testid="super-new-tenant-btn" onClick={() => setShowCreate(true)} className="rounded-sm gap-2 text-xs uppercase tracking-wider font-bold" style={{ background: "#D4AF37", color: "#0B0B0F" }}>
              <Plus className="w-4 h-4" /> New Photographer
            </Button>
            <Button data-testid="super-logout-btn" variant="ghost" onClick={() => { localStorage.removeItem("super_token"); setAuthed(false); }} className="text-white/70">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-screen-lg mx-auto px-6 py-10">
        <div className="grid grid-cols-3 gap-4 mb-10">
          <Stat icon={<Users className="w-5 h-5" />} label="Photographers" value={tenants.length} />
          <Stat icon={<Building2 className="w-5 h-5" />} label="Active" value={tenants.filter((t) => t.status !== "suspended").length} />
          <Stat icon={<Layers className="w-5 h-5" />} label="Total galleries" value={tenants.reduce((a, t) => a + (t.gallery_count || 0), 0)} />
        </div>

        <h2 className="text-sm uppercase tracking-widest mb-4" style={{ color: "#A1A1AA" }}>Tenants</h2>
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
                  </div>
                  <div className="text-xs mt-1" style={{ color: "#71717A" }}>
                    @{t.admin_username || "—"} · /s/{t.subdomain}/… · {t.gallery_count || 0} galleries
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
                  <Button data-testid={`tenant-toggle-${t.id}`} variant="ghost" size="sm" onClick={() => toggleStatus(t)} className="text-white/70"><Power className="w-4 h-4" /></Button>
                  <Button data-testid={`tenant-delete-${t.id}`} variant="ghost" size="sm" onClick={() => remove(t)}><Trash2 className="w-4 h-4" style={{ color: "#f87171" }} /></Button>
                </div>
              </div>
            ))}
          </div>
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
    </div>
  );
}

function Stat({ icon, label, value }) {
  return (
    <div className="rounded-lg border border-white/10 p-5" style={{ background: "rgba(255,255,255,0.02)" }}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider" style={{ color: "#71717A" }}>{icon} {label}</div>
      <div className="text-3xl font-semibold mt-2">{value}</div>
    </div>
  );
}
