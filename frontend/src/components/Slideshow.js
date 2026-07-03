import React, { useEffect, useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, Volume2, VolumeX, Share2, X, Music } from "lucide-react";
import { mediaUrl } from "@/lib/api";

const TRACKS = [
  { key: "romantic", label: "Romantic", desc: "Soft & tender", src: "/music/romantic.wav" },
  { key: "cinematic", label: "Cinematic", desc: "Grand & sweeping", src: "/music/cinematic.wav" },
  { key: "eternity", label: "Eternity", desc: "Dreamy & gentle", src: "/music/eternity.wav" },
];
const SLIDE_MS = 6000;
const KB = ["kb1", "kb2", "kb3", "kb4"];

export default function Slideshow({ galleryId, photos, couple, brand, accent, onClose }) {
  const [phase, setPhase] = useState("music"); // music -> intro -> playing
  const [track, setTrack] = useState(null);
  const [idx, setIdx] = useState(0);
  const [activeLayer, setActiveLayer] = useState(0);
  const [layers, setLayers] = useState(["", ""]);
  const [kb, setKb] = useState(["kb1", "kb2"]);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const audioRef = useRef(null);
  const previewRef = useRef(null);
  const hideTimer = useRef(null);

  const urlFor = useCallback((f) => mediaUrl("preview", galleryId, f.subfolder_slug, f.filename), [galleryId]);

  // preload all previews at start of playback
  useEffect(() => {
    if (phase !== "playing") return;
    photos.forEach((f) => { const im = new Image(); im.src = urlFor(f); });
  }, [phase, photos, urlFor]);

  // fade helper
  const fadeTo = (target, done) => {
    const a = audioRef.current; if (!a) return done && done();
    const step = (a.volume < target ? 1 : -1) * 0.05;
    const iv = setInterval(() => {
      let v = a.volume + step;
      if ((step > 0 && v >= target) || (step < 0 && v <= target)) { v = target; clearInterval(iv); done && done(); }
      a.volume = Math.max(0, Math.min(1, v));
    }, 30);
  };

  const beginIntro = (t) => {
    setTrack(t);
    setPhase("intro");
    if (t && audioRef.current) {
      audioRef.current.src = t.src; audioRef.current.loop = true; audioRef.current.volume = 0;
      audioRef.current.play().then(() => fadeTo(0.5)).catch(() => {});
    }
    // first slide
    setLayers([urlFor(photos[0]), ""]);
    setKb([KB[Math.floor(Math.random() * 4)], "kb1"]);
    setTimeout(() => setPhase("playing"), 4000);
  };

  // advance slides
  useEffect(() => {
    if (phase !== "playing" || paused || photos.length < 2) return;
    const iv = setInterval(() => {
      setIdx((i) => {
        const next = (i + 1) % photos.length;
        const inactive = activeLayerRef.current === 0 ? 1 : 0;
        setLayers((L) => { const c = [...L]; c[inactive] = urlFor(photos[next]); return c; });
        setKb((K) => { const c = [...K]; c[inactive] = KB[Math.floor(Math.random() * 4)]; return c; });
        setActiveLayer(inactive);
        return next;
      });
    }, SLIDE_MS);
    return () => clearInterval(iv);
  }, [phase, paused, photos, urlFor]);

  const activeLayerRef = useRef(0);
  useEffect(() => { activeLayerRef.current = activeLayer; }, [activeLayer]);

  // controls auto-hide
  const poke = () => {
    setShowControls(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowControls(false), 4000);
  };
  useEffect(() => { poke(); return () => clearTimeout(hideTimer.current); }, []);

  const toggleMute = () => {
    const a = audioRef.current; if (a) { fadeTo(muted ? 0.5 : 0); } setMuted((m) => !m);
  };

  const close = () => { if (audioRef.current) fadeTo(0, () => { audioRef.current.pause(); onClose(); }); else onClose(); };

  const share = () => { navigator.clipboard.writeText(window.location.href); toast.success("Gallery link copied"); };

  // keyboard
  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") close();
      else if (e.code === "Space") { e.preventDefault(); setPaused((p) => !p); }
      else if (e.key.toLowerCase() === "m") toggleMute();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }); // eslint-disable-line

  const previewTrack = (t) => {
    const p = previewRef.current; if (!p) return;
    p.src = t.src; p.volume = 0.5; p.currentTime = 0; p.play().catch(() => {});
    setTimeout(() => { try { p.pause(); } catch {} }, 12000);
  };

  return (
    <div className="fixed inset-0 z-[60]" style={{ background: "#000" }} onMouseMove={poke} data-testid="slideshow">
      <audio ref={audioRef} />
      <audio ref={previewRef} />

      {/* MUSIC PICKER */}
      {phase === "music" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6" data-testid="music-picker">
          <p className="sa-label" style={{ color: "rgba(255,255,255,0.6)", letterSpacing: "0.35em" }}>A slideshow for</p>
          <h2 className="font-display italic text-5xl sm:text-6xl mb-8" style={{ color: "#fff" }}>{couple}</h2>
          <p className="text-sm mb-5" style={{ color: "rgba(255,255,255,0.6)" }}>Choose a soundtrack</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl mb-8">
            {TRACKS.map((t) => (
              <button key={t.key} onClick={() => { setTrack(t); previewTrack(t); }}
                className="p-5 rounded-lg text-center transition-transform hover:scale-[1.02]"
                style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${track?.key === t.key ? accent : "rgba(255,255,255,0.14)"}` }}
                data-testid={`track-${t.key}`}>
                <Music size={20} style={{ color: accent }} className="mx-auto mb-2" />
                <div className="font-display text-xl" style={{ color: "#fff" }}>{t.label}</div>
                <div className="text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>{t.desc}</div>
              </button>
            ))}
          </div>
          <button onClick={() => { try { previewRef.current?.pause(); } catch {} beginIntro(track); }} disabled={!track}
            className="px-8 py-3 rounded-full font-semibold" style={{ background: accent, color: "#0A0A0B", opacity: track ? 1 : 0.5 }} data-testid="start-slideshow">
            Start Slideshow
          </button>
          <button onClick={() => { try { previewRef.current?.pause(); } catch {} beginIntro(null); }} className="mt-4 text-sm underline" style={{ color: "rgba(255,255,255,0.6)" }} data-testid="start-no-music">or continue without music</button>
          <button onClick={close} className="absolute top-5 right-5 text-white p-2" data-testid="slideshow-close-picker"><X size={24} /></button>
        </div>
      )}

      {/* INTRO */}
      <AnimatePresence>
        {phase === "intro" && (
          <motion.div key="intro" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 flex flex-col items-center justify-center text-center px-6" style={{ background: "#000", zIndex: 5 }}>
            <div className="flex items-center gap-3 mb-4"><span style={{ height: 1, width: 50, background: accent }} /><span style={{ color: accent }}>&#10022;</span><span style={{ height: 1, width: 50, background: accent }} /></div>
            <h1 className="font-display italic text-6xl sm:text-8xl" style={{ color: "#fff" }}>{couple}</h1>
            <p className="sa-label mt-4" style={{ color: "rgba(255,255,255,0.6)", letterSpacing: "0.3em" }}>Your Wedding Gallery</p>
            <p className="text-sm mt-2" style={{ color: "rgba(255,255,255,0.5)" }}>{photos.length} moments</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SLIDES */}
      {(phase === "playing" || phase === "intro") && (
        <div className="absolute inset-0 overflow-hidden">
          {[0, 1].map((li) => (
            <img key={li} src={layers[li] || undefined} alt=""
              className={`absolute inset-0 w-full h-full object-contain ${!paused && activeLayer === li ? `kb ${kb[li]}` : ""}`}
              style={{ opacity: activeLayer === li ? 1 : 0, transition: "opacity 2s ease-in-out" }} />
          ))}
          <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.25), transparent 30%, transparent 70%, rgba(0,0,0,0.35))" }} />
          <div className="absolute top-5 left-6 font-display italic text-lg" style={{ color: "rgba(255,255,255,0.45)" }}>{brand}</div>
          <div className="absolute bottom-6 inset-x-0 text-center font-display italic text-2xl" style={{ color: "rgba(255,255,255,0.6)" }}>{couple}</div>
        </div>
      )}

      {/* CONTROLS */}
      {phase === "playing" && (
        <div className="absolute top-5 right-5 flex items-center gap-2 transition-opacity duration-500" style={{ opacity: showControls ? 1 : 0, pointerEvents: showControls ? "auto" : "none", zIndex: 10 }} data-testid="slideshow-controls">
          {track && <button onClick={toggleMute} className="p-2.5 rounded-full text-white" style={{ background: "rgba(255,255,255,0.14)", backdropFilter: "blur(8px)" }} data-testid="ss-mute">{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>}
          <button onClick={() => setPaused((p) => !p)} className="p-2.5 rounded-full text-white" style={{ background: "rgba(255,255,255,0.14)", backdropFilter: "blur(8px)" }} data-testid="ss-play">{paused ? <Play size={18} /> : <Pause size={18} />}</button>
          <button onClick={share} className="p-2.5 rounded-full text-white" style={{ background: "rgba(255,255,255,0.14)", backdropFilter: "blur(8px)" }} data-testid="ss-share"><Share2 size={18} /></button>
          <button onClick={close} className="p-2.5 rounded-full text-white" style={{ background: "rgba(255,255,255,0.14)", backdropFilter: "blur(8px)" }} data-testid="ss-close"><X size={18} /></button>
        </div>
      )}

      {/* PROGRESS */}
      {phase === "playing" && (
        <div className="absolute bottom-16 inset-x-0 flex items-center justify-center gap-1.5 transition-opacity duration-500" style={{ opacity: showControls ? 1 : 0 }}>
          {photos.length <= 30
            ? photos.map((_, i) => <span key={i} className="rounded-full" style={{ height: 4, width: i === idx ? 22 : 4, background: i === idx ? accent : "rgba(255,255,255,0.4)", transition: "width .3s" }} />)
            : <span className="text-sm" style={{ color: "rgba(255,255,255,0.7)" }}>{idx + 1} / {photos.length}</span>}
        </div>
      )}
    </div>
  );
}
