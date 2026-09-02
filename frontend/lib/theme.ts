/** Theme constants shared by the server-rendered layout (inline no-flash
 *  script) and the client-side ThemeProvider. Kept free of "use client" so the
 *  layout can import plain values from it. */

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "sdi.theme";
export const DARK_MEDIA = "(prefers-color-scheme: dark)";

/** Runs before hydration so the first paint already has the right palette -
 *  no light flash for dark-mode users. Must mirror resolveTheme() below. */
export const THEME_INIT_SCRIPT =
  `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});` +
  `var d=t==="dark"||((t!=="light")&&window.matchMedia(${JSON.stringify(DARK_MEDIA)}).matches);` +
  `document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === "system") return window.matchMedia(DARK_MEDIA).matches ? "dark" : "light";
  return preference;
}
