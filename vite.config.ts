import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// 四窗口多页入口：main 控制面板 + clock/bar/runner 显示窗口
const page = (name: string) =>
  fileURLToPath(new URL(`./${name}.html`, import.meta.url));

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "safari13",
    rollupOptions: {
      input: {
        main: page("index"),
        clock: page("clock"),
        bar: page("bar"),
        runner: page("runner"),
        // preview.html 仅开发期视觉核对用（vite dev 可直接访问），不进生产包
      },
    },
  },
});
