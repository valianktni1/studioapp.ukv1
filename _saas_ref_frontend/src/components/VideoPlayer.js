import React, { useEffect, useRef, useState } from "react";
import videojs from "video.js";
import "video.js/dist/video-js.css";
import { pub, API } from "@/lib/api";

// video.js player that streams the web-optimised (NGINX secure_link) version, or the original as fallback.
export default function VideoPlayer({ token, file }) {
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const [src, setSrc] = useState(null);

  useEffect(() => {
    let cancelled = false;
    pub.get(`/share/${token}/video-url/${file.id}`)
      .then(({ data }) => { if (!cancelled) setSrc(data.url); })
      .catch(() => { if (!cancelled) setSrc(`${API}/media/original/${file.gallery_id || ""}`); });
    return () => { cancelled = true; };
  }, [token, file.id]); // eslint-disable-line

  useEffect(() => {
    if (!src || playerRef.current) return;
    const el = videoRef.current;
    if (!el) return;
    playerRef.current = videojs(el, {
      controls: true, autoplay: true, preload: "auto", fluid: true,
      playbackRates: [0.5, 1, 1.25, 1.5, 2],
      sources: [{ src, type: "video/mp4" }],
    });
    return () => { if (playerRef.current) { playerRef.current.dispose(); playerRef.current = null; } };
  }, [src]);

  if (!src) return <div className="flex items-center justify-center h-[60vh] w-[80vw] text-white">Loading video…</div>;
  return (
    <div className="w-[85vw] max-w-4xl" data-testid="video-player" onClick={(e) => e.stopPropagation()}>
      <div data-vjs-player>
        <video ref={videoRef} className="video-js vjs-big-play-centered" playsInline />
      </div>
    </div>
  );
}
