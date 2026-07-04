import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X, ChevronLeft, ChevronRight, Heart, Download, Loader2 } from "lucide-react";
import { mediaUrl } from "@/lib/api";
import VideoPlayer from "@/components/VideoPlayer";

// Progressive image: instant blurred thumb, crossfades to sharp preview.
const ProgressiveShot = ({ galleryId, file }) => {
  const [loaded, setLoaded] = useState(false);
  const thumb = mediaUrl("thumb", galleryId, file.subfolder_slug, file.filename);
  const preview = mediaUrl("preview", galleryId, file.subfolder_slug, file.filename);
  useEffect(() => {
    setLoaded(false);
    const img = new Image();
    img.src = preview;
    img.onload = () => setLoaded(true);
  }, [preview]);
  return (
    <div className="relative flex items-center justify-center">
      <img src={thumb} alt="" className="max-h-[85vh] w-auto mx-auto" style={{ filter: loaded ? "blur(0)" : "blur(12px)", transition: "filter .4s ease-out" }} />
      <img src={preview} alt="" className="absolute inset-0 max-h-[85vh] w-auto mx-auto m-auto" style={{ opacity: loaded ? 1 : 0, transition: "opacity .4s ease-out" }} />
    </div>
  );
};

export default function ShareLightbox({ token, galleryId, files, current, onClose, onNav, accent, logo, canDownload, faved, onFav, onDownload, dlPercent }) {
  const idx = files.findIndex((f) => f.id === current.id);

  // keyboard nav
  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") onNav(-1);
      else if (e.key === "ArrowRight") onNav(1);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, onNav]);

  // smart preload next 3 previews
  useEffect(() => {
    for (let k = 1; k <= 3; k++) {
      const n = files[idx + k];
      if (n && n.file_type === "photo") { const im = new Image(); im.src = mediaUrl("preview", galleryId, n.subfolder_slug, n.filename); }
    }
  }, [idx, files, galleryId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.95)" }} onClick={onClose} data-testid="lightbox">
      <button className="absolute top-5 right-5 text-white p-2 z-10" onClick={onClose} data-testid="lb-close"><X size={24} /></button>
      <div className="absolute top-5 left-5 flex items-center gap-2 z-10" onClick={(e) => e.stopPropagation()}>
        <button className="p-2.5 rounded-full" style={{ background: "rgba(255,255,255,0.14)", backdropFilter: "blur(8px)" }} onClick={() => onFav(current)} data-testid="lb-fav">
          <Heart size={18} fill={faved ? accent : "transparent"} color={faved ? accent : "#fff"} />
        </button>
        {canDownload && current.file_type !== "video" && (
          <button className="flex items-center gap-1.5 px-3 py-2 rounded-full text-white text-sm" style={{ background: "rgba(255,255,255,0.14)", backdropFilter: "blur(8px)" }} onClick={() => onDownload(current)} data-testid="lb-download">
            {dlPercent != null ? <><Loader2 size={15} className="animate-spin" /> {dlPercent}%</> : <><Download size={16} /> Download</>}
          </button>
        )}
      </div>
      {idx > 0 && <button className="absolute left-4 text-white p-2 z-10" onClick={(e) => { e.stopPropagation(); onNav(-1); }} data-testid="lb-prev"><ChevronLeft size={30} /></button>}
      {idx < files.length - 1 && <button className="absolute right-4 text-white p-2 z-10" onClick={(e) => { e.stopPropagation(); onNav(1); }} data-testid="lb-next"><ChevronRight size={30} /></button>}

      <motion.div key={current.id} initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.25 }} className="relative max-w-5xl max-h-[85vh] px-4" onClick={(e) => e.stopPropagation()}>
        {current.file_type === "photo"
          ? <ProgressiveShot galleryId={galleryId} file={current} />
          : <VideoPlayer token={token} file={current} />}
        {logo && current.file_type === "photo" && <img src={logo} alt="" className="absolute bottom-3 right-6 pointer-events-none select-none" style={{ width: 110, opacity: 0.45 }} />}
      </motion.div>

      <div className="absolute bottom-5 inset-x-0 text-center text-sm pointer-events-none" style={{ color: "rgba(255,255,255,0.75)" }}>{idx + 1} / {files.length}</div>
    </div>
  );
}
