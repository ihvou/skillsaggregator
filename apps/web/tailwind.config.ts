import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#102026",
        court: "#2d6a4f",
        shuttle: "#f7f7f2",
        amberline: "#d97706",
        graphite: "#44515a",
      },
      boxShadow: {
        panel: "0 18px 60px rgba(16, 32, 38, 0.10)",
      },
    },
  },
  plugins: [],
};

export default config;
