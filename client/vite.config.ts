import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // REST 接口转发到后端
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      // 上传的图片静态资源
      "/uploads": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      // WebSocket 转发（ws: true 是关键，否则 socket.io 连不上）
      "/socket.io": {
        target: "http://localhost:4000",
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
