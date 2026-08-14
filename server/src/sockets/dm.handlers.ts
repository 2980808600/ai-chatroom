/**
 * 私聊 DM 的 socket 事件处理。
 *
 * 投递原理：每个连接在建立时都加入了以自己 userId 命名的个人房间（见 sockets/index.ts），
 * 发私信 = 把消息 emit 到对方的个人房间 + 自己的个人房间（多设备同步）。
 * 对方离线时消息照样落库，未读数靠 readAt 字段计算，上线后打开会话即补齐。
 */
import type { Server } from "socket.io";
import { z } from "zod";
import { SOCKET_EVENTS } from "shared";
import type { DmMessageDto } from "shared";
import { prisma } from "../prisma.js";
import { filterSensitive } from "../moderation/sensitive-words.js";
import { userChannel, type AuthedSocket } from "./index.js";

const dmSendSchema = z.object({
  toUserId: z.string().min(1),
  content: z.string().trim().min(1, "消息不能为空").max(2000, "消息最多 2000 字"),
  type: z.enum(["TEXT", "IMAGE"]).default("TEXT"),
});

const dmOpenSchema = z.object({ fromUserId: z.string().min(1) });

function toDmDto(m: {
  id: string;
  content: string;
  type: string;
  createdAt: Date;
  readAt: Date | null;
  senderId: string;
}): DmMessageDto {
  return {
    id: m.id,
    content: m.content,
    type: m.type as DmMessageDto["type"],
    createdAt: m.createdAt.toISOString(),
    readAt: m.readAt ? m.readAt.toISOString() : null,
    senderId: m.senderId,
  };
}

export function registerDmHandlers(socket: AuthedSocket, io: Server): void {
  // 发送私信
  socket.on(SOCKET_EVENTS.dmSend, async (raw: unknown) => {
    const parsed = dmSendSchema.safeParse(raw);
    if (!parsed.success) return;
    const { toUserId, content, type } = parsed.data;

    if (toUserId === socket.data.userId) return;

    const recipient = await prisma.user.findUnique({ where: { id: toUserId }, select: { id: true, banned: true } });
    if (!recipient || recipient.banned) return;

    const message = await prisma.directMessage.create({
      data: {
        senderId: socket.data.userId,
        recipientId: toUserId,
        // 敏感词过滤与频道消息一致
        content: type === "TEXT" ? filterSensitive(content) : content,
        type,
      },
    });

    const dto = toDmDto(message);
    // 发给对方（在线即实时推送）+ 发给自己（多设备同步 + 前端直接渲染）
    io.to(userChannel(toUserId)).emit(SOCKET_EVENTS.dmNew, dto);
    io.to(userChannel(socket.data.userId)).emit(SOCKET_EVENTS.dmNew, dto);
  });

  // 打开与某人的会话：把对方发给我的未读消息全部标为已读
  socket.on(SOCKET_EVENTS.dmOpen, async (raw: unknown) => {
    const parsed = dmOpenSchema.safeParse(raw);
    if (!parsed.success) return;

    const result = await prisma.directMessage.updateMany({
      where: {
        senderId: parsed.data.fromUserId,
        recipientId: socket.data.userId,
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    // 通知对方「我已读」（对方界面可以更新已读状态）
    if (result.count > 0) {
      io.to(userChannel(parsed.data.fromUserId)).emit(SOCKET_EVENTS.dmRead, {
        userId: socket.data.userId,
      });
    }
  });
}
