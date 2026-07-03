import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { Heart, Download, X, Sun, Moon, Upload, Lock, Send, ChevronLeft, ChevronRight } from "lucide-react";
import { pub, API, mediaUrl, apiError } from "@/lib/api";
import useTitle from "@/lib/useTitle";

const sid = (() => {
  let s = sessionStorage.getItem("sa_sid");
  if (!s) { s = Math.random().toString(36).slice(2); sessionStorage.setItem("sa_sid", s); }
  return s;
})();

const INSTRUCTIONS = [
  { n: 1, t: "Heart Your Favourites", d: "Open your Wedding Images folder and tap the heart on your 40 favourite photos." },
  { n: 2, t: "Choose Your Cover", d: "Pick one special image for the front cover of your album." },
  { n: 3, t: "Submit Your Album", d: "Tap the gold heart at the top, then press Submit for Album." },
];

export default function ShareView() {
  const { token } = useParams();
  const [meta, setMeta] = useState(null);
  const [data, setData] = useState(null);
  useTitle(data?.gallery_name || meta?.gallery_name || "Gallery");
  const [password, setPassword] = useState("");
  const [needPw, setNeedPw] = useState(false);
  const [error, setError] = useState("");
  const [active, setActive] = useState(null);
  const [favs, setFavs] = useState({});
  const [favCount, setFavCount] = useState(0);
  const [grant, setGrant] = useState("");
  const [lightbox, setLightbox] = useState(null);
  const [light, setLight] = useState(false);
  const guestInput = useRef();

  const accent = data?.tenant?.accent_color || meta?.tenant?.accent_color || "#D4AF37";
  const brand = data?.tenant?.business_name || meta?.tenant?.business_name || "Gallery";

  useEffect(() => {
    pub.get(`/share/${token}`).then(({ data }) => {
      setMeta(data); setNeedPw(data.needs_password);
      if (!data.needs_password) loadFiles();
    }).catch((e) => setError(apiError(e)));
  }, [token]);

  const applyData = (d) => {
    setData(d);
    setActive((a) => a || d.subfolders[0]);
    setFavCount(d.favourites_count || 0);
    setGrant(d.grant || "");
  };

  const loadFiles = async (pw) => {
    try {
      const { data } = await pub.post(`/share/${token}/access`, { password: pw ?? "" });
      applyData(data); setNeedPw(false); setError("");
      pub.post(`/share/${token}/track-view`, { detail: "opened gallery" }).catch(() => {});
    } catch (e) { setError(apiError(e)); }
  };

  const unlock = (e) => { e.preventDefault(); loadFiles(password); };

  // heartbeat
  useEffect(() => {
    if (!data) return;
    const beat = () => pub.post(`/share/${token}/heartbeat`, { session_id: sid, action: "viewing", subfolder: active || "" }).catch(() => {});
    beat();
    const t = setInterval(beat, 30000);
    return () => clearInterval(t);
  }, [data, active, token]);

  const toggleFav = async (f, e) => {
    e?.stopPropagation();
    try {
      const { data: r } = await pub.post(`/share/${token}/favourite`, { file_id: f.id, session_id: sid });
      setFavs((p) => ({ ...p, [f.id]: r.favourited })); setFavCount(r.count);
    } catch (err) { toast.error(apiError(err)); }
  };

  const submitFavs = async () => {
    try { const { data: r } = await pub.post(`/share/${token}/submit-favourites`, {}); toast.success(`Submitted ${r.count} favourites`); }
    catch (err) { toast.error(apiError(err)); }
  };

  const downloadFile = (f) => { window.open(`${API}/share/${token}/download/${f.id}?grant=${encodeURIComponent(grant)}`, "_blank"); };
  const downloadAll = async () => {
    toast.info("Preparing ZIP…");
    try {
      const res = await pub.post(`/share/${token}/download-zip`, { grant }, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a"); a.href = url; a.download = `${brand}.zip`; a.click(); URL.revokeObjectURL(url);
    } catch (err) { toast.error(apiError(err)); }
  };

  const guestUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const fd = new FormData(); files.forEach((f) => fd.append("files", f));
    try { await pub.post(`/share/${token}/upload`, fd); toast.success("Thank you! Uploaded."); loadFiles(password); }
    catch (err) { toast.error(apiError(err)); }
    finally { if (guestInput.current) guestInput.current.value = ""; }
  };

  if (error && !data && !needPw)
    return <div className="min-h-screen flex items-center justify-center px-6 text-center" style={{ background: "#0A0A0B", color: "#f87171" }} data-testid="share-error">{error}</div>;

  if (needPw)
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ background: "#0A0A0B" }}>
        <form onSubmit={unlock} className="sa-card p-8 w-full max-w-sm text-center" data-testid="share-password-gate">
          <Lock size={26} style={{ color: accent }} className="mx-auto mb-3" />
          <h2 className="font-display text-2xl mb-1">{brand}</h2>
          <p className="text-sm mb-5" style={{ color: "var(--sa-muted)" }}>This gallery is private. Enter your password.</p>
          <input className="sa-input mb-3" type="password" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="share-password-input" />
          {error && <p className="text-sm mb-3" style={{ color: "#f87171" }}>{error}</p>}
          <button className="sa-btn w-full" style={{ background: accent }} data-testid="share-unlock">Unlock gallery</button>
        </form>
      </div>
    );

  if (!data) return <div className="min-h-screen flex items-center justify-center" style={{ background: "#0A0A0B", color: "#71717a" }}>Loading…</div>;

  const files = data.files.filter((f) => f.subfolder === active);
  const idx = lightbox ? files.findIndex((f) => f.id === lightbox.id) : -1;
  const nav = (dir) => { const n = idx + dir; if (n >= 0 && n < files.length) setLightbox(files[n]); };

  return (
    <div className={`min-h-screen flex flex-col ${light ? "theme-light" : "theme-dark"}`} style={{ background: "var(--sa-bg)", color: "var(--sa-text)" }} data-testid="share-view">
      <header className="sticky top-0 z-30 border-b" style={{ borderColor: "var(--sa-border)", background: "var(--sa-header-bg)", backdropFilter: "blur(14px)" }}>
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {data.tenant?.logo_url && <img src={data.tenant.logo_url} alt="logo" className="h-8 object-contain" />}
            <span className="font-display text-xl font-semibold" style={{ color: accent }}>{brand}</span>
          </div>
          <div className="flex items-center gap-2">
            <button className="sa-btn-ghost !py-2" onClick={submitFavs} data-testid="submit-favs">
              <Heart size={15} fill={accent} color={accent} /> {favCount}
            </button>
            <button className="sa-btn-ghost !p-2" onClick={() => setLight((v) => !v)} data-testid="theme-toggle">{light ? <Moon size={15} /> : <Sun size={15} />}</button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-5 py-8 w-full flex-1">
        <h1 className="font-display text-4xl sm:text-5xl mb-1">{data.gallery_name}</h1>
        <p style={{ color: "var(--sa-muted)" }} className="mb-6">A private gallery from {brand}</p>

        {/* instructions */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          {INSTRUCTIONS.map((s) => (
            <div key={s.n} className="sa-card p-5" data-testid={`instruction-${s.n}`}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold mb-2" style={{ background: accent, color: "#0A0A0B" }}>{s.n}</div>
              <h3 className="font-display text-xl mb-1">{s.t}</h3>
              <p className="text-sm" style={{ color: "var(--sa-muted)" }}>{s.d}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div className="flex flex-wrap gap-2">
            {data.subfolders.map((sf) => (
              <button key={sf} onClick={() => setActive(sf)} className="px-4 py-2 rounded text-sm"
                style={{ background: active === sf ? accent : "var(--sa-surface)", color: active === sf ? "#0A0A0B" : "var(--sa-text)", border: "1px solid var(--sa-border)" }}
                data-testid={`share-tab-${sf.toLowerCase().replace(/\s/g, "-")}`}>{sf}</button>
            ))}
          </div>
          <div className="flex gap-2">
            {data.guest_upload_mode && <>
              <input ref={guestInput} type="file" multiple className="hidden" onChange={guestUpload} data-testid="guest-input" />
              <button className="sa-btn-ghost" onClick={() => guestInput.current?.click()} data-testid="guest-upload-btn"><Upload size={15} /> Upload yours</button>
            </>}
            {["download", "full"].includes(data.access_level) &&
              <button className="sa-btn" style={{ background: accent }} onClick={downloadAll} data-testid="download-all"><Download size={16} /> Download All</button>}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {files.map((f) => (
            <div key={f.id} className="sa-card overflow-hidden group relative cursor-pointer aspect-[4/5]" onClick={() => setLightbox(f)} data-testid={`share-file-${f.id}`}>
              {f.file_type === "photo" && f.has_thumb
                ? <img src={mediaUrl("thumb", data.gallery_id, f.subfolder_slug, f.filename)} alt="" className="w-full h-full object-cover" style={{ objectPosition: "center 25%" }} />
                : <div className="w-full h-full flex items-center justify-center text-xs" style={{ color: "var(--sa-muted)" }}>{f.file_type.toUpperCase()}</div>}
              <button onClick={(e) => toggleFav(f, e)} className="absolute top-2 right-2 p-1.5 rounded-full" style={{ background: "rgba(0,0,0,0.4)" }} data-testid={`fav-${f.id}`}>
                <Heart size={16} fill={favs[f.id] ? accent : "transparent"} color={favs[f.id] ? accent : "#fff"} />
              </button>
            </div>
          ))}
          {files.length === 0 && <p className="col-span-full py-10 text-center" style={{ color: "var(--sa-muted)" }}>No files here yet.</p>}
        </div>
      </div>

      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.95)" }} onClick={() => setLightbox(null)} data-testid="lightbox">
          <button className="absolute top-5 right-5 text-white p-2" onClick={() => setLightbox(null)}><X size={24} /></button>
          {idx > 0 && <button className="absolute left-4 text-white p-2" onClick={(e) => { e.stopPropagation(); nav(-1); }}><ChevronLeft size={30} /></button>}
          {idx < files.length - 1 && <button className="absolute right-4 text-white p-2" onClick={(e) => { e.stopPropagation(); nav(1); }}><ChevronRight size={30} /></button>}
          <div className="relative max-w-5xl max-h-[85vh] px-4" onClick={(e) => e.stopPropagation()}>
            {lightbox.file_type === "photo"
              ? <img src={mediaUrl("preview", data.gallery_id, lightbox.subfolder_slug, lightbox.filename)} alt="" className="max-h-[85vh] w-auto mx-auto" />
              : <video src={`${API}/media/original/${data.gallery_id}/${lightbox.subfolder_slug}/${encodeURIComponent(lightbox.filename)}`} controls className="max-h-[85vh]" />}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
              <span className="font-display text-5xl" style={{ color: "#fff", opacity: 0.12, transform: "rotate(-20deg)" }}>{brand}</span>
            </div>
            <div className="flex items-center justify-center gap-3 mt-4">
              <button className="sa-btn-ghost" onClick={() => toggleFav(lightbox)} data-testid="lb-fav"><Heart size={16} fill={favs[lightbox.id] ? accent : "transparent"} color={accent} /> Favourite</button>
              {["download", "full"].includes(data.access_level) &&
                <button className="sa-btn" style={{ background: accent }} onClick={() => downloadFile(lightbox)} data-testid="lb-download"><Download size={16} /> Download</button>}
            </div>
          </div>
        </div>
      )}

      <footer className="studio-footer">Site Designed &amp; Hosted by <span style={{ color: accent, fontWeight: 700 }}>StudioApp</span></footer>
    </div>
  );
}
