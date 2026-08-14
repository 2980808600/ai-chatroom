/**
 * 聊天核心事件处理：加入/离开房间、发消息、打字提示。
 */
import type { Server } from "socket.io";
import { z } from "zod";
import { SOCKET_EVENTS } from "shared";
import type { OnlineUser } from "shared";
import { prisma } from "../prisma.js";
import { toMessageDto } from "../utils.js";
import { filterSensitive } from "../moderation/sensitive-words.js";
import type { AuthedSocket } from "./index.js";
import { addOnlineUser, emitRoomUsers, removeOnlineUser, roomChannel } from "./room-state.js";
import { handleAiRoom } from "./ai.handlers.js";
import { abortUserStream } from "./stream-registry.js";

const joinSchema = z.object({ roomId: z.string().min(1) });
const leaveSchema = z.object({ roomId: z.string().min(1) });
const messageSchema = z.object({
  roomId: z.string().min(1),
  content: z.string().trim().min(1, "消息不能为空").max(2000, "消息最多 2000 字"),
});

/** socket.data 上的用户信息 → 前端 UserPublic 形状（data 里字段名是 userId） */
function socketUser(socket: AuthedSocket): OnlineUser {
  return {
    id: socket.data.userId,
    username: socket.data.username,
    avatarColor: socket.data.avatarColor,
    role: socket.data.role as OnlineUser["role"],
  };
}

function leaveRoom(socket: AuthedSocket, io: Server, roomId: string): void {
  if (!socket.data.rooms.has(roomId)) return;
  socket.leave(roomChannel(roomId));
  socket.data.rooms.delete(roomId);
  removeOnlineUser(roomId, socket.data.userId);
  emitRoomUsers(io, roomId);
}

export function registerChatHandlers(socket: AuthedSocket, io: Server): void {
  // 加入房间
  socket.on(SOCKET_EVENTS.roomJoin, async (payload) => {
    const parsed = joinSchema.safeParse(payload);
    if (!parsed.success) return;
    const { roomId } = parsed.data;

    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) return;

    socket.join(roomChannel(roomId));
    socket.data.rooms.add(roomId);
    addOnlineUser(roomId, socketUser(socket));
    emitRoomUsers(io, roomId);
  });

  // 离开房间
  socket.on(SOCKET_EVENTS.roomLeave, (payload) => {
    const parsed = leaveSchema.safeParse(payload);
    if (!parsed.success) return;
    leaveRoom(socket, io, parsed.data.roomId);
  });

  // 发送消息
  socket.on(SOCKET_EVENTS.messageSend, async (payload) => {
    const parsed = messageSchema.safeParse(payload);
    if (!parsed.success) return;
    const { roomId, content } = parsed.data;

    // 只允许在已加入的房间发言
    if (!socket.data.rooms.has(roomId)) return;

    // 1. 消息落库（先过敏感词过滤）
    const message = await prisma.message.create({
      data: { content: filterSensitive(content), roomId, userId: socket.data.userId, type: "TEXT" },
      include: { user: { select: { id: true, username: true, avatarColor: true, role: true } } },
    });

    // 2. 广播给房间内所有人（包括自己，靠 message:new 渲染，不做本地乐观更新）
    io.to(roomChannel(roomId)).emit(SOCKET_EVENTS.messageNew, toMessageDto(message));

    // 3. 以 @AI 开头 → 触发群聊 AI 机器人（机器人回复会流式广播，最后以 AI 消息落库）
    const trimmed = content.trim();
    if (trimmed.startsWith("@AI")) {
      const question = trimmed.slice(3).trim();
      void handleAiRoom(socket, io, {
        roomId,
        content: question || "你好，介绍一下你自己吧",
      });
    }
  });

  // 打字提示（广播给房间内除自己以外的所有人）
  const emitTyping = (payload: unknown) => {
    const parsed = z.object({ roomId: z.string().min(1) }).safeParse(payload);
    if (!parsed.success || !socket.data.rooms.has(parsed.data.roomId)) return;
    socket.to(roomChannel(parsed.data.roomId)).emit(SOCKET_EVENTS.typing, {
      roomId: parsed.data.roomId,
      user: socketUser(socket),
    });
  };
  socket.on(SOCKET_EVENTS.typingStart, emitTyping);

  // 断线：退出所有房间 + 终止正在进行的 AI 流式输出
  socket.on("disconnect", () => {
    for (const roomId of [...socket.data.rooms]) leaveRoom(socket, io, roomId);
    abortUserStream(socket.data.userId);
  });
}
