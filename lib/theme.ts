// Light/dark theme. The choice is kept per device in localStorage; "system" follows
// the device's setting. The inline script in app/document.tsx applies it before the
// first paint, and the picker in /settings changes it.

export type Theme = "system" | "light" | "dark";

export const THEME_KEY = "theme";

// Runs inline in <head>, so it must stay self-contained.
export const themeScript = `(function(){try{var d=document.documentElement,m=matchMedia("(prefers-color-scheme: dark)");function a(){var t=localStorage.getItem("${THEME_KEY}");d.dataset.theme=t==="dark"||(t!=="light"&&m.matches)?"dark":"light"}a();m.addEventListener("change",a);window.addEventListener("storage",a)}catch(e){}})()`;

export function getTheme(): Theme {
  const t = localStorage.getItem(THEME_KEY);
  return t === "light" || t === "dark" ? t : "system";
}

const listeners = new Set<() => void>();

// For useSyncExternalStore: changes from this tab (setTheme) and from other tabs.
export function subscribeTheme(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function setTheme(theme: Theme) {
  if (theme === "system") localStorage.removeItem(THEME_KEY);
  else localStorage.setItem(THEME_KEY, theme);
  const dark =
    theme === "dark" ||
    (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  for (const l of listeners) l();
}
