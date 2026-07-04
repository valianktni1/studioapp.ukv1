import React from "react";

export default function Footer({ variant = "dark" }) {
  return (
    <footer className="studio-footer" data-testid="studio-footer">
      Site Designed &amp; Hosted by <span style={{ color: "var(--sa-gold)", fontWeight: 700 }}>StudioApp</span>
    </footer>
  );
}
