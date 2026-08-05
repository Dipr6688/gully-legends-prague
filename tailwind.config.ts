import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        pitch: {
          950: "#06100e",
          900: "#0b1815",
          800: "#10231f",
          700: "#19362d"
        },
        neon: {
          yellow: "#f9d423",
          green: "#95ff38",
          cyan: "#5ae2ff",
          orange: "#ff7a30",
          violet: "#b75cff",
          red: "#ff4b38"
        }
      },
      boxShadow: {
        glow: "0 0 24px rgb(249 212 35 / 0.28)",
        "green-glow": "0 0 22px rgb(149 255 56 / 0.35)",
        "cyan-glow": "0 0 22px rgb(90 226 255 / 0.28)"
      },
      fontFamily: {
        display: ["var(--font-bangers)", "Impact", "sans-serif"],
        ui: ["var(--font-barlow-condensed)", "Arial Narrow", "sans-serif"],
        handwritten: ["var(--font-permanent-marker)", "Comic Sans MS", "cursive"],
        body: ["var(--font-barlow-condensed)", "Segoe UI", "Arial", "sans-serif"]
      },
      backgroundImage: {
        "field-grid":
          "linear-gradient(rgba(149,255,56,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(149,255,56,.08) 1px, transparent 1px)",
        "comic-halftone":
          "radial-gradient(circle, rgba(249,212,35,.22) 1px, transparent 1.5px)"
      }
    }
  },
  plugins: []
};

export default config;
