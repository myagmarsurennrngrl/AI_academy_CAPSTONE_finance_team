/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f5f7fa",
          100: "#e9edf3",
          200: "#d3dae5",
          300: "#aab7c9",
          400: "#7c8ca4",
          500: "#5b6d87",
          600: "#46566d",
          700: "#374255",
          800: "#242c3a",
          900: "#141922",
          950: "#0c0f15",
        },
        accent: {
          50: "#eef4ff",
          100: "#dbe8ff",
          200: "#b8d1ff",
          300: "#8ab3ff",
          400: "#5a8fff",
          500: "#2f6bf0",
          600: "#1f52cc",
          700: "#1c41a3",
          800: "#1a3781",
          900: "#182f66",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      borderRadius: {
        card: "14px",
      },
      boxShadow: {
        subtle: "0 1px 2px rgba(20, 25, 34, 0.04), 0 1px 12px rgba(20, 25, 34, 0.03)",
        panel: "0 4px 24px rgba(20, 25, 34, 0.06)",
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
};
