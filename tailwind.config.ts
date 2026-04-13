import type { Config } from "tailwindcss";

export default {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: "#0B1929",
        "blue-aria": "#1B6CA8",
        "blue-light": "#5AABF5",
        "blue-pale": "#D6EEFF",
        "green-sov": "#166534",
        "green-sov-light": "#DCFCE7",
        "amber-sov": "#D97706",
        "amber-sov-light": "#FEF3C7",
        "red-sov": "#B91C1C",
        "red-sov-light": "#FEE2E2",
        "teal-poc": "#0F766E",
        "teal-poc-light": "#CCFBF1",
        "purple-aria": "#5B21B6",
        "purple-aria-light": "#EDE9FE",
        smoke: "#F1F5F9",
        muted: "#64748B",
        border: "#CBD5E1",
        text: "#0F172A",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Syne", "system-ui", "sans-serif"],
        mono: ["DM Mono", "monospace"],
      },
      borderRadius: {
        sm: "6px",
        md: "10px",
        lg: "12px",
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.08)",
        panel: "0 2px 8px rgba(0,0,0,0.08)",
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
} satisfies Config;
