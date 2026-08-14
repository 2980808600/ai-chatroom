/**
 * 前后端共用的数据类型定义。
 * 注意：这些类型描述的是「经过 JSON 序列化后」的数据（Date 都会变成字符串），
 * 这样前端拿到的对象可以直接按这些类型使用。
 */

/** 消息类型：普通文本 / 系统消息（如 AI 总结）/ AI 消息 / 图片 */
export type MessageType = "TEXT" | "SYSTEM" | "AI" | "IMAGE";

/** 用户角色：普通用户（AI 有配额）/ 会员（不限量）/ 管理员 */
export type UserRole = "USER" | "MEMBER" | "ADMIN";

/** 对外暴露的用户信息（绝不包含密码哈希） */
export interface UserPublic {
  id: string;
  username: string;
  avatarColor: string;
  role: UserRole;
}

export interface RoomDto {
  id: string;
  name: string;
  description: string;
  createdAt: string;
}

export interface MessageDto {
  id: string;
  content: string;
  type: MessageType;
  createdAt: string;
  roomId: string;
  /** 人类消息才有 user；AI / 系统消息为 null */
  user: UserPublic | null;
}

/** AI 私聊会话模式：通用问答 / 代码排错 */
export type AiMode = "GENERAL" | "DEBUG";

export interface AiConversationDto {
  id: string;
  title: string;
  mode: AiMode;
  createdAt: string;
}

export interface AiMessageDto {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: UserPublic;
}

/** 在线用户（房间内） */
export interface OnlineUser extends UserPublic {}

// ---------- Socket 事件 payload ----------

/** AI 流式输出的范围：私聊会话 或 房间 */
export interface AiDeltaPayload {
  scope: "conversation" | "room";
  /** conversationId 或 roomId */
  targetId: string;
  delta: string;
}

export interface AiDonePayload {
  scope: "conversation" | "room";
  targetId: string;
  /** 私聊场景返回落库后的助手消息 */
  message?: AiMessageDto;
  /** 新建会话时返回会话信息 */
  conversation?: AiConversationDto;
}

export interface AiErrorPayload {
  scope: "conversation" | "room" | "global";
  targetId?: string;
  message: string;
}

export interface AiChatPayload {
  /** 传 null 表示新建会话 */
  conversationId: string | null;
  content: string;
  mode: AiMode;
  /** 是否开启联网搜索 */
  search?: boolean;
  /**
   * 图片 URL（AI 看图预留接口）：
   * - Claude 供应商：作为图片内容块发给模型
   * - DeepSeek 供应商：不支持视觉，返回友好提示
   */
  imageUrl?: string;
}

// ---------- 私聊 DM ----------

export interface DmMessageDto {
  id: string;
  content: string;
  type: "TEXT" | "IMAGE";
  createdAt: string;
  readAt: string | null;
  senderId: string;
}

/** 私聊会话列表项：对方是谁 + 最后一条消息 + 未读数 */
export interface DmConversationDto {
  user: UserPublic;
  lastMessage: {
    content: string;
    type: "TEXT" | "IMAGE";
    createdAt: string;
  };
  unreadCount: number;
}

/** AI 配额信息 */
export interface AiQuotaDto {
  role: UserRole;
  /** 每日上限（unlimited 为 true 时忽略） */
  unlimited: boolean;
  usedToday: number;
  dailyLimit: number;
}

export interface AiRoomPayload {
  roomId: string;
  content: string;
}export interface AiSummarizePayload {
  roomId: string;
  /** 要总结的最近消息条数，默认 50，最大 100 */
  limit?: number;
}

export interface TypingPayload {
  roomId: string;
  user: UserPublic;
}
