import React, { createContext, useContext, useEffect, useState } from "react";

const ThemeCtx = createContext(null);
export const useTheme = () => useContext(ThemeCtx);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem("sa_theme") || "light");

  useEffect(() => {
    const el = document.documentElement;
    el.classList.remove("theme-light", "theme-dark");
    el.classList.add(theme === "dark" ? "theme-dark" : "theme-light");
    localStorage.setItem("sa_theme", theme);
  }, [theme]);

  const toggle = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return <ThemeCtx.Provider value={{ theme, setTheme, toggle }}>{children}</ThemeCtx.Provider>;
}
