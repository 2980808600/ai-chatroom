import { Router } from "express";
import bcrypt from "bcryptjs";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { signToken } from "../auth/token.js";
import { authRequired, getUserId } from "../auth/middleware.js";
import { parseBody } from "./validate.js";
import { randomColor, toUserPublic } from "../utils.js";
import { logAudit } from "../audit/audit.js";

const registerSchema = z.object({
  // 用户名只允许字母/数字/下划线/中文，从源头堵住特殊字符注入
  username: z
    .string()
    .trim()
    .min(3, "用户名至少 3 个字符")
    .max(20, "用户名最多 20 个字符")
    .regex(/^[\w一-龥]+$/, "用户名只能包含字母、数字、下划线或中文"),
  // 密码强度：至少 8 位且同时包含字母和数字
  password: z
    .string()
    .min(8, "密码至少 8 位")
    .max(72, "密码太长了")
    .regex(/^(?=.*[A-Za-z])(?=.*\d)/, "密码必须同时包含字母和数字"),
});

const loginSchema = z.object({
  username: z.string().min(1, "请输入用户名"),
  password: z.string().min(1, "请输入密码"),
});

export const authRoutes = Router();

// 登录/注册接口限流：防止暴力破解密码（按 IP，15 分钟 20 次）。
// 注意：生产环境如果前面挂了 Nginx，需要 app.set("trust proxy", 1) 让 req.ip 取真实 IP。
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "尝试次数过多，请 15 分钟后再试" },
});
authRoutes.use(authLimiter);

// POST /api/auth/register
authRoutes.post("/register", async (req, res) => {
  const body = parseBody(registerSchema, req, res);
  if (!body) return;

  const exists = await prisma.user.findUnique({ where: { username: body.username } });
  if (exists) {
    res.status(409).json({ message: "用户名已被占用" });
    return;
  }

  // bcrypt 加盐哈希：数据库泄露也不会暴露明文密码
  const user = await prisma.user.create({
    data: {
      username: body.username,
      passwordHash: bcrypt.hashSync(body.password, 10),
      avatarColor: randomColor(),
    },
  });

  await logAudit({ action: "register", detail: `新用户注册：${user.username}`, ip: req.ip ?? "", actorId: user.id });

  res.json({ token: signToken(user.id), user: toUserPublic(user) });
});

// POST /api/auth/login
authRoutes.post("/login", async (req, res) => {
  const body = parseBody(loginSchema, req, res);
  if (!body) return;

  const user = await prisma.user.findUnique({ where: { username: body.username } });
  // 用户不存在和密码错误返回同一个提示，避免「用户名枚举」攻击
  if (!user || !bcrypt.compareSync(body.password, user.passwordHash)) {
    await logAudit({
      action: "login_failed",
      detail: `登录失败：${body.username}`,
      ip: req.ip ?? "",
      targetId: user?.id,
    });
    res.status(401).json({ message: "用户名或密码错误" });
    return;
  }

  if (user.banned) {
    await logAudit({ action: "login_failed", detail: `封禁账号尝试登录：${user.username}`, ip: req.ip ?? "", targetId: user.id });
    res.status(403).json({ message: "账号已被封禁" });
    return;
  }

  await logAudit({ action: "login_success", detail: `登录成功：${user.username}`, ip: req.ip ?? "", targetId: user.id });

  res.json({ token: signToken(user.id), user: toUserPublic(user) });
});

// GET /api/auth/me（前端刷新页面时用它恢复登录态）
authRoutes.get("/me", authRequired, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: getUserId(req) } });
  if (!user) {
    res.status(404).json({ message: "用户不存在" });
    return;
  }
  res.json(toUserPublic(user));
});
