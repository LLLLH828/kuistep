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
        // 跬步品牌色
        kuibue: {
          primary: "#4F46E5",   // 靛蓝 - 主色
          secondary: "#10B981", // 翠绿 - 奖励/成功
          accent: "#F59E0B",    // 琥珀 - 小红花/提醒
          danger: "#EF4444",    // 红色 - 减分/危险
          kid: "#8B5CF6",       // 紫色 - 孩子端
          parent: "#3B82F6",    // 蓝色 - 家长端
        },
      },
      animation: {
        "bounce-slow": "bounce 2s infinite",
        "pop": "pop 0.4s ease-out",
      },
      keyframes: {
        pop: {
          "0%": { transform: "scale(0.5)", opacity: "0" },
          "50%": { transform: "scale(1.2)" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
