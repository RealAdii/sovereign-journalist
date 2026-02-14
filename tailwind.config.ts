import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: "#0A0A0F",
          card: "#12121A",
          elevated: "#1A1A25",
        },
        neon: {
          green: "#00FF88",
          cyan: "#00D4FF",
          dim: "#00CC6A",
        },
        text: {
          primary: "#E8E8ED",
          secondary: "#A0A0B0",
          muted: "#606070",
        },
        border: {
          DEFAULT: "#1E1E2E",
          glow: "rgba(0, 255, 136, 0.2)",
        },
        error: "#FF4466",
        warning: "#FFB800",
        success: "#00FF88",
      },
      fontFamily: {
        mono: ["var(--font-jetbrains)", "JetBrains Mono", "monospace"],
        sans: ["var(--font-inter)", "Inter", "sans-serif"],
      },
      animation: {
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "fade-in": "fade-in 0.3s ease-out",
        "slide-up": "slide-up 0.4s ease-out",
        "typing": "typing 1.2s steps(3) infinite",
      },
      keyframes: {
        "pulse-glow": {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "1" },
        },
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "typing": {
          "0%": { content: "''" },
          "33%": { content: "'.'" },
          "66%": { content: "'..'" },
          "100%": { content: "'...'" },
        },
      },
      boxShadow: {
        "neon": "0 0 20px rgba(0, 255, 136, 0.15)",
        "neon-strong": "0 0 40px rgba(0, 255, 136, 0.25)",
        "cyan": "0 0 20px rgba(0, 212, 255, 0.15)",
      },
    },
  },
  plugins: [
    require("@tailwindcss/typography"),
  ],
};
export default config;
