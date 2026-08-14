/**
 * AI 功能的事件处理：私聊助手（通用/排错/联网搜索）、群聊 @AI 机器人、群聊总结。
 *
 * 统一的流式流程（runStream）：
 *   请求供应商（流式）→ 每个 token 增量 emit ai:delta → 结束后落库 → emit ai:done
 * 每次请求无论成败都记入 AiRequestLog（配额判断 + 成本报表的数据基础）。
 */
import type { Server } from "socket.io";
import { z } from "zod";
import { SOCKET_EVENTS } from "shared";
import type {
  AiChatPayload,
  AiDeltaPayload,
  AiDonePayload,
  AiErrorPayload,
  AiRoomPayload,
  AiSummarizePayload,
} from "shared";
import { prisma } from "../prisma.js";
import { toMessageDto } from "../utils.js";
import { checkRateLimit } from "../ai/rate-limit.js";
import { AiNotConfiguredError, activeProvider, aiEnabled, streamAi, type ChatMessage } from "../ai/provider.js";
import { checkAiQuota, recordAiRequest } from "../ai/usage.js";
import {
  DEBUG_SYSTEM_PROMPT,
  GENERAL_SYSTEM_PROMPT,
  ROOM_BOT_SYSTEM_PROMPT,
  SUMMARIZE_SYSTEM_PROMPT,
} from "../ai/prompts.js";
import { abortUserStream, hasActiveStream, registerStream, unregisterStream } from "./stream-registry.js";
import { roomChannel } from "./room-state.js";
import type { AuthedSocket } from "./index.js";

// ---------- 参数 schema ----------

const aiChatSchema = z.object({
  conversationId: z.string().nullable(),
  content: z.string().trim().min(1, "内容不能为空").max(8000, "内容太长啦"),
  mode: z.enum(["GENERAL", "DEBUG"]).default("GENERAL"),
  search: z.boolean().optional().default(false),
  // AI 看图预留字段：Claude 支持，DeepSeek 会返回友好提示
  imageUrl: z.string().optional(),
});

const aiSummarizeSchema = z.object({
  roomId: z.string().min(1),
  limit: z.number().int().min(1).max(100).optional(),
});

// ---------- 工具函数 ----------

function emitAiError(socket: AuthedSocket, payload: AiErrorPayload): void {
  socket.emit(SOCKET_EVENTS.aiError, payload);
}

/**
 * AI 请求前的关卡（按顺序）：
 * 1. 供应商有没有配置
 * 2. 账号状态（被封禁？）
 * 3. 每日配额（USER 每天 N 次，MEMBER/ADMIN 不限）
 * 4. 滑动窗口限流（只约束普通用户，防突发刷量）
 * 5. 并发互斥（同一用户同时只能有一个 AI 请求在跑）
 */
async function canRequestAi(socket: AuthedSocket): Promise<boolean> {
  if (!aiEnabled) {
    emitAiError(socket, {
      scope: "global",
      message:
        "服务器未配置任何 AI 服务的 API Key（支持 Claude 的 ANTHROPIC_API_KEY 或 DeepSeek 的 DEEPSEEK_API_KEY）。请按 README 指引在 server/.env 中配置后重启。",
    });
    return false;
  }

  // 每次请求都读一次数据库：角色/封禁变化立即生效
  const user = await prisma.user.findUnique({
    where: { id: socket.data.userId },
    select: { id: true, role: true, banned: true },
  });
  if (!user || user.banned) {
    emitAiError(socket, { scope: "global", message: "账号状态异常，无法使用 AI 功能" });
    return false;
  }

  const quota = await checkAiQuota(user);
  if (!quota.allowed) {
    emitAiError(socket, { scope: "global", message: quota.message! });
    return false;
  }

  if (user.role === "USER" && !checkRateLimit(socket.data.userId)) {
    emitAiError(socket, {
      scope: "global",
      message: "请求太频繁啦：每 10 分钟最多 20 次 AI 请求，休息一下吧。",
    });
    return false;
  }

  if (hasActiveStream(socket.data.userId)) {
    emitAiError(socket, {
      scope: "global",
      message: "上一个 AI 请求还在生成中，请等它结束或先点击「停止」。",
    });
    return false;
  }
  return true;
}

interface RunStreamOptions {
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
  /** 请求用途：chat | room | summarize（记账用） */
  scope: string;
  /** 联网搜索（见 ai/types.ts 的说明） */
  webSearch?: { query: string };
  /** 图片 URL（AI 看图预留接口） */
  imageUrl?: string;
  /** 每个文本增量：转发给前端（私聊发给自己，群聊广播给房间） */
  emitDelta: (delta: string) => void;
  /** 流式完成（非拒绝）：把完整文本落库并通知前端 */
  onComplete: (text: string) => Promise<void>;
  /** 被安全策略拒绝 */
  onRefused: () => void;
  /** 出错（API 异常等） */
  onError: (message: string) => void;
}

/** 统一的流式执行器：登记 AbortController、记账、异常兜底、finally 清理 */
async function runStream(socket: AuthedSocket, options: RunStreamOptions): Promise<void> {
  const controller = new AbortController();
  registerStream(socket.data.userId, controller);
  const provider = activeProvider ?? "unknown";

  try {
    const result = await streamAi({
      system: options.system,
      messages: options.messages,
      maxTokens: options.maxTokens,
      webSearch: options.webSearch,
      imageUrl: options.imageUrl,
      onDelta: options.emitDelta,
      signal: controller.signal,
    });

    if (result.refused) {
      await recordAiRequest({ userId: socket.data.userId, provider, scope: options.scope, status: "REFUSED" });
      options.onRefused();
    } else {
      await recordAiRequest({
        userId: socket.data.userId,
        provider,
        scope: options.scope,
        status: "OK",
        inputTokens: result.usage?.inputTokens,
        outputTokens: result.usage?.outputTokens,
      });
      await options.onComplete(result.text);
    }
  } catch (err) {
    // 用户主动点「停止」会触发 abort——这不是错误，静默返回即可
    if (controller.signal.aborted) return;
    await recordAiRequest({ userId: socket.data.userId, provider, scope: options.scope, status: "ERROR" });
    if (err instanceof AiNotConfiguredError) {
      options.onError(err.message);
      return;
    }
    console.error("[AI] 流式请求失败：", err);
    options.onError("AI 服务出错了，请稍后再试。");
  } finally {
    unregisterStream(socket.data.userId);
  }
}

/** 取会话最近 20 条消息，拼成模型需要的 messages 数组（多轮记忆） */
async function buildConversationMessages(conversationId: string): Promise<ChatMessage[]> {
  const history = await prisma.aiMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return history.reverse().map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));
}

// ---------- 事件注册 ----------

export function registerAiHandlers(socket: AuthedSocket, io: Server): void {
  // ========== 私聊助手 ==========
  socket.on(SOCKET_EVENTS.aiChat, async (raw: unknown) => {
    const parsed = aiChatSchema.safeParse(raw);
    if (!parsed.success) {
      emitAiError(socket, { scope: "global", message: "参数错误" });
      return;
    }
    const payload = parsed.data as AiChatPayload;
    if (!(await canRequestAi(socket))) return;

    // 找会话：没传 conversationId 就新建一个（标题取首条消息前 30 字）
    let conversation;
    if (payload.conversationId) {
      conversation = await prisma.aiConversation.findFirst({
        where: { id: payload.conversationId, userId: socket.data.userId },
      });
      if (!conversation) {
        emitAiError(socket, { scope: "global", message: "会话不存在或已被删除" });
        return;
      }
      // 切换模式时同步更新会话
      if (conversation.mode !== payload.mode) {
        conversation = await prisma.aiConversation.update({
          where: { id: conversation.id },
          data: { mode: payload.mode },
        });
      }
    } else {
      conversation = await prisma.aiConversation.create({
        data: {
          userId: socket.data.userId,
          title: payload.content.slice(0, 30),
          mode: payload.mode,
        },
      });
      socket.emit(SOCKET_EVENTS.aiConversationNew, {
        id: conversation.id,
        title: conversation.title,
        mode: conversation.mode,
        createdAt: conversation.createdAt.toISOString(),
      });
    }

    const targetId = conversation.id;

    // 图片（AI 看图预留接口）：DeepSeek 无视觉能力，直接给友好提示；Claude 走图片内容块
    if (payload.imageUrl && activeProvider !== "anthropic") {
      emitAiError(socket, {
        scope: "conversation",
        targetId,
        message: "当前 AI 供应商不支持图片输入（DeepSeek 无视觉能力）。接入视觉模型后即可使用。",
      });
      return;
    }

    // 用户消息先落库（即使 AI 中途失败，用户说过的话也不丢）
    await prisma.aiMessage.create({
      data: { conversationId: targetId, role: "user", content: payload.content },
    });

    await runStream(socket, {
      system: conversation.mode === "DEBUG" ? DEBUG_SYSTEM_PROMPT : GENERAL_SYSTEM_PROMPT,
      messages: await buildConversationMessages(targetId),
      maxTokens: conversation.mode === "DEBUG" ? 8192 : 4096,
      scope: "chat",
      webSearch: payload.search ? { query: payload.content } : undefined,
      imageUrl: payload.imageUrl,
      emitDelta: (delta) => {
        socket.emit(SOCKET_EVENTS.aiDelta, {
          scope: "conversation",
          targetId,
          delta,
        } satisfies AiDeltaPayload);
      },
      onComplete: async (text) => {
        const message = await prisma.aiMessage.create({
          data: { conversationId: targetId, role: "assistant", content: text },
        });
        socket.emit(SOCKET_EVENTS.aiDone, {
          scope: "conversation",
          targetId,
          message: {
            id: message.id,
            role: "assistant",
            content: message.content,
            createdAt: message.createdAt.toISOString(),
          },
        } satisfies AiDonePayload);
      },
      onRefused: () => {
        emitAiError(socket, {
          scope: "conversation",
          targetId,
          message: "AI 出于安全策略拒绝了这个请求，请换一种问法。",
        });
      },
      onError: (message) => emitAiError(socket, { scope: "conversation", targetId, message }),
    });
  });

  // 停止生成
  socket.on(SOCKET_EVENTS.aiChatStop, () => {
    abortUserStream(socket.data.userId);
  });

  // ========== 群聊消息总结 ==========
  socket.on(SOCKET_EVENTS.aiSummarize, async (raw: unknown) => {
    const parsed = aiSummarizeSchema.safeParse(raw);
    if (!parsed.success || !(await canRequestAi(socket))) return;
    const payload = parsed.data as AiSummarizePayload;
    const { roomId } = payload;

    if (!socket.data.rooms.has(roomId)) return;

    // 取最近 limit 条人类和 AI 消息（系统消息本身是总结，不再参与总结）
    const recent = await prisma.message.findMany({
      where: { roomId, type: { in: ["TEXT", "AI"] } },
      orderBy: { createdAt: "desc" },
      take: Math.min(payload.limit ?? 50, 100),
      include: { user: { select: { id: true, username: true, avatarColor: true, role: true } } },
    });
    if (recent.length === 0) {
      emitAiError(socket, { scope: "room", targetId: roomId, message: "房间里还没有可以总结的消息" });
      return;
    }

    const transcript = recent
      .reverse()
      .map((m) => `[${m.user?.username ?? "AI 助手"}]：${m.content}`)
      .join("\n");

    await runStream(socket, {
      system: SUMMARIZE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: `以下是群聊记录，请总结：\n\n${transcript}` }],
      maxTokens: 4096,
      scope: "summarize",
      emitDelta: (delta) => {
        io.to(roomChannel(roomId)).emit(SOCKET_EVENTS.aiDelta, {
          scope: "room",
          targetId: roomId,
          delta,
        } satisfies AiDeltaPayload);
      },
      onComplete: async (text) => {
        const message = await prisma.message.create({
          data: { content: text, roomId, type: "SYSTEM" },
        });
        io.to(roomChannel(roomId)).emit(SOCKET_EVENTS.messageNew, toMessageDto(message));
        io.to(roomChannel(roomId)).emit(SOCKET_EVENTS.aiDone, {
          scope: "room",
          targetId: roomId,
        } satisfies AiDonePayload);
      },
      onRefused: () => {
        io.to(roomChannel(roomId)).emit(SOCKET_EVENTS.aiError, {
          scope: "room",
          targetId: roomId,
          message: "AI 拒绝了这个请求",
        } satisfies AiErrorPayload);
      },
      onError: (message) => {
        io.to(roomChannel(roomId)).emit(SOCKET_EVENTS.aiError, {
          scope: "room",
          targetId: roomId,
          message,
        } satisfies AiErrorPayload);
      },
    });
  });
}

// ========== 群聊 @AI 机器人 ==========
// 由 chat.handlers 检测到 @AI 前缀后调用（消息本身已作为普通消息落库并广播）

export async function handleAiRoom(socket: AuthedSocket, io: Server, payload: AiRoomPayload): Promise<void> {
  if (!(await canRequestAi(socket))) return;
  const { roomId, content } = payload;

  // 给机器人带上最近 10 条聊天记录做上下文，回答更贴题
  const recent = await prisma.message.findMany({
    where: { roomId },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { user: { select: { id: true, username: true, avatarColor: true, role: true } } },
  });
  const context = recent
    .reverse()
    .map((m) => `${m.user ? m.user.username : "[AI 助手]"}: ${m.content}`)
    .join("\n");

  await runStream(socket, {
    system: ROOM_BOT_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `以下是房间最近的聊天记录：\n${context}\n\n有人 @ 了你并提问：${content}`,
      },
    ],
    maxTokens: 4096,
    scope: "room",
    // 群聊场景：增量广播给整个房间，所有人实时看到 AI「打字」
    emitDelta: (delta) => {
      io.to(roomChannel(roomId)).emit(SOCKET_EVENTS.aiDelta, {
        scope: "room",
        targetId: roomId,
        delta,
      } satisfies AiDeltaPayload);
    },
    onComplete: async (text) => {
      const message = await prisma.message.create({
        data: { content: text, roomId, type: "AI" },
      });
      io.to(roomChannel(roomId)).emit(SOCKET_EVENTS.messageNew, toMessageDto(message));
      io.to(roomChannel(roomId)).emit(SOCKET_EVENTS.aiDone, {
        scope: "room",
        targetId: roomId,
      } satisfies AiDonePayload);
    },
    onRefused: () => {
      io.to(roomChannel(roomId)).emit(SOCKET_EVENTS.aiError, {
        scope: "room",
        targetId: roomId,
        message: "AI 出于安全策略拒绝了这个请求",
      } satisfies AiErrorPayload);
    },
    onError: (message) => {
      io.to(roomChannel(roomId)).emit(SOCKET_EVENTS.aiError, {
        scope: "room",
        targetId: roomId,
        message,
      } satisfies AiErrorPayload);
    },
  });
}
