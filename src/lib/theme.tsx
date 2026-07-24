"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type Mode = "light" | "dark";
export type ColorTheme = "teal" | "indigo" | "rose";
export type NavFont = "michroma" | "exo2" | "rajdhani";

interface ThemeContextValue {
  mode: Mode;
  colorTheme: ColorTheme;
  navFont: NavFont;
  toggleMode: () => void;
  setColorTheme: (theme: ColorTheme) => void;
  setNavFont: (font: NavFont) => void;
  /** Legacy alias for mode */
  theme: Mode;
  /** Legacy alias for toggleMode */
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: "light",
  colorTheme: "teal",
  navFont: "michroma",
  toggleMode: () => {},
  setColorTheme: () => {},
  setNavFont: () => {},
  theme: "light",
  toggle: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export const COLOR_THEMES: { id: ColorTheme; label: string; preview: string }[] = [
  { id: "teal", label: "Teal", preview: "#0d9488" },
  { id: "indigo", label: "Indigo", preview: "#6366f1" },
  { id: "rose", label: "Rose", preview: "#e11d48" },
];

export const NAV_FONTS: { id: NavFont; label: string; cssVar: string }[] = [
  { id: "michroma", label: "Space", cssVar: "--font-michroma" },
  { id: "exo2", label: "Tech", cssVar: "--font-exo2" },
  { id: "rajdhani", label: "Sharp", cssVar: "--font-rajdhani" },
];

function applyThemeClasses(mode: Mode, colorTheme: ColorTheme) {
  const root = document.documentElement;

  // Mode
  if (mode === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }

  // Color theme - remove all theme classes, add current
  COLOR_THEMES.forEach((t) => root.classList.remove(`theme-${t.id}`));
  root.classList.add(`theme-${colorTheme}`);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>("light");
  const [colorTheme, setColorThemeState] = useState<ColorTheme>("teal");
  const [navFont, setNavFontState] = useState<NavFont>("michroma");

  // Initialize from localStorage on mount
  useEffect(() => {
    const storedMode = localStorage.getItem("theme") as Mode | null;
    const storedColor = localStorage.getItem("color-theme") as ColorTheme | null;
    const storedNavFont = localStorage.getItem("nav-font") as NavFont | null;

    const resolvedMode = storedMode || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const resolvedColor = storedColor && COLOR_THEMES.some((t) => t.id === storedColor) ? storedColor : "teal";
    const resolvedNavFont = storedNavFont && NAV_FONTS.some((f) => f.id === storedNavFont) ? storedNavFont : "michroma";

    requestAnimationFrame(() => {
      setMode(resolvedMode);
      setColorThemeState(resolvedColor);
      setNavFontState(resolvedNavFont);
    });
  }, []);

  // Sync classes + localStorage when mode or color theme changes
  useEffect(() => {
    applyThemeClasses(mode, colorTheme);
    localStorage.setItem("theme", mode);
    localStorage.setItem("color-theme", colorTheme);
  }, [mode, colorTheme]);

  // Sync nav font to localStorage
  useEffect(() => {
    localStorage.setItem("nav-font", navFont);
  }, [navFont]);

  const toggleMode = () => setMode((m) => (m === "dark" ? "light" : "dark"));

  const setColorTheme = (theme: ColorTheme) => {
    if (COLOR_THEMES.some((t) => t.id === theme)) {
      setColorThemeState(theme);
    }
  };

  const setNavFont = (font: NavFont) => {
    if (NAV_FONTS.some((f) => f.id === font)) {
      setNavFontState(font);
    }
  };

  return (
    <ThemeContext value={{
      mode,
      colorTheme,
      navFont,
      toggleMode,
      setColorTheme,
      setNavFont,
      // Legacy aliases
      theme: mode,
      toggle: toggleMode,
    }}>
      {children}
    </ThemeContext>
  );
}
