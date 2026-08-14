/**
 * 服务端入口：HTTP（REST 接口 + 静态文件）+ WebSocket（Socket.io 实时通信）跑在同一个端口上。
 */
import "dotenv/config";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { Server } from "socket.io";
import { config } from "./config.js";
import { authRoutes } from "./routes/auth.routes.js";
import { roomRoutes } from "./routes/room.routes.js";
import { aiRoutes } from "./routes/ai.routes.js";
import { dmRoutes } from "./routes/dm.routes.js";
import { usersRoutes } from "./routes/users.routes.js";
import { adminRoutes } from "./routes/admin.routes.js";
import { uploadRoutes } from "./routes/upload.routes.js";
import { setupSocketServer } from "./sockets/index.js";

const app = express();

// helmet：设置一批安全响应头（XSS 防护、防 MIME 嗅探、点击劫持防护等）
app.use(helmet());

// CORS 收紧：只允许配置里的前端来源（开发走 Vite 代理不触发 CORS，生产配域名）
app.use(cors({ origin: config.corsOrigins }));

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});
app.use("/api/auth", authRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/dm", dmRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/upload", uploadRoutes);

// 上传的图片静态托管
fs.mkdirSync(path.resolve(config.uploadDir), { recursive: true });
app.use("/uploads", express.static(path.resolve(config.uploadDir), { maxAge: "7d" }));

// 生产模式：托管前端构建产物（Docker 单容器部署时前端由后端一起服务）
const clientDist = path.resolve(import.meta.dirname, "../../client/dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // SPA 回退：非 /api、/uploads、/socket.io 的路径都返回 index.html
  app.get(/^\/(?!api|uploads|socket\.io).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

// 兜底错误处理（Express 5 会把 async 抛出的异常自动转发到这里）
app.use(
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("[server] 未捕获错误：", err);
    res.status(500).json({ message: "服务器内部错误" });
  },
);

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: config.corsOrigins },
});
setupSocketServer(io);

server.listen(config.port, () => {
  console.log(`🚀 服务已启动：http://localhost:${config.port}`);
});
