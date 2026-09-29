import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx,js,jsx}",
    "./components/**/*.{ts,tsx,js,jsx}",
    "./lib/**/*.{ts,tsx,js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        // HQ design system: deep-navy command-centre theme.
        bb: {
          bg: "#070b14",
          surface: "#0e1424", // card base
          surface2: "#161f33",
          // Hover/active surface for rail rows, active tab pills, etc.
                    // hand-rolled #141C33 hex literals with a real token.)
          "surface-hi": "#141C33",
          border: "#1f2940",
          fg: "#E9EEF8",
          muted: "#8b94ab",
          dim: "#586079",
          accent: "#22C55E", // green = active/working/healthy
          teal: "#2DD4BF",
          blue: "#5AB0F0",
          indigo: "#818CF8",
          violet: "#A78BFA",
          pink: "#F472B6",
          warn: "#F59E0B",
          danger: "#EF4444",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Helvetica", "Arial"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(90,176,240,0.10), 0 8px 30px -12px rgba(20,40,90,0.6)",
      },
    },
  },
  plugins: [],
};

export default config;
