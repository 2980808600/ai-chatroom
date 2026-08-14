import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authRequired, getUserId, getUserRole } from "../auth/middleware.js";
import { parseBody } from "./validate.js";
import { config } from "../config.js";
import { getTodayRequestCount } from "../ai/usage.js";

const createConversationSchema = z.object({
  title: z.string().trim().max(60).optional(),
  mode: z.enum(["GENERAL", "DEBUG"]).default("GENERAL"),
});

export const aiRoutes = Router();
aiRoutes.use(authRequired);

function toConversationDto(c: { id: string; title: string; mode: string; createdAt: Date }) {
  return {
    id: c.id,
    title: c.title,
    mode: c.mode as "GENERAL" | "DEBUG",
    createdAt: c.createdAt.toISOString(),
  };
}

// GET /api/ai/quota —— 今日 AI 配额使用情况（AI 面板顶部显示剩余次数）
aiRoutes.get("/quota", async (req, res) => {
  const role = getUserRole(req);
  const unlimited = role !== "USER";
  res.json({
    role,
    unlimited,
    usedToday: await getTodayRequestCount(getUserId(req)),
    dailyLimit: config.aiDailyLimit,
  });
});

// GET /api/ai/conversations —— 我的会话列表
aiRoutes.get("/conversations", async (req, res) => {
  const conversations = await prisma.aiConversation.findMany({
    where: { userId: getUserId(req) },
    orderBy: { createdAt: "desc" },
  });
  res.json(conversations.map(toConversationDto));
});

// POST /api/ai/conversations —— 手动创建会话（前端也支持发第一条消息时自动创建）
aiRoutes.post("/conversations", async (req, res) => {
  const body = parseBody(createConversationSchema, req, res);
  if (!body) return;

  const conversation = await prisma.aiConversation.create({
    data: {
      userId: getUserId(req),
      title: body.title ?? "新对话",
      mode: body.mode,
    },
  });
  res.status(201).json(toConversationDto(conversation));
});

// GET /api/ai/conversations/:id/messages —— 会话历史（校验归属，防止越权访问别人的会话）
aiRoutes.get("/conversations/:id/messages", async (req, res) => {
  const conversation = await prisma.aiConversation.findFirst({
    where: { id: req.params.id, userId: getUserId(req) },
  });
  if (!conversation) {
    res.status(404).json({ message: "会话不存在" });
    return;
  }

  const messages = await prisma.aiMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "asc" },
  });
  res.json(
    messages.map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    })),
  );
});

// DELETE /api/ai/conversations/:id —— 删除会话（级联删除其中所有消息）
aiRoutes.delete("/conversations/:id", async (req, res) => {
  const conversation = await prisma.aiConversation.findFirst({
    where: { id: req.params.id, userId: getUserId(req) },
  });
  if (!conversation) {
    res.status(404).json({ message: "会话不存在" });
    return;
  }
  await prisma.aiConversation.delete({ where: { id: conversation.id } });
  res.status(204).end();
});
