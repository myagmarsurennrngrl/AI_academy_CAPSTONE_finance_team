/** @type {import('tailwindcss').Config}
 *  Design system: one restrained corporate palette, one accent, semantic
 *  colors only for direction, a single spacing/radius/shadow scale.
 *
 *  Every color resolves to a CSS variable declared in app/globals.css so the
 *  same utility classes render the light palette by default and the dark
 *  palette when <html class="dark"> is present (ThemeProvider). The
 *  `<alpha-value>` placeholder keeps opacity modifiers (bg-surface/70) working. */
const v = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

module.exports = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./hooks/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ground: v("ground"),
        surface: v("surface"),
        surface2: v("surface2"),
        line: v("line"),
        lineStrong: v("line-strong"),
        ink: {
          900: v("ink-900"),
          800: v("ink-800"),
          700: v("ink-700"),
          600: v("ink-600"),
          500: v("ink-500"),
          400: v("ink-400"),
          300: v("ink-300"),
        },
        // text placed on an ink-900 background (white in light mode, dark in dark mode)
        onInk: v("on-ink"),
        accent: v("accent"),
        accentHover: v("accent-hover"),
        accentSoft: v("accent-soft"),
        positive: v("positive"),
        positiveSoft: v("positive-soft"),
        negative: v("negative"),
        negativeSoft: v("negative-soft"),
        warning: v("warning"),
        warningSoft: v("warning-soft"),
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      borderRadius: {
        card: "10px",
        ctl: "8px",
        chip: "6px",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        pop: "var(--shadow-pop)",
      },
    },
  },
  plugins: [],
};
