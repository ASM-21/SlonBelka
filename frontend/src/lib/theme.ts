// Theme preference: "system" follows the OS, "light"/"dark" force a look.
// Stored in localStorage and reflected onto <html data-theme>; the CSS in
// index.css keys off that attribute (absent means follow the OS).

export type Theme = "system" | "light" | "dark";

const KEY = "slonbelka_theme";

export function getTheme(): Theme {
  const v = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
  return v === "light" || v === "dark" ? v : "system";
}

export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

export function setTheme(theme: Theme): void {
  if (typeof localStorage !== "undefined") {
    if (theme === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  }
  applyTheme(theme);
}

// Apply the stored preference as early as possible to avoid a flash.
export function initTheme(): void {
  applyTheme(getTheme());
}
