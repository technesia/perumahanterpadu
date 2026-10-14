import type { Config } from "tailwindcss";

// Palet diambil dari logo Taman Pesona Rajeg Mulya (hijau daun & emas atap).
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f3f7ee",
          100: "#e3edd6",
          200: "#c7dbae",
          300: "#a3c27c",
          400: "#80a653",
          500: "#638a3a",
          600: "#4c6d2c",
          700: "#3d5726",
          800: "#334622",
          900: "#2b3b1f",
        },
        gold: {
          50: "#fbf7ec",
          100: "#f4ead0",
          300: "#dcc07d",
          500: "#b8963e",
          600: "#9c7c30",
          700: "#7d6227",
        },
      },
      keyframes: {
        progress: { "0%": { transform: "translateX(-100%)" }, "100%": { transform: "translateX(300%)" } },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
