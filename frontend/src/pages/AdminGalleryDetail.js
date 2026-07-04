import React, { useEffect, useRef, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Upload, Trash2, Link2, Plus, Copy, Power, Star, Loader2, Mail, QrCode } from "lucide-react";
import AdminShell from "@/components/AdminShell";
import { tenantApi, mediaUrl, apiError, formatBytes } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import useTitle from "@/lib/useTitle";

const slugify = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "folder";

export default function AdminGalleryDetail() {
  const { id } = useParams();
  const { tenant } = useAuth();
  const shareUrl = (s) => {
    const slug = s.custom_slug || s.token;
    return tenant?.subdomain
      ? `${window.location.origin}/s/${tenant.subdomain}/${slug}`
      : `${window.location.origin}/s/${slug}`;
  };
  const [gallery, setGallery] = useState(null);
  useTitle(gallery?.folder_name || "Gallery");
  const [active, setActive] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [shares, setShares] = useState([]);
  const [showShare, setShowShare] = useState(false);
  const [shareForm, setShareForm] = useState({ subfolder: "", password: "", access_level: "download", label: "", expires_at: "", guest_upload_mode: false, allow_delete: false });
  const [showNotify, setShowNotify] = useState(false);
  const [notify, setNotify] = useState({ to: "", share_url: "", password: "", message: "" });
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [qrOpen, setQrOpen] = useState(null);
  const [qrBusy, setQrBusy] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [tplId, setTplId] = useState("");
  const fileInput = useRef();

  const load = useCallback(async () => {
    try {
      const { data } = await tenantApi.get(`/admin/galleries/${id}`);
      setGallery(data);
      setActive((a) => a || data.subfolders[0]);
    } catch (err) { toast.error(apiError(err)); }
  }, [id]);

  const loadShares = useCallback(async () => {
    try { const { data } = await tenantApi.get(`/admin/galleries/${id}/shares`); setShares(data); } catch {}
  }, [id]);

  useEffect(() => { load(); loadShares(); }, [load, loadShares]);

  // poll for thumbnails while any photo is pending
  useEffect(() => {
    const pending = gallery?.files?.some((f) => f.file_type === "photo" && !f.has_thumb);
    if (!pending) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [gallery, load]);

  const doUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const fd = new FormData();
    fd.append("subfolder", active);
    files.forEach((f) => fd.append("files", f));
    setUploading(true);
    try {
      await tenantApi.post(`/admin/galleries/${id}/upload`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success(`Uploaded ${files.length} file(s)`);
      load();
    } catch (err) { toast.error(apiError(err)); }
    finally { setUploading(false); if (fileInput.current) fileInput.current.value = ""; }
  };

  const delFile = async (f) => {
    if (!window.confirm(`Delete ${f.filename}?`)) return;
    try { await tenantApi.delete(`/admin/galleries/${id}/files/${f.id}`); toast.success("Deleted"); load(); }
    catch (err) { toast.error(apiError(err)); }
  };

  const setCover = async (f) => {
    try { await tenantApi.put(`/admin/galleries/${id}/subfolders/${encodeURIComponent(active)}/cover`, { file_id: f.id }); toast.success("Cover set"); load(); }
    catch (err) { toast.error(apiError(err)); }
  };

  const createShare = async (e) => {
    e.preventDefault();
    try {
      const body = { ...shareForm, subfolder: shareForm.subfolder || null, password: shareForm.password || null, expires_at: shareForm.expires_at || null };
      await tenantApi.post(`/admin/galleries/${id}/shares`, body);
      toast.success("Share link created"); setShowShare(false);
      setShareForm({ subfolder: "", password: "", access_level: "download", label: "", expires_at: "", guest_upload_mode: false, allow_delete: false });
      loadShares();
    } catch (err) { toast.error(apiError(err)); }
  };

  const copyLink = (s) => {
    const url = shareUrl(s);    navigator.clipboard.writeText(url); toast.success("Link copied");
  };
  const toggleShare = async (s) => { try { await tenantApi.put(`/admin/shares/${s.id}/toggle`); loadShares(); } catch (err) { toast.error(apiError(err)); } };
  const delShare = async (s) => { if (!window.confirm("Delete this link?")) return; try { await tenantApi.delete(`/admin/shares/${s.id}`); loadShares(); } catch (err) { toast.error(apiError(err)); } };

  const downloadQr = async (s, design) => {
    setQrBusy(true);
    try {
      const res = await tenantApi.get(`/admin/shares/${s.id}/qr-pdf?design=${design}`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a"); a.href = url; a.download = `gallery-qr-${design}.pdf`; a.click(); URL.revokeObjectURL(url);
      toast.success(`${design} QR PDF downloaded`);
    } catch (err) { toast.error(apiError(err)); }
    finally { setQrBusy(false); }
  };

  const openNotify = () => {
    const first = shares.find((s) => s.is_active) || shares[0];
    const url = first ? shareUrl(first) : "";
    setNotify({ to: gallery.client_email || "", share_url: url, password: "", message: "" });
    setTplId("");
    tenantApi.get("/admin/email-templates").then(({ data }) => setTemplates(data || [])).catch(() => {});
    setShowNotify(true);
  };
  const sendNotify = async (e) => {
    e.preventDefault();
    setNotifyBusy(true);
    try {
      if (tplId) {
        await tenantApi.post(`/admin/galleries/${id}/send-template`, { template_id: tplId, to: notify.to, share_url: notify.share_url, password: notify.password });
      } else {
        await tenantApi.post(`/admin/galleries/${id}/notify`, notify);
      }
      toast.success(`Email sent to ${notify.to}`); setShowNotify(false);
    } catch (err) { toast.error(apiError(err)); }
    finally { setNotifyBusy(false); }
  };

  if (!gallery) return <AdminShell><div style={{ color: "var(--sa-muted)" }}>Loading…</div></AdminShell>;

  const activeFiles = gallery.files.filter((f) => f.subfolder === active);

  return (
    <AdminShell>
      <Link to="/admin" className="inline-flex items-center gap-2 text-sm mb-4" style={{ color: "var(--sa-muted)" }} data-testid="back-link"><ArrowLeft size={15} /> All galleries</Link>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display text-4xl">{gallery.folder_name}</h1>
          <p style={{ color: "var(--sa-muted)" }}>{gallery.total_files} files{gallery.client_email ? ` · ${gallery.client_email}` : ""}</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="sa-btn-ghost" onClick={openNotify} data-testid="notify-btn"><Mail size={16} /> Notify Client</button>
          <button className="sa-btn" onClick={() => setShowShare(true)} data-testid="new-share-btn"><Link2 size={16} /> Create Share Link</button>
        </div>
      </div>

      {/* Shares */}
      {shares.length > 0 && (
        <div className="sa-card p-5 mb-6">
          <span className="sa-label">Share links</span>
          <div className="mt-3 space-y-2">
            {shares.map((s) => (
              <div key={s.id} className="py-2" style={{ borderBottom: "1px solid var(--sa-border)" }} data-testid={`share-row-${s.id}`}>
                <div className="flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium">{s.label || (s.guest_upload_mode ? "Guest Upload Link" : "Gallery Link")}</span>
                    <span style={{ color: "var(--sa-muted)" }}> &middot; {s.access_level}{s.has_password ? " · password" : ""}{s.expires_at ? ` · expires ${s.expires_at.slice(0,10)}` : ""}</span>
                    <span className="ml-2 text-xs" style={{ color: s.is_active ? "#4ade80" : "#f87171" }}>{s.is_active ? "active" : "inactive"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="sa-btn-ghost !p-2" onClick={() => setQrOpen(qrOpen === s.id ? null : s.id)} data-testid={`qr-${s.id}`}><QrCode size={14} /></button>
                    <button className="sa-btn-ghost !p-2" onClick={() => copyLink(s)} data-testid={`copy-${s.id}`}><Copy size={14} /></button>
                    <button className="sa-btn-ghost !p-2" onClick={() => toggleShare(s)} data-testid={`toggle-${s.id}`}><Power size={14} /></button>
                    <button className="sa-btn-ghost !p-2" onClick={() => delShare(s)}><Trash2 size={14} color="#f87171" /></button>
                  </div>
                </div>
                {qrOpen === s.id && (
                  <div className="flex items-center gap-2 mt-2" data-testid={`qr-menu-${s.id}`}>
                    <span className="text-xs" style={{ color: "var(--sa-muted)" }}>QR PDF:</span>
                    {["minimal", "classic", "botanical"].map((dz) => (
                      <button key={dz} className="sa-btn-ghost !py-1 !px-3 !text-xs capitalize" disabled={qrBusy} onClick={() => downloadQr(s, dz)} data-testid={`qr-${dz}-${s.id}`}>{dz}</button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Subfolder tabs */}
      <div className="flex flex-wrap gap-2 mb-5">
        {gallery.subfolders.map((sf) => (
          <button key={sf} onClick={() => setActive(sf)} className="px-4 py-2 rounded text-sm"
            style={{ background: active === sf ? "var(--sa-gold)" : "var(--sa-surface)", color: active === sf ? "#0A0A0B" : "var(--sa-text)", border: "1px solid var(--sa-border)" }}
            data-testid={`tab-${slugify(sf)}`}>
            {sf} <span className="opacity-60">({gallery.file_counts[sf] || 0})</span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 mb-5">
        <input ref={fileInput} type="file" multiple className="hidden" onChange={doUpload} data-testid="file-input" />
        <button className="sa-btn" disabled={uploading} onClick={() => fileInput.current?.click()} data-testid="upload-btn">
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} {uploading ? "Uploading…" : `Upload to ${active}`}
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {activeFiles.map((f) => (
          <div key={f.id} className="sa-card overflow-hidden group relative" data-testid={`file-${f.id}`}>
            <div className="aspect-square bg-black flex items-center justify-center">
              {f.file_type === "photo" ? (
                f.has_thumb
                  ? <img src={mediaUrl("thumb", gallery.id, f.subfolder_slug, f.filename)} alt={f.filename} className="w-full h-full object-cover" style={{ objectPosition: "center 25%" }} />
                  : <Loader2 size={20} className="animate-spin" style={{ color: "var(--sa-muted)" }} />
              ) : <span className="text-xs px-2 text-center" style={{ color: "var(--sa-muted)" }}>{f.file_type.toUpperCase()}<br />{f.filename}</span>}
            </div>
            <div className="absolute inset-x-0 bottom-0 p-2 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "linear-gradient(0deg, rgba(0,0,0,0.85), transparent)" }}>
              <span className="text-[10px] truncate mr-1" style={{ color: "#fff" }}>{formatBytes(f.file_size)}</span>
              <div className="flex gap-1">
                {f.file_type === "photo" && <button onClick={() => setCover(f)} title="Set as cover" className="p-1"><Star size={14} color={gallery.covers[active] === f.id ? "#D4AF37" : "#fff"} /></button>}
                <button onClick={() => delFile(f)} title="Delete" className="p-1"><Trash2 size={14} color="#f87171" /></button>
              </div>
            </div>
          </div>
        ))}
        {activeFiles.length === 0 && <p className="col-span-full py-10 text-center" style={{ color: "var(--sa-muted)" }}>No files in {active} yet.</p>}
      </div>

      {showShare && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }} onClick={() => setShowShare(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={createShare} className="sa-card p-8 w-full max-w-md space-y-4" data-testid="share-modal">
            <h3 className="font-display text-2xl">Create Share Link</h3>
            <div><label className="sa-label block mb-2">Label</label><input className="sa-input" value={shareForm.label} onChange={(e) => setShareForm({ ...shareForm, label: e.target.value })} placeholder="Main Gallery Link" data-testid="sh-label" /></div>
            <div><label className="sa-label block mb-2">Folder scope</label>
              <select className="sa-input" value={shareForm.subfolder} onChange={(e) => setShareForm({ ...shareForm, subfolder: e.target.value })} data-testid="sh-subfolder">
                <option value="">Entire gallery</option>
                {gallery.subfolders.map((sf) => <option key={sf} value={sf}>{sf}</option>)}
              </select>
            </div>
            <div><label className="sa-label block mb-2">Password (optional)</label><input className="sa-input" value={shareForm.password} onChange={(e) => setShareForm({ ...shareForm, password: e.target.value })} data-testid="sh-password" /></div>
            <div><label className="sa-label block mb-2">Access level</label>
              <select className="sa-input" value={shareForm.access_level} onChange={(e) => setShareForm({ ...shareForm, access_level: e.target.value })} data-testid="sh-access">
                <option value="view">View only</option>
                <option value="download">View &amp; download</option>
                <option value="full">Full access</option>
              </select>
            </div>
            <div><label className="sa-label block mb-2">Expires (optional)</label><input type="date" className="sa-input" value={shareForm.expires_at} onChange={(e) => setShareForm({ ...shareForm, expires_at: e.target.value ? new Date(e.target.value).toISOString() : "" })} data-testid="sh-expiry" /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={shareForm.guest_upload_mode} onChange={(e) => setShareForm({ ...shareForm, guest_upload_mode: e.target.checked })} data-testid="sh-guest" /> Guest upload link</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={shareForm.allow_delete} onChange={(e) => setShareForm({ ...shareForm, allow_delete: e.target.checked })} data-testid="sh-allow-delete" /> Allow clients to delete files</label>
            <div className="flex gap-3 pt-2">
              <button type="button" className="sa-btn-ghost flex-1" onClick={() => setShowShare(false)}>Cancel</button>
              <button className="sa-btn flex-1" data-testid="sh-submit">Create</button>
            </div>
          </form>
        </div>
      )}

      {showNotify && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }} onClick={() => setShowNotify(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={sendNotify} className="sa-card p-8 w-full max-w-md space-y-4" data-testid="notify-modal">
            <h3 className="font-display text-2xl">Notify Client</h3>
            <p className="text-sm" style={{ color: "var(--sa-muted)" }}>Send a branded "your gallery is ready" email.</p>
            {templates.length > 0 && (
              <div><label className="sa-label block mb-2">Template</label>
                <select className="sa-input" value={tplId} onChange={(e) => setTplId(e.target.value)} data-testid="nf-template">
                  <option value="">Default "gallery ready" email</option>
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            )}
            <div><label className="sa-label block mb-2">Client email</label><input type="email" className="sa-input" value={notify.to} onChange={(e) => setNotify({ ...notify, to: e.target.value })} required placeholder="couple@example.com" data-testid="nf-to" /></div>
            <div><label className="sa-label block mb-2">Share link</label>
              <select className="sa-input" value={notify.share_url} onChange={(e) => setNotify({ ...notify, share_url: e.target.value })} data-testid="nf-share">
                {shares.length === 0 && <option value="">No share links — create one first</option>}
                {shares.map((s) => <option key={s.id} value={shareUrl(s)}>{s.label || (s.custom_slug || s.token)}{s.is_active ? "" : " (inactive)"}</option>)}
              </select>
            </div>
            <div><label className="sa-label block mb-2">Password to include (optional)</label><input className="sa-input" value={notify.password} onChange={(e) => setNotify({ ...notify, password: e.target.value })} placeholder="If the link is password-protected" data-testid="nf-password" /></div>
            <div><label className="sa-label block mb-2">Personal message (optional)</label><textarea className="sa-input" rows={3} value={notify.message} onChange={(e) => setNotify({ ...notify, message: e.target.value })} data-testid="nf-message" /></div>
            <div className="flex gap-3 pt-2">
              <button type="button" className="sa-btn-ghost flex-1" onClick={() => setShowNotify(false)}>Cancel</button>
              <button className="sa-btn flex-1" disabled={notifyBusy || !notify.to} data-testid="nf-submit">{notifyBusy ? "Sending…" : "Send email"}</button>
            </div>
          </form>
        </div>
      )}
    </AdminShell>
  );
}
