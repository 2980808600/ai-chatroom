import { Router } from "express";
import { prisma } from "../prisma.js";
import { authRequired, getUserId } from "../auth/middleware.js";
import { toUserPublic } from "../utils.js";
import type { DmConversationDto } from "shared";

export const dmRoutes = Router();
dmRoutes.use(authRequired);

const userSelect = { id: true, username: true, avatarColor: true, role: true } as const;

// GET /api/dm/conversations —— 私聊会话列表（最近聊过的人 + 未读数 + 最后一条消息）
dmRoutes.get("/conversations", async (req, res) => {
  const me = getUserId(req);

  // 我发出的 + 我收到的（两份查询在 JS 里合并去重）
  const [sent, received] = await Promise.all([
    prisma.directMessage.findMany({
      where: { senderId: me },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { recipient: { select: userSelect } },
    }),
    prisma.directMessage.findMany({
      where: { recipientId: me },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { sender: { select: userSelect } },
    }),
  ]);

  // 按对方 userId 聚合
  interface ConversationEntry {
    user: { id: string; username: string; avatarColor: string; role: string };
    lastCreatedAt: string;
    lastContent: string;
    lastType: string;
    unread: number;
  }
  const map = new Map<string, ConversationEntry>();

  for (const m of sent) {
    const other = m.recipient;
    const existing = map.get(other.id);
    if (!existing || m.createdAt.toISOString() > existing.lastCreatedAt) {
      map.set(other.id, {
        user: other,
        lastCreatedAt: m.createdAt.toISOString(),
        lastContent: m.content,
        lastType: m.type,
        unread: existing?.unread ?? 0,
      });
    }
  }
  for (const m of received) {
    const other = m.sender;
    const existing = map.get(other.id);
    if (!existing) {
      map.set(other.id, {
        user: other,
        lastCreatedAt: m.createdAt.toISOString(),
        lastContent: m.content,
        lastType: m.type,
        unread: m.readAt ? 0 : 1,
      });
    } else {
      if (m.createdAt.toISOString() > existing.lastCreatedAt) {
        existing.lastCreatedAt = m.createdAt.toISOString();
        existing.lastContent = m.content;
        existing.lastType = m.type;
      }
      if (!m.readAt) existing.unread += 1;
    }
  }

  const conversations: DmConversationDto[] = [...map.values()]
    .sort((a, b) => b.lastCreatedAt.localeCompare(a.lastCreatedAt))
    .map((c) => ({
      user: toUserPublic(c.user),
      lastMessage: {
        content: c.lastType === "IMAGE" ? "[图片]" : c.lastContent,
        type: c.lastType as "TEXT" | "IMAGE",
        createdAt: c.lastCreatedAt,
      },
      unreadCount: c.unread,
    }));

  res.json(conversations);
});

// GET /api/dm/:userId/messages?before=&limit= —— 与某人的历史消息（游标分页）
dmRoutes.get("/:userId/messages", async (req, res) => {
  const me = getUserId(req);
  const otherId = req.params.userId;

  const limit = Math.min(Number(req.query.limit ?? 50), 100);
  const beforeRaw = typeof req.query.before === "string" ? new Date(req.query.before) : null;
  const before = beforeRaw && !Number.isNaN(beforeRaw.getTime()) ? beforeRaw : undefined;

  const messages = await prisma.directMessage.findMany({
    where: {
      ...(before ? { createdAt: { lt: before } } : {}),
      OR: [
        { senderId: me, recipientId: otherId },
        { senderId: otherId, recipientId: me },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  res.json(
    messages.reverse().map((m) => ({
      id: m.id,
      content: m.content,
      type: m.type,
      createdAt: m.createdAt.toISOString(),
      readAt: m.readAt ? m.readAt.toISOString() : null,
      senderId: m.senderId,
    })),
  );
});

// POST /api/dm/:userId/read —— 标记某人的消息已读（前端打开会话时兜底调用）
dmRoutes.post("/:userId/read", async (req, res) => {
  const me = getUserId(req);
  await prisma.directMessage.updateMany({
    where: { senderId: req.params.userId, recipientId: me, readAt: null },
    data: { readAt: new Date() },
  });
  res.json({ ok: true });
});
