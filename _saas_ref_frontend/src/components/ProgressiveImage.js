import React, { useState } from "react";

export default function ProgressiveImage({ thumb, preview, alt, className = "", style = {}, ...rest }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={`relative overflow-hidden ${className}`} style={style} {...rest}>
      <img
        src={preview || thumb}
        alt={alt}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className={`progressive-img w-full h-full object-cover ${loaded ? "" : "loading"}`}
        style={{ opacity: loaded ? 1 : 0.7 }}
      />
    </div>
  );
}
