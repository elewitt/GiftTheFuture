import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Outfit", "system-ui", "sans-serif"],
        mono: ["DM Mono", "monospace"],
      },
      colors: {
        fg: {
          bg: "#060a13",
          surface: "#0f172a",
          border: "rgba(148,163,184,0.08)",
          accent: "#6366f1",
          green: "#10b981",
          red: "#f43f5e",
          gold: "#fbbf24",
        },
      },
    },
  },
  plugins: [],
};

export default config;
