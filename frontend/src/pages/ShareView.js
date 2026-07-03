import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Heart, Download, X, Sun, Moon, Upload, Lock, ChevronLeft, ChevronRight, ArrowLeft, ShoppingBag, Play, FolderOpen, Check, Image as ImageIcon } from "lucide-react";
import { pub, API, mediaUrl, apiError } from "@/lib/api";
import useTitle from "@/lib/useTitle";

const sid = (() => {
  let s = sessionStorage.getItem("sa_sid");
  if (!s) { s = Math.random().toString(36).slice(2); sessionStorage.setItem("sa_sid", s); }
  return s;
})();

const FAV_VIEW = "__favourites__";

const INSTRUCTIONS = [
  { icon: Heart, t: "Heart Your Favourites", d: "Open your Wedding Images folder and tap the heart on your favourite photos." },
  { icon: ImageIcon, t: "Choose Your Cover", d: "Pick one special image for the front cover of your album." },
  { icon: Check, t: "Submit Your Album", d: "Tap the gold heart at the top, then press Submit for Album." },
];

const coupleName = (name) => {
  if (!name) return "";
  const cleaned = name.replace(/\s*[-–—]?\s*(\d{1,2}[.\/-]\d{1,2}([.\/-]\d{2,4})?|\d{4})\s*$/, "").trim();
  return cleaned || name;
};

const Diamond = ({ accent }) => (
  <div className="flex items-center justify-center gap-3 my-4">
    <span style={{ height: 1, width: 60, background: `linear-gradient(90deg, transparent, ${accent})` }} />
    <span style={{ color: accent, fontSize: 14 }}>&#10022;</span>
    <span style={{ height: 1, width: 60, background: `linear-gradient(270deg, transparent, ${accent})` }} />
  </div>
);

export default function ShareView() {
  const { token } = useParams();
  const [meta, setMeta] = useState(null);
  const [data, setData] = useState(null);
  useTitle(data?.gallery_name || meta?.gallery_name || "Gallery");
  const [password, setPassword] = useState("");
  const [needPw, setNeedPw] = useState(false);
  const [error, setError] = useState("");
  const [openAlbum, setOpenAlbum] = useState(null); // null = landing
  const [favs, setFavs] = useState({});
  const [favCount, setFavCount] = useState(0);
  const [grant, setGrant] = useState("");
  const [lightbox, setLightbox] = useState(null);
  const [light, setLight] = useState(() => localStorage.getItem("gallery_dark_mode") === "light");
  const guestInput = useRef();

  useEffect(() => { localStorage.setItem("gallery_dark_mode", light ? "light" : "dark"); }, [light]);

  const accent = data?.tenant?.accent_color || meta?.tenant?.accent_color || "#D4AF37";
  const brand = data?.tenant?.business_name || meta?.tenant?.business_name || "Gallery";
  const logo = data?.tenant?.logo_url || meta?.tenant?.logo_url;

  useEffect(() => {
    pub.get(`/share/${token}`).then(({ data }) => {
      setMeta(data); setNeedPw(data.needs_password);
      if (!data.needs_password) loadFiles();
    }).catch((e) => setError(apiError(e)));
  }, [token]); // eslint-disable-line

  const applyData = (d) => {
    setData(d);
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
    const beat = () => pub.post(`/share/${token}/heartbeat`, { session_id: sid, action: openAlbum ? `viewing ${openAlbum}` : "browsing", subfolder: openAlbum || "" }).catch(() => {});
    beat();
    const t = setInterval(beat, 30000);
    return () => clearInterval(t);
  }, [data, openAlbum, token]);

  const toggleFav = async (f, e) => {
    e?.stopPropagation();
    try {
      const { data: r } = await pub.post(`/share/${token}/favourite`, { file_id: f.id, session_id: sid });
      setFavs((p) => ({ ...p, [f.id]: r.favourited })); setFavCount(r.count);
    } catch (err) { toast.error(apiError(err)); }
  };

  const submitFavs = async () => {
    try { const { data: r } = await pub.post(`/share/${token}/submit-favourites`, {}); toast.success(`Submitted ${r.count} favourites for your album`); }
    catch (err) { toast.error(apiError(err)); }
  };

  const downloadFile = (f) => { window.open(`${API}/share/${token}/download/${f.id}?grant=${encodeURIComponent(grant)}`, "_blank"); };
  const downloadAll = async () => {
    toast.info("Preparing your ZIP…");
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

  const themeClass = light ? "theme-light" : "theme-dark";

  if (error && !data && !needPw)
    return <div className={`${themeClass} min-h-screen flex items-center justify-center px-6 text-center`} style={{ background: "var(--sa-bg)", color: "#f87171" }} data-testid="share-error">{error}</div>;

  if (needPw)
    return (
      <div className={`${themeClass} min-h-screen flex items-center justify-center px-6`} style={{ background: "var(--sa-bg)" }}>
        <form onSubmit={unlock} className="sa-card p-8 w-full max-w-sm text-center" data-testid="share-password-gate">
          {logo && <img src={logo} alt={brand} className="h-12 object-contain mx-auto mb-4" />}
          <Lock size={26} style={{ color: accent }} className="mx-auto mb-3" />
          <h2 className="font-display text-2xl mb-1" style={{ fontStyle: "italic" }}>{brand}</h2>
          <p className="text-sm mb-5" style={{ color: "var(--sa-muted)" }}>This gallery is private. Enter your password.</p>
          <input className="sa-input mb-3" type="password" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="share-password-input" />
          {error && <p className="text-sm mb-3" style={{ color: "#f87171" }}>{error}</p>}
          <button className="sa-btn w-full" style={{ background: accent }} data-testid="share-unlock">Unlock gallery</button>
        </form>
      </div>
    );

  if (!data) return <div className={`${themeClass} min-h-screen flex items-center justify-center`} style={{ background: "var(--sa-bg)", color: "var(--sa-muted)" }}>Loading…</div>;

  // ---- helpers over data ----
  const fileById = (id) => data.files.find((f) => f.id === id);
  const photoInSub = (sf) => data.files.find((f) => f.subfolder === sf && f.file_type === "photo" && f.has_thumb) || data.files.find((f) => f.subfolder === sf);
  const coverFileFor = (sf) => {
    const cid = data.covers?.[sf];
    const c = cid ? fileById(cid) : null;
    if (c) return c;
    return photoInSub(sf);
  };
  const coverUrl = (sf, kind = "preview") => {
    const f = coverFileFor(sf);
    return f && f.file_type === "photo" ? mediaUrl(kind, data.gallery_id, f.subfolder_slug, f.filename) : null;
  };
  const countIn = (sf) => data.files.filter((f) => f.subfolder === sf).length;

  const photoSubs = data.subfolders.filter((sf) => data.files.some((f) => f.subfolder === sf && f.file_type === "photo"));
  const heroSub = data.subfolders.find((sf) => /wedding/i.test(sf) && /image/i.test(sf)) || photoSubs[0] || data.subfolders[0];
  const heroImg = heroSub ? coverUrl(heroSub, "preview") : null;
  const couple = coupleName(data.gallery_name);

  const canDownload = ["download", "full"].includes(data.access_level);

  // files for current album view
  const albumFiles = openAlbum === FAV_VIEW
    ? data.files.filter((f) => favs[f.id])
    : data.files.filter((f) => f.subfolder === openAlbum);
  const idx = lightbox ? albumFiles.findIndex((f) => f.id === lightbox.id) : -1;
  const navLb = (dir) => { const n = idx + dir; if (n >= 0 && n < albumFiles.length) setLightbox(albumFiles[n]); };

  const openPrints = () => toast.info("Print ordering is coming soon.");
  const openSlideshow = () => toast.info("The cinematic slideshow is coming soon.");

  // ---------- LANDING ----------
  if (openAlbum === null) {
    return (
      <div className={`${themeClass} min-h-screen flex flex-col`} style={{ background: "var(--sa-bg)", color: "var(--sa-text)" }} data-testid="share-view">
        {/* Floating header over hero */}
        <header className="absolute top-0 inset-x-0 z-20">
          <div className="max-w-6xl mx-auto px-5 h-20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {logo
                ? <img src={logo} alt={brand} className="h-9 object-contain" style={{ filter: "brightness(0) invert(1)" }} />
                : <span className="font-display text-xl font-semibold italic" style={{ color: "#fff" }}>{brand}</span>}
            </div>
            <div className="flex items-center gap-2">
              {favCount > 0 && (
                <button onClick={() => setOpenAlbum(FAV_VIEW)} className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm" style={{ background: "rgba(255,255,255,0.16)", color: "#fff", backdropFilter: "blur(8px)" }} data-testid="hero-fav-count">
                  <Heart size={15} fill={accent} color={accent} /> {favCount}
                </button>
              )}
              <button onClick={openPrints} className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold" style={{ background: accent, color: "#0A0A0B" }} data-testid="order-prints">
                <ShoppingBag size={15} /> Order Prints
              </button>
              <button onClick={() => setLight((v) => !v)} className="p-2.5 rounded-full" style={{ background: "rgba(255,255,255,0.16)", color: "#fff", backdropFilter: "blur(8px)" }} data-testid="theme-toggle">{light ? <Moon size={16} /> : <Sun size={16} />}</button>
            </div>
          </div>
        </header>

        {/* HERO */}
        <section className="relative overflow-hidden" style={{ minHeight: "78vh" }} data-testid="hero">
          {heroImg
            ? <img src={heroImg} alt={couple} className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: "center 25%", transform: "scale(1.05)", filter: "blur(2px) brightness(0.55)" }} />
            : <div className="absolute inset-0" style={{ background: "linear-gradient(135deg,#111,#333)" }} />}
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.15) 40%, rgba(0,0,0,0.55) 100%)" }} />
          <div className="relative z-10 min-h-[78vh] flex flex-col items-center justify-center text-center px-6 py-28">
            <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
              className="sa-label" style={{ color: "rgba(255,255,255,0.75)", letterSpacing: "0.35em" }}>Welcome</motion.p>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}><Diamond accent={accent} /></motion.div>
            <motion.h1 initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
              className="font-display italic font-medium leading-none text-5xl sm:text-7xl lg:text-8xl" style={{ color: "#FFFFFF", textShadow: "0 2px 30px rgba(0,0,0,0.5)" }} data-testid="couple-name">{couple}</motion.h1>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}><Diamond accent={accent} /></motion.div>
            <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}
              className="text-lg" style={{ color: "rgba(255,255,255,0.85)" }}>Your special memories, beautifully captured.</motion.p>
          </div>
        </section>

        <main className="max-w-6xl mx-auto px-5 w-full flex-1">
          {/* Instruction cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 -mt-10 relative z-10 mb-14">
            {INSTRUCTIONS.map((s, i) => (
              <motion.div key={s.t} className="sa-card p-6 text-center" initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }} data-testid={`instruction-${i + 1}`}>
                <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: `${accent}22` }}><s.icon size={20} style={{ color: accent }} /></div>
                <h3 className="font-display text-2xl mb-1">{s.t}</h3>
                <p className="text-sm" style={{ color: "var(--sa-muted)" }}>{s.d}</p>
              </motion.div>
            ))}
          </div>

          {/* Album cards */}
          <h2 className="font-display italic text-3xl mb-6 text-center">Your Albums</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 mb-16">
            {data.subfolders.map((sf, i) => {
              const img = coverUrl(sf, "preview");
              return (
                <motion.button key={sf} onClick={() => { setOpenAlbum(sf); window.scrollTo(0, 0); }}
                  initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }}
                  className="album-card group relative rounded-lg overflow-hidden text-left" style={{ aspectRatio: "4/3", border: "1px solid var(--sa-border)" }} data-testid={`album-card-${sf.toLowerCase().replace(/\s/g, "-")}`}>
                  {img
                    ? <img src={img} alt={sf} className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" style={{ objectPosition: "center 25%" }} />
                    : <div className="absolute inset-0 flex items-center justify-center" style={{ background: "var(--sa-surface-2)" }}><FolderOpen size={34} style={{ color: "var(--sa-muted)" }} /></div>}
                  <div className="absolute inset-0" style={{ background: "linear-gradient(0deg, rgba(0,0,0,0.75) 0%, transparent 55%)" }} />
                  <div className="absolute bottom-0 inset-x-0 p-4">
                    <h3 className="font-display italic text-2xl" style={{ color: "#fff", textShadow: "0 1px 6px rgba(0,0,0,0.6)" }}>{sf}</h3>
                    <p className="text-xs" style={{ color: "rgba(255,255,255,0.8)" }}>{countIn(sf)} {countIn(sf) === 1 ? "item" : "items"}</p>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </main>

        <footer className="studio-footer">Site Designed &amp; Hosted by <span style={{ color: accent, fontWeight: 700 }}>StudioApp</span></footer>
      </div>
    );
  }

  // ---------- ALBUM / FAVOURITES VIEW ----------
  const isFavView = openAlbum === FAV_VIEW;
  const isVideoAlbum = !isFavView && /video/i.test(openAlbum);
  return (
    <div className={`${themeClass} min-h-screen flex flex-col`} style={{ background: "var(--sa-bg)", color: "var(--sa-text)" }} data-testid="share-view">
      <header className="sticky top-0 z-30 border-b" style={{ borderColor: "var(--sa-border)", background: "var(--sa-header-bg)", backdropFilter: "blur(16px)" }}>
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between gap-3">
          <button onClick={() => { setOpenAlbum(null); window.scrollTo(0, 0); }} className="flex items-center gap-2 text-sm" style={{ color: "var(--sa-text)" }} data-testid="album-back">
            <ArrowLeft size={17} /> <span className="hidden sm:inline">All albums</span>
          </button>
          <div className="text-center min-w-0">
            <div className="font-display italic text-xl truncate">{isFavView ? "Your Favourites" : openAlbum}</div>
            <div className="text-[11px] truncate" style={{ color: "var(--sa-muted)" }}>{couple} &middot; {albumFiles.length} {albumFiles.length === 1 ? "item" : "items"}</div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setOpenAlbum(FAV_VIEW)} className="sa-btn-ghost !py-2 !px-3" data-testid="header-favs"><Heart size={15} fill={accent} color={accent} /> {favCount}</button>
            {!isFavView && !isVideoAlbum && <button onClick={openSlideshow} className="sa-btn-ghost !py-2 !px-3" data-testid="slideshow-btn"><Play size={15} /> <span className="hidden sm:inline">Slideshow</span></button>}
            <button onClick={() => setLight((v) => !v)} className="sa-btn-ghost !p-2" data-testid="theme-toggle">{light ? <Moon size={15} /> : <Sun size={15} />}</button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 py-8 w-full flex-1">
        {isFavView && (
          <div className="flex items-center justify-between gap-3 mb-6">
            <p style={{ color: "var(--sa-muted)" }} className="text-sm">Heart your favourite photos, then submit them for your album.</p>
            <div className="flex gap-2">
              <button className="sa-btn" style={{ background: accent }} onClick={submitFavs} data-testid="submit-favs"><Check size={16} /> Submit for Album</button>
              {canDownload && albumFiles.length > 0 && <button className="sa-btn-ghost" onClick={downloadAll} data-testid="download-favs"><Download size={16} /> Download</button>}
            </div>
          </div>
        )}

        {!isFavView && (
          <div className="sa-card p-4 mb-6 flex flex-col sm:flex-row sm:items-center gap-3 justify-between" data-testid="album-info-banner">
            <p className="text-sm" style={{ color: "var(--sa-muted)" }}>
              {isVideoAlbum
                ? "Your videos are ready for online viewing, optimised for smooth streaming. You can also download the full high-quality originals."
                : "The small logo on your images is only visible here in your online gallery. Downloaded photos are completely watermark-free and in full quality."}
            </p>
            <div className="flex gap-2 shrink-0">
              {data.guest_upload_mode && <>
                <input ref={guestInput} type="file" multiple className="hidden" onChange={guestUpload} data-testid="guest-input" />
                <button className="sa-btn-ghost" onClick={() => guestInput.current?.click()} data-testid="guest-upload-btn"><Upload size={15} /> Upload yours</button>
              </>}
              {canDownload && <button className="sa-btn" style={{ background: accent }} onClick={downloadAll} data-testid="download-all"><Download size={16} /> Download All</button>}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {albumFiles.map((f, i) => (
            <motion.div key={f.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i * 0.02, 0.5) }}
              className="sa-card overflow-hidden group relative cursor-pointer aspect-[4/5]" onClick={() => setLightbox(f)} data-testid={`share-file-${f.id}`}>
              {f.file_type === "photo" && f.has_thumb
                ? <img src={mediaUrl("thumb", data.gallery_id, f.subfolder_slug, f.filename)} alt="" loading="lazy" className="w-full h-full object-cover" style={{ objectPosition: "center 25%" }} />
                : f.file_type === "video"
                  ? <div className="w-full h-full flex items-center justify-center" style={{ background: "#000" }}><Play size={28} color="#fff" /></div>
                  : <div className="w-full h-full flex items-center justify-center text-xs" style={{ color: "var(--sa-muted)" }}>{f.file_type.toUpperCase()}</div>}
              {logo && f.file_type === "photo" && <img src={logo} alt="" className="absolute bottom-1 right-1 pointer-events-none" style={{ width: 56, opacity: 0.7 }} />}
              <button onClick={(e) => toggleFav(f, e)} className="absolute bottom-2 left-2 p-2 rounded-full" style={{ background: favs[f.id] ? accent : "rgba(255,255,255,0.9)" }} data-testid={`fav-${f.id}`}>
                <Heart size={15} fill={favs[f.id] ? "#fff" : "transparent"} color={favs[f.id] ? "#fff" : "#1a1a1a"} />
              </button>
            </motion.div>
          ))}
          {albumFiles.length === 0 && <p className="col-span-full py-16 text-center" style={{ color: "var(--sa-muted)" }}>{isFavView ? "No favourites yet — tap the heart on the photos you love." : "No files here yet."}</p>}
        </div>
      </main>

      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.95)" }} onClick={() => setLightbox(null)} data-testid="lightbox">
          <button className="absolute top-5 right-5 text-white p-2" onClick={() => setLightbox(null)}><X size={24} /></button>
          {idx > 0 && <button className="absolute left-4 text-white p-2" onClick={(e) => { e.stopPropagation(); navLb(-1); }}><ChevronLeft size={30} /></button>}
          {idx < albumFiles.length - 1 && <button className="absolute right-4 text-white p-2" onClick={(e) => { e.stopPropagation(); navLb(1); }}><ChevronRight size={30} /></button>}
          <motion.div key={lightbox.id} initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} className="relative max-w-5xl max-h-[85vh] px-4" onClick={(e) => e.stopPropagation()}>
            {lightbox.file_type === "photo"
              ? <img src={mediaUrl("preview", data.gallery_id, lightbox.subfolder_slug, lightbox.filename)} alt="" className="max-h-[85vh] w-auto mx-auto" />
              : <video src={`${API}/media/original/${data.gallery_id}/${lightbox.subfolder_slug}/${encodeURIComponent(lightbox.filename)}`} controls autoPlay className="max-h-[85vh]" />}
            {logo && lightbox.file_type === "photo" && <img src={logo} alt="" className="absolute bottom-16 right-6 pointer-events-none" style={{ width: 100, opacity: 0.45 }} />}
            <div className="flex items-center justify-center gap-3 mt-4">
              <button className="sa-btn-ghost" style={{ color: "#fff", borderColor: "rgba(255,255,255,0.4)" }} onClick={() => toggleFav(lightbox)} data-testid="lb-fav"><Heart size={16} fill={favs[lightbox.id] ? accent : "transparent"} color={accent} /> Favourite</button>
              {canDownload && <button className="sa-btn" style={{ background: accent }} onClick={() => downloadFile(lightbox)} data-testid="lb-download"><Download size={16} /> Download</button>}
            </div>
          </motion.div>
        </div>
      )}

      <footer className="studio-footer">Site Designed &amp; Hosted by <span style={{ color: accent, fontWeight: 700 }}>StudioApp</span></footer>
    </div>
  );
}
