/**
 * 图片上传（multer）。
 * 安全要点：
 * 1. 只允许白名单内的 mime 类型（jpg/png/gif/webp）
 * 2. 5MB 大小上限
 * 3. 文件名由服务端生成（时间戳 + UUID），绝不用用户上传的文件名（防路径穿越/恶意文件名）
 */
import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { authRequired } from "../auth/middleware.js";
import { config } from "../config.js";

const ALLOWED_TYPES = new Map<string, string>([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/gif", ".gif"],
  ["image/webp", ".webp"],
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(path.resolve(config.uploadDir), { recursive: true });
    cb(null, path.resolve(config.uploadDir));
  },
  filename: (_req, file, cb) => {
    const ext = ALLOWED_TYPES.get(file.mimetype) ?? "";
    cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, ALLOWED_TYPES.has(file.mimetype));
  },
});

export const uploadRoutes = Router();
uploadRoutes.use(authRequired);

// POST /api/upload/image —— multipart 字段名 image，返回可访问的 URL
uploadRoutes.post("/image", upload.single("image"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ message: "仅支持 jpg/png/gif/webp 图片，且不超过 5MB" });
    return;
  }
  res.json({ url: `/uploads/${req.file.filename}` });
});
