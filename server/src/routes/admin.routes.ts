/**
 * 管理后台 API（全部需要 ADMIN 角色）。
 * 商业化运营的核心数据都在这里：用户管理、封禁、成本报表、审计日志。
 */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { adminRequired, authRequired, getUserId } from "../auth/middleware.js";
import { parseBody } from "./validate.js";
import { logAudit } from "../audit/audit.js";
import { config } from "../config.js";

export const adminRoutes = Router();
adminRoutes.use(authRequired, adminRequired);

/** 估算一次请求的美元成本（token × 单价） */
function estimateCost(provider: string, inputTokens: number | null, outputTokens: number | null): number {
  const price = config.aiPrices[provider as "deepseek" | "anthropic"] ?? config.aiPrices.deepseek;
  return ((inputTokens ?? 0) / 1_000_000) * price.input + ((outputTokens ?? 0) / 1_000_000) * price.output;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// GET /api/admin/stats —— 首页总览：用户数/房间数/今日消息/今日 AI 请求/今日成本
adminRoutes.get("/stats", async (_req, res) => {
  const today = startOfToday();
  const [userCount, roomCount, bannedCount, messageToday, aiRequestsToday] = await Promise.all([
    prisma.user.count(),
    prisma.room.count(),
    prisma.user.count({ where: { banned: true } }),
    prisma.message.count({ where: { createdAt: { gte: today } } }),
    prisma.aiRequestLog.findMany({
      where: { createdAt: { gte: today } },
      select: { provider: true, inputTokens: true, outputTokens: true },
    }),
  ]);

  const costToday = aiRequestsToday.reduce(
    (sum, r) => sum + estimateCost(r.provider, r.inputTokens, r.outputTokens),
    0,
  );

  res.json({
    userCount,
    roomCount,
    bannedCount,
    messageToday,
    aiRequestsToday: aiRequestsToday.length,
    costToday: Number(costToday.toFixed(4)),
  });
});

// GET /api/admin/users?q= —— 用户列表（含今日 AI 用量）
adminRoutes.get("/users", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

  const users = await prisma.user.findMany({
    where: q ? { username: { contains: q } } : {},
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { _count: { select: { aiRequests: true } } },
  });

  // 今日 AI 次数：groupBy 一把拿全，避免 N+1 查询
  const today = startOfToday();
  const usage = await prisma.aiRequestLog.groupBy({
    by: ["userId"],
    where: { createdAt: { gte: today } },
    _count: { _all: true },
  });
  const usageMap = new Map(usage.map((u) => [u.userId, u._count._all]));

  res.json(
    users.map((u) => ({
      id: u.id,
      username: u.username,
      avatarColor: u.avatarColor,
      role: u.role,
      banned: u.banned,
      createdAt: u.createdAt.toISOString(),
      totalAiRequests: u._count.aiRequests,
      aiToday: usageMap.get(u.id) ?? 0,
    })),
  );
});

// PATCH /api/admin/users/:id/role —— 改角色（USER/MEMBER/ADMIN）
adminRoutes.patch("/users/:id/role", async (req, res) => {
  const body = parseBody(z.object({ role: z.enum(["USER", "MEMBER", "ADMIN"]) }), req, res);
  if (!body) return;

  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) {
    res.status(404).json({ message: "用户不存在" });
    return;
  }
  await prisma.user.update({ where: { id: target.id }, data: { role: body.role } });
  await logAudit({
    action: "role_change",
    detail: `角色变更：${target.username}（${target.role} → ${body.role}）`,
    actorId: getUserId(req),
    targetId: target.id,
  });
  res.json({ ok: true });
});

// PATCH /api/admin/users/:id/ban —— 封禁/解封
adminRoutes.patch("/users/:id/ban", async (req, res) => {
  const body = parseBody(z.object({ banned: z.boolean() }), req, res);
  if (!body) return;

  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) {
    res.status(404).json({ message: "用户不存在" });
    return;
  }
  await prisma.user.update({ where: { id: target.id }, data: { banned: body.banned } });
  await logAudit({
    action: "user_ban",
    detail: `${body.banned ? "封禁" : "解封"}用户：${target.username}`,
    actorId: getUserId(req),
    targetId: target.id,
  });
  res.json({ ok: true });
});

// DELETE /api/admin/rooms/:id —— 删除房间（消息级联删除）
adminRoutes.delete("/rooms/:id", async (req, res) => {
  const room = await prisma.room.findUnique({ where: { id: req.params.id } });
  if (!room) {
    res.status(404).json({ message: "房间不存在" });
    return;
  }
  await prisma.room.delete({ where: { id: room.id } });
  await logAudit({
    action: "room_delete",
    detail: `删除房间：${room.name}`,
    actorId: getUserId(req),
    targetId: room.id,
  });
  res.json({ ok: true });
});

// GET /api/admin/audit-logs —— 审计日志（最近 100 条）
adminRoutes.get("/audit-logs", async (_req, res) => {
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json(
    logs.map((l) => ({
      id: l.id,
      action: l.action,
      detail: l.detail,
      ip: l.ip,
      actorId: l.actorId,
      targetId: l.targetId,
      createdAt: l.createdAt.toISOString(),
    })),
  );
});

// GET /api/admin/ai-requests —— AI 请求明细（含成本，最近 100 条）
adminRoutes.get("/ai-requests", async (_req, res) => {
  const requests = await prisma.aiRequestLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { id: true, username: true } } },
  });
  res.json(
    requests.map((r) => ({
      id: r.id,
      username: r.user.username,
      provider: r.provider,
      scope: r.scope,
      status: r.status,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      cost: Number(estimateCost(r.provider, r.inputTokens, r.outputTokens).toFixed(5)),
      createdAt: r.createdAt.toISOString(),
    })),
  );
});
