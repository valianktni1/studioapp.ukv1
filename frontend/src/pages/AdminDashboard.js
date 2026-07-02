import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Plus, FolderOpen, Image as ImageIcon, Clock, Download, Album, HardDrive, Radio } from "lucide-react";
import AdminShell from "@/components/AdminShell";
import { tenantApi, formatBytes, apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

function Stat({ icon: Icon, label, value, tint }) {
  return (
    <div className="sa-card p-5" data-testid={`stat-${label.toLowerCase().replace(/\s/g, "-")}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="sa-label">{label}</span>
        <span className="rounded p-1.5" style={{ background: `${tint}22` }}><Icon size={16} style={{ color: tint }} /></span>
      </div>
      <div className="font-display text-3xl">{value}</div>
    </div>
  );
}

export default function AdminDashboard() {
  const { tenant } = useAuth();
  const [stats, setStats] = useState(null);
  const [galleries, setGalleries] = useState([]);
  const [visitors, setVisitors] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [clientEmail, setClientEmail] = useState("");

  const load = async () => {
    try {
      const [s, g] = await Promise.all([tenantApi.get("/admin/dashboard-stats"), tenantApi.get("/admin/galleries")]);
      setStats(s.data); setGalleries(g.data);
    } catch (err) { toast.error(apiError(err)); }
  };

  const loadVisitors = async () => {
    try { const { data } = await tenantApi.get("/admin/live-visitors"); setVisitors(data); } catch {}
  };

  useEffect(() => { load(); loadVisitors(); const t = setInterval(loadVisitors, 15000); return () => clearInterval(t); }, []);

  const create = async (e) => {
    e.preventDefault();
    try {
      await tenantApi.post("/admin/galleries", { folder_name: folderName, client_email: clientEmail || null });
      toast.success("Gallery created");
      setShowCreate(false); setFolderName(""); setClientEmail(""); load();
    } catch (err) { toast.error(apiError(err)); }
  };

  const pct = stats && stats.gallery_limit ? Math.min(100, (stats.active_galleries / stats.gallery_limit) * 100) : 0;
  const trialing = tenant?.subscription_status === "trialing";
  const trialExpired = tenant?.trial_expired;

  return (
    <AdminShell>
      {trialing && !trialExpired && (
        <div className="sa-card p-4 mb-5 flex items-center justify-between" style={{ borderColor: "var(--sa-gold)" }} data-testid="trial-banner">
          <span className="text-sm">You have <b>{tenant.trial_days_left} day{tenant.trial_days_left === 1 ? "" : "s"}</b> left in your free trial.</span>
          <Link to="/admin/settings?tab=billing" className="sa-btn !py-2" data-testid="trial-upgrade">Choose a plan</Link>
        </div>
      )}
      {trialExpired && (
        <div className="sa-card p-4 mb-5 flex items-center justify-between" style={{ borderColor: "#f87171" }} data-testid="trial-expired-banner">
          <span className="text-sm" style={{ color: "#f87171" }}>Your free trial has ended. Choose a plan to keep creating galleries.</span>
          <Link to="/admin/settings?tab=billing" className="sa-btn !py-2" data-testid="trial-upgrade">Upgrade now</Link>
        </div>
      )}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-4xl">Galleries</h1>
          <p style={{ color: "var(--sa-muted)" }}>Welcome back to {tenant?.business_name}</p>
        </div>
        <button className="sa-btn" disabled={trialExpired} onClick={() => setShowCreate(true)} data-testid="new-gallery-btn"><Plus size={18} /> New Gallery</button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <Stat icon={FolderOpen} label="Active Galleries" value={stats.active_galleries} tint="#D4AF37" />
          <Stat icon={Clock} label="Expiring Soon" value={stats.expiring_soon} tint="#f59e0b" />
          <Stat icon={Download} label="Downloads Wk" value={stats.downloads_this_week} tint="#4ade80" />
          <Stat icon={Album} label="Pending Albums" value={stats.pending_albums} tint="#f472b6" />
          <Stat icon={HardDrive} label="Storage" value={formatBytes(stats.storage_used_bytes)} tint="#818cf8" />
        </div>
      )}

      {stats && (
        <div className="sa-card p-4 mb-6">
          <div className="flex justify-between text-xs mb-2" style={{ color: "var(--sa-muted)" }}>
            <span>{stats.plan_label} plan &middot; galleries used</span><span>{stats.active_galleries} / {stats.gallery_limit}</span>
          </div>
          <div className="h-2 rounded" style={{ background: "var(--sa-border)" }}>
            <div className="h-2 rounded" style={{ width: `${pct}%`, background: "var(--sa-gold)" }} />
          </div>
        </div>
      )}

      <div className="sa-card p-5 mb-8" data-testid="live-visitors">
        <div className="flex items-center gap-2 mb-3">
          <Radio size={16} className={visitors.length ? "sa-pulse" : ""} style={{ color: visitors.length ? "#4ade80" : "var(--sa-muted)" }} />
          <span className="sa-label">Live Gallery Visitors</span>
          {visitors.length > 0 && <span className="text-xs px-2 py-0.5 rounded" style={{ background: "rgba(74,222,128,0.15)", color: "#4ade80" }}>Live</span>}
        </div>
        {visitors.length === 0
          ? <p style={{ color: "var(--sa-muted)" }} className="text-sm">No couples are currently viewing galleries</p>
          : <ul className="space-y-2">{visitors.map((v) => (
              <li key={v.session_id} className="text-sm flex justify-between"><span>{v.gallery_name} &mdash; {v.action} {v.subfolder}</span><span style={{ color: "var(--sa-muted)" }}>{v.device}</span></li>
            ))}</ul>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {galleries.map((g) => (
          <Link key={g.id} to={`/admin/gallery/${g.id}`} className="sa-card p-6 block" data-testid={`gallery-card-${g.id}`}>
            <ImageIcon size={22} style={{ color: "var(--sa-gold)" }} />
            <h3 className="font-display text-2xl mt-3">{g.folder_name}</h3>
            <p style={{ color: "var(--sa-muted)" }} className="text-sm mt-1">{g.total_files} files &middot; {g.subfolders.length} folders</p>
          </Link>
        ))}
        {galleries.length === 0 && <p style={{ color: "var(--sa-muted)" }}>No galleries yet. Create your first one.</p>}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }} onClick={() => setShowCreate(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={create} className="sa-card p-8 w-full max-w-md space-y-4" data-testid="create-gallery-modal">
            <h3 className="font-display text-2xl">New Gallery</h3>
            <div><label className="sa-label block mb-2">Folder name</label><input className="sa-input" placeholder="Eva & Ella 27.06.26" value={folderName} onChange={(e) => setFolderName(e.target.value)} required data-testid="cg-name" /></div>
            <div><label className="sa-label block mb-2">Client email (optional)</label><input className="sa-input" type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} data-testid="cg-email" /></div>
            <p className="text-xs" style={{ color: "var(--sa-muted)" }}>Default folders will be created: Wedding Images, Video, SelfieBooth, Album Favourites, Guest Uploads.</p>
            <div className="flex gap-3 pt-2">
              <button type="button" className="sa-btn-ghost flex-1" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="sa-btn flex-1" data-testid="cg-submit">Create</button>
            </div>
          </form>
        </div>
      )}
    </AdminShell>
  );
}
