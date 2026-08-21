"use client";

import { useState } from "react";
import { Icon } from "./Icon";

const storageKey = "theme";

export function themeInitialValue() {
  if (typeof window === "undefined") return "light";
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    // fall through to the system preference
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme: "dark" | "light") {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function ThemeToggle() {
  // The <head> script applies the saved/system theme before hydration, so the
  // initial class is already on <html> when this component first renders.
  const [dark, setDark] = useState(() =>
    typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  );

  function toggle() {
    const next = !dark;
    setDark(next);
    applyTheme(next ? "dark" : "light");
    try {
      window.localStorage.setItem(storageKey, next ? "dark" : "light");
    } catch {
      // The toggle still works for this page view without storage.
    }
  }

  return (
    <button
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={dark}
      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:border-sky-300 hover:text-sky-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-sky-500/50 dark:hover:text-sky-300"
      onClick={toggle}
      title={dark ? "Light mode" : "Dark mode"}
      type="button"
    >
      <Icon name={dark ? "sun" : "moon"} className="h-[18px] w-[18px]" />
    </button>
  );
}
