/**
 * Socket.io 服务端入口：
 * 1. 握手鉴权（客户端 connect 时通过 auth.token 传 JWT，校验失败拒绝连接）
 * 2. 封禁检查（被封禁的账号拒绝连接）
 * 3. 连接建立后：加入个人房间（私聊投递用）+ 注册聊天 / DM / AI 事件处理器
 */
import type { Server, Socket } from "socket.io";
import { verifyToken } from "../auth/token.js";
import { prisma } from "../prisma.js";
import { registerChatHandlers } from "./chat.handlers.js";
import { registerAiHandlers } from "./ai.handlers.js";
import { registerDmHandlers } from "./dm.handlers.js";

/** 每个用户的个人房间名：私聊消息就发到这个房间（一个用户可能同时开着多个连接） */
export function userChannel(userId: string): string {
  return `user:${userId}`;
}

/** 认证通过后的 socket：data 上挂了当前用户的信息 */
export interface AuthedSocket extends Socket {
  data: {
    userId: string;
    username: string;
    avatarColor: string;
    role: string;
    /** 当前已加入的频道房间 id 集合 */
    rooms: Set<string>;
  };
}

export function setupSocketServer(io: Server): void {
  // 握手鉴权中间件：在连接建立之前校验 token 并加载用户
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      const payload = token ? verifyToken(token) : null;
      if (!payload) return next(new Error("未登录"));

      const user = await prisma.user.findUnique({ where: { id: payload.userId } });
      if (!user) return next(new Error("用户不存在"));
      if (user.banned) return next(new Error("账号已被封禁"));

      socket.data.userId = user.id;
      socket.data.username = user.username;
      socket.data.avatarColor = user.avatarColor;
      socket.data.role = user.role;
      socket.data.rooms = new Set();
      next();
    } catch (err) {
      next(err instanceof Error ? err : new Error("鉴权失败"));
    }
  });

  io.on("connection", (socket) => {
    const authed = socket as AuthedSocket;
    // 加入个人房间：私聊消息靠它投递（在线时实时推送，离线时靠数据库未读计数）
    authed.join(userChannel(authed.data.userId));

    registerChatHandlers(authed, io);
    registerAiHandlers(authed, io);
    registerDmHandlers(authed, io);
  });
}
