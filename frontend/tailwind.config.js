/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        sb: {
          bg: "var(--sb-bg)",
          card: "var(--sb-card)",
          card2: "var(--sb-card2)",
          ink: "var(--sb-ink)",
          muted: "var(--sb-muted)",
          line: "var(--sb-line)",
          accent: "var(--sb-accent)",
          accent2: "var(--sb-accent2)",
          "accent-soft": "var(--sb-accent-soft)",
          gold: "var(--sb-gold)",
          "gold-soft": "var(--sb-gold-soft)",
          appr: "var(--sb-appr)",
          guru: "var(--sb-guru)",
          master: "var(--sb-master)",
          enl: "var(--sb-enl)",
          burned: "var(--sb-burned)",
        },
      },
      fontFamily: {
        // Manrope for UI text; Baloo 2 for display and numbers, with Nunito
        // supplying the Cyrillic glyphs Baloo 2 lacks (per design handoff).
        sans: ['"Manrope"', "system-ui", "sans-serif"],
        display: ['"Baloo 2"', '"Nunito"', "sans-serif"],
      },
    },
  },
  plugins: [],
};
