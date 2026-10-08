"use client";

import { useSyncExternalStore } from "react";
import { Icon } from "./Icon";

const storageKey = "theme";

// The <head> script in the root layout puts the saved/system theme on <html>
// before first paint; this component follows that class rather than owning it.
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

const isDark = () => document.documentElement.classList.contains("dark");

export function ThemeToggle() {
  // The server can't know the theme, so hydration uses its light-mode markup
  // and React switches to the real class right after, without a mismatch.
  const dark = useSyncExternalStore(subscribe, isDark, () => false);

  function toggle() {
    const next = dark ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      window.localStorage.setItem(storageKey, next);
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
