import type { Message, User } from "@prisma/client";
import type { MessageDto, UserPublic } from "shared";

/** 头像颜色池：注册时随机分配一个，给没有头像功能的聊天室加点色彩 */
const AVATAR_COLORS = [
  "#6366f1",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
];

export function randomColor(): string {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]!;
}

export function toUserPublic(user: Pick<User, "id" | "username" | "avatarColor" | "role">): UserPublic {
  return {
    id: user.id,
    username: user.username,
    avatarColor: user.avatarColor,
    role: user.role as UserPublic["role"],
  };
}

type MessageWithUser = Message & { user?: Pick<User, "id" | "username" | "avatarColor" | "role"> | null };

/** Prisma 的 Message 实体 → 前端使用的 DTO（Date 序列化为 ISO 字符串）。
 *  查询时可以用 include 带出 user；AI/系统消息没有 user，直接传 null 或不传。 */
export function toMessageDto(message: MessageWithUser): MessageDto {
  return {
    id: message.id,
    content: message.content,
    type: message.type as MessageDto["type"],
    createdAt: message.createdAt.toISOString(),
    roomId: message.roomId,
    user: message.user ? toUserPublic(message.user) : null,
  };
}
