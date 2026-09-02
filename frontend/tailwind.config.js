/** @type {import('tailwindcss').Config}
 *  Design system: one restrained corporate palette, one accent, semantic
 *  colors only for direction, a single spacing/radius/shadow scale. */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./hooks/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ground: "#f5f6f8",
        surface: "#ffffff",
        surface2: "#f8f9fb",
        line: "#e4e7ec",
        lineStrong: "#d0d5dd",
        ink: {
          900: "#101828",
          800: "#1d2939",
          700: "#344054",
          600: "#475467",
          500: "#667085",
          400: "#98a2b3",
          300: "#d0d5dd",
        },
        accent: "#2a78d6",
        accentHover: "#1f63b8",
        accentSoft: "#eaf2fc",
        positive: "#1f8a5b",
        positiveSoft: "#e8f5ee",
        negative: "#d64545",
        negativeSoft: "#fbeaea",
        warning: "#9a6700",
        warningSoft: "#fdf3dc",
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
        card: "0 1px 2px rgba(16, 24, 40, 0.05)",
        pop: "0 8px 24px rgba(16, 24, 40, 0.10), 0 1px 2px rgba(16, 24, 40, 0.06)",
      },
    },
  },
  plugins: [],
};
