import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authRequired, getUserId } from "../auth/middleware.js";
import { parseBody } from "./validate.js";
import { toMessageDto } from "../utils.js";
import { filterSensitive } from "../moderation/sensitive-words.js";
import { logAudit } from "../audit/audit.js";

const createRoomSchema = z.object({
  name: z.string().trim().min(2, "房间名至少 2 个字符").max(30, "房间名最多 30 个字符"),
  description: z.string().trim().max(100, "描述最多 100 个字符").default(""),
});

export const roomRoutes = Router();
roomRoutes.use(authRequired);

// GET /api/rooms —— 房间列表
roomRoutes.get("/", async (_req, res) => {
  const rooms = await prisma.room.findMany({ orderBy: { createdAt: "asc" } });
  res.json(
    rooms.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      createdAt: r.createdAt.toISOString(),
    })),
  );
});

// POST /api/rooms —— 创建房间
roomRoutes.post("/", async (req, res) => {
  const body = parseBody(createRoomSchema, req, res);
  if (!body) return;

  const exists = await prisma.room.findUnique({ where: { name: body.name } });
  if (exists) {
    res.status(409).json({ message: "房间名已存在" });
    return;
  }

  const room = await prisma.room.create({
    data: {
      // 房间名/描述同样过敏感词过滤
      name: filterSensitive(body.name),
      description: filterSensitive(body.description),
      createdById: getUserId(req),
    },
  });
  await logAudit({ action: "room_create", detail: `创建房间：${room.name}`, actorId: getUserId(req), targetId: room.id });
  res.status(201).json({
    id: room.id,
    name: room.name,
    description: room.description,
    createdAt: room.createdAt.toISOString(),
  });
});

// GET /api/rooms/:id/messages?before=<ISO时间>&limit=50 —— 分页拉取历史消息
roomRoutes.get("/:id/messages", async (req, res) => {
  const room = await prisma.room.findUnique({ where: { id: req.params.id } });
  if (!room) {
    res.status(404).json({ message: "房间不存在" });
    return;
  }

  const limit = Math.min(Number(req.query.limit ?? 50), 100);
  // 游标分页：取「比 before 更早」的消息，避免翻页时新消息插入导致重复/漏条
  const beforeRaw = typeof req.query.before === "string" ? new Date(req.query.before) : null;
  const before = beforeRaw && !Number.isNaN(beforeRaw.getTime()) ? beforeRaw : undefined;

  const messages = await prisma.message.findMany({
    where: { roomId: room.id, ...(before ? { createdAt: { lt: before } } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { user: { select: { id: true, username: true, avatarColor: true, role: true } } },
  });

  // 数据库按倒序取，翻回来按时间正序返回给前端
  res.json(messages.reverse().map(toMessageDto));
});
