"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

type Theme = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  toggle: () => {},
});

function applyTheme(t: Theme) {
  document.documentElement.setAttribute("data-theme", t);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", t === "light" ? "#f5f5fa" : "#08080d");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");

  // Sync with the value the inline <script> already applied
  useEffect(() => {
    const stored = localStorage.getItem("agentverse_theme") as Theme | null;
    const preferred = stored || (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    setTheme(preferred);
    applyTheme(preferred);

    // If user hasn't manually chosen a theme, follow system changes in real time
    if (!stored) {
      const mq = window.matchMedia("(prefers-color-scheme: light)");
      const handler = (e: MediaQueryListEvent) => {
        const next: Theme = e.matches ? "light" : "dark";
        setTheme(next);
        applyTheme(next);
      };
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, []);

  const toggle = () => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem("agentverse_theme", next);
      applyTheme(next);
      return next;
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
