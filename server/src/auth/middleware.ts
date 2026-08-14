import type { NextFunction, Request, Response } from "express";
import { prisma } from "../prisma.js";
import { verifyToken } from "./token.js";

/** 经过 authRequired 中间件后，req 上会挂载 userId 和 userRole */
export interface AuthedRequest extends Request {
  userId: string;
  userRole: string;
}

/** 读取当前登录用户 id（中间件内部做类型断言，业务代码统一用这个函数） */
export function getUserId(req: Request): string {
  return (req as AuthedRequest).userId;
}

/** 读取当前用户角色（adminRequired 依赖它） */
export function getUserRole(req: Request): string {
  return (req as AuthedRequest).userRole;
}

/**
 * REST 接口的鉴权中间件：
 * 1. 校验 Authorization: Bearer <token>
 * 2. 每次请求都查一次数据库获取最新 role/banned —— 管理员改角色、封禁立即生效，
 *    不依赖登录时缓存的信息（这是「即时生效」与「少查一次数据库」的取舍，
 *    本地 SQLite 查询开销可以忽略）
 */
export async function authRequired(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;

  if (!token) {
    res.status(401).json({ message: "未登录" });
    return;
  }
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ message: "登录已过期，请重新登录" });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, role: true, banned: true },
  });
  if (!user) {
    res.status(401).json({ message: "账号不存在" });
    return;
  }
  if (user.banned) {
    res.status(403).json({ message: "账号已被封禁" });
    return;
  }

  (req as AuthedRequest).userId = user.id;
  (req as AuthedRequest).userRole = user.role;
  next();
}

/** 管理员权限校验（必须在 authRequired 之后使用） */
export function adminRequired(req: Request, res: Response, next: NextFunction): void {
  if (getUserRole(req) !== "ADMIN") {
    res.status(403).json({ message: "需要管理员权限" });
    return;
  }
  next();
}
