import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { SOCKET_EVENTS } from "shared";
import type {
  AiConversationDto,
  AiDeltaPayload,
  AiDonePayload,
  AiErrorPayload,
  AiMessageDto,
  AiMode,
  AiQuotaDto,
} from "shared";
import { getSocket } from "../api/socket";
import { http, apiErrorMessage } from "../api/http";
import Markdown from "./Markdown";

/**
 * AI 私聊助手面板：
 * - 独立于房间聊天的私人对话（多轮记忆）
 * - 两种模式：通用问答 / 代码排错（排错模式用更专业的 prompt + 更长输出）
 * - 流式打字机输出 + 「停止生成」按钮
 * - 会话管理：新建 / 切换 / 删除
 */
export default function AiPanel() {
  const [conversations, setConversations] = useState<AiConversationDto[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiMessageDto[]>([]);
  const [streaming, setStreaming] = useState("");
  const [generating, setGenerating] = useState(false);
  const [mode, setMode] = useState<AiMode>("GENERAL");
  const [searchOn, setSearchOn] = useState(false);
  const [quota, setQuota] = useState<AiQuotaDto | null>(null);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  /** 拉取今日 AI 配额（普通用户显示剩余次数，会员/管理员不限量） */
  const loadQuota = useCallback(() => {
    http.get<AiQuotaDto>("/ai/quota").then((res) => setQuota(res.data)).catch(() => {});
  }, []);

  const activeIdRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  // 乐观插入的用户消息（收到全局错误时回滚，避免展示一条没存进数据库的消息）
  const pendingRef = useRef<string | null>(null);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  // 挂载时加载会话列表；有会话就打开第一个
  useEffect(() => {
    http
      .get<AiConversationDto[]>("/ai/conversations")
      .then((res) => {
        setConversations(res.data);
        if (res.data.length > 0) {
          setActiveId(res.data[0].id);
          setMode(res.data[0].mode);
        }
      })
      .catch(() => {});
    loadQuota();
  }, [loadQuota]);

  // 切换会话时加载它的历史消息
  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    http
      .get<AiMessageDto[]>(`/ai/conversations/${activeId}/messages`)
      .then((res) => setMessages(res.data))
      .catch(() => setMessages([]));
    setStreaming("");
    setGenerating(false);
  }, [activeId]);

  // socket 事件：流式增量 / 完成 / 错误 / 新会话
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onDelta = (payload: AiDeltaPayload) => {
      if (payload.scope !== "conversation") return;
      // 只渲染当前会话的流（中途切走的话，内容已在服务端落库，切回来即可见）
      if (activeIdRef.current === payload.targetId) {
        setStreaming((prev) => prev + payload.delta);
      }
    };

    const onDone = (payload: AiDonePayload) => {
      if (payload.scope !== "conversation") return;
      if (payload.message && activeIdRef.current === payload.targetId) {
        setMessages((prev) => [...prev, payload.message!]);
        setStreaming("");
        setGenerating(false);
      }
      pendingRef.current = null;
      // AI 请求完成 → 刷新剩余配额
      loadQuota();
    };

    const onConversationNew = (conversation: AiConversationDto) => {
      setConversations((prev) => [conversation, ...prev]);
      setActiveId(conversation.id);
      setMessages([]);
      setStreaming("");
      setMode(conversation.mode);
      pendingRef.current = null;
    };

    const onError = (payload: AiErrorPayload) => {
      setGenerating(false);
      setStreaming("");
      setError(payload.message);
      // 全局错误发生在服务端落库之前：回滚乐观插入的用户消息
      if (payload.scope === "global" && pendingRef.current) {
        setMessages((prev) => prev.filter((m) => m.content !== pendingRef.current));
        pendingRef.current = null;
      }
    };

    socket.on(SOCKET_EVENTS.aiDelta, onDelta);
    socket.on(SOCKET_EVENTS.aiDone, onDone);
    socket.on(SOCKET_EVENTS.aiConversationNew, onConversationNew);
    socket.on(SOCKET_EVENTS.aiError, onError);
    return () => {
      socket.off(SOCKET_EVENTS.aiDelta, onDelta);
      socket.off(SOCKET_EVENTS.aiDone, onDone);
      socket.off(SOCKET_EVENTS.aiConversationNew, onConversationNew);
      socket.off(SOCKET_EVENTS.aiError, onError);
    };
  }, []);

  // 自动滚动
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streaming.length]);

  const handleSend = useCallback(() => {
    const socket = getSocket();
    const content = input.trim();
    if (!socket || !content || generating) return;

    setError(null);
    setGenerating(true);
    setStreaming("");
    // 乐观插入：服务端也会落库，这里先展示（全局错误时会回滚）
    pendingRef.current = content;
    setMessages((prev) => [
      ...prev,
      { id: `pending-${Date.now()}`, role: "user", content, createdAt: new Date().toISOString() },
    ]);
    setInput("");
    socket.emit(SOCKET_EVENTS.aiChat, { conversationId: activeIdRef.current, content, mode, search: searchOn });
  }, [input, generating, mode, searchOn]);

  const handleStop = useCallback(() => {
    getSocket()?.emit(SOCKET_EVENTS.aiChatStop);
    setGenerating(false);
    setStreaming("");
    pendingRef.current = null;
  }, []);

  const handleNew = useCallback(() => {
    setActiveId(null);
    setMessages([]);
    setStreaming("");
    setGenerating(false);
    setError(null);
    pendingRef.current = null;
  }, []);

  const handleDelete = useCallback(async () => {
    if (!activeId || !window.confirm("删除当前会话？其中的对话记录会一并删除。")) return;
    try {
      await http.delete(`/ai/conversations/${activeId}`);
      setConversations((prev) => prev.filter((c) => c.id !== activeId));
      const next = conversations.find((c) => c.id !== activeId);
      setActiveId(next?.id ?? null);
      if (next) setMode(next.mode);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }, [activeId, conversations]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <aside className="flex w-[400px] shrink-0 flex-col border-l border-zinc-800 bg-zinc-900/60">
      {/* 头部：标题 + 模式切换 */}
      <div className="border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">🤖 AI 助手</h2>
            {/* 配额徽章：普通用户显示剩余次数；会员/管理员显示无限 */}
            {quota && (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] ${
                  quota.unlimited
                    ? "bg-amber-500/15 text-amber-300"
                    : quota.usedToday >= quota.dailyLimit
                      ? "bg-red-500/15 text-red-300"
                      : "bg-zinc-800 text-zinc-400"
                }`}
                title="今日 AI 使用配额"
              >
                {quota.unlimited ? "♾ 会员不限量" : `今日剩余 ${Math.max(0, quota.dailyLimit - quota.usedToday)} 次`}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex rounded-lg border border-zinc-700 p-0.5 text-xs">
              <button
                onClick={() => setMode("GENERAL")}
                className={`rounded-md px-2.5 py-1 transition ${
                  mode === "GENERAL" ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                通用问答
              </button>
              <button
                onClick={() => setMode("DEBUG")}
                className={`rounded-md px-2.5 py-1 transition ${
                  mode === "DEBUG" ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                🐞 排错
              </button>
            </div>
            <button
              onClick={() => setSearchOn((v) => !v)}
              className={`rounded-lg border px-2.5 py-1 text-xs transition ${
                searchOn
                  ? "border-sky-500 bg-sky-500/20 text-sky-300"
                  : "border-zinc-700 text-zinc-400 hover:border-zinc-600"
              }`}
              title="开启后 AI 会先联网搜索再回答（需在 server/.env 配置搜索服务）"
            >
              🔍 联网
            </button>
          </div>
        </div>

        {/* 会话管理 */}
        <div className="mt-3 flex items-center gap-2">
          <select
            className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm outline-none"
            value={activeId ?? ""}
            onChange={(e) => {
              const next = conversations.find((c) => c.id === e.target.value);
              setActiveId(e.target.value || null);
              if (next) setMode(next.mode);
            }}
          >
            <option value="">＋ 新对话</option>
            {conversations.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title} {c.mode === "DEBUG" ? "· 排错" : ""}
              </option>
            ))}
          </select>
          <button
            onClick={handleNew}
            className="rounded-lg border border-zinc-700 px-2.5 py-1.5 text-sm text-zinc-400 transition hover:border-indigo-500 hover:text-indigo-300"
            title="新建对话"
          >
            ＋
          </button>
          <button
            onClick={() => void handleDelete()}
            disabled={!activeId}
            className="rounded-lg border border-zinc-700 px-2.5 py-1.5 text-sm text-zinc-400 transition hover:border-red-500 hover:text-red-400 disabled:opacity-40"
            title="删除当前对话"
          >
            🗑
          </button>
        </div>
      </div>

      {/* 消息区 */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 && streaming.length === 0 && (
          <div className="mt-8 text-center text-sm text-zinc-600">
            <p className="text-3xl">🤖</p>
            <p className="mt-3">{mode === "GENERAL" ? "和 AI 聊点什么吧" : "粘贴代码和报错信息，AI 帮你排错"}</p>
            <div className="mt-4 flex flex-col gap-2 text-left text-xs">
              <p className="font-medium text-zinc-500">可以试试：</p>
              <p className="rounded-lg bg-zinc-800/60 px-3 py-2">
                {mode === "GENERAL"
                  ? "「用通俗的话解释什么是闭包」"
                  : "「我的代码报 TypeError: Cannot read properties of undefined，代码如下：\n```js\n…\n```」"}
              </p>
            </div>
          </div>
        )}

        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="mb-3 flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-indigo-600 px-3.5 py-2 text-sm whitespace-pre-wrap break-words">
                {m.content}
              </div>
            </div>
          ) : (
            <div key={m.id} className="mb-3 flex justify-start">
              <div className="max-w-[85%] rounded-2xl rounded-bl-sm border border-zinc-800 bg-zinc-950 px-3.5 py-2 text-sm">
                <Markdown content={m.content} />
              </div>
            </div>
          ),
        )}

        {/* 流式输出气泡 */}
        {streaming.length > 0 && (
          <div className="mb-3 flex justify-start">
            <div className="max-w-[85%] rounded-2xl rounded-bl-sm border border-zinc-800 bg-zinc-950 px-3.5 py-2 text-sm">
              <span className="typing-cursor">
                <Markdown content={streaming} />
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mx-4 mb-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* 输入区 */}
      <div className="border-t border-zinc-800 px-4 py-3">
        <textarea
          className="max-h-40 min-h-[80px] w-full resize-none rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-2.5 text-sm outline-none transition placeholder:text-zinc-600 focus:border-indigo-500"
          placeholder={
            mode === "GENERAL"
              ? searchOn
                ? "开启联网搜索中，问点最新资讯…（Enter 发送）"
                : "问点什么…（Enter 发送，Shift+Enter 换行）"
              : "粘贴代码 + 报错信息…（Enter 发送，Shift+Enter 换行）"
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="mt-2 flex justify-end gap-2">
          {generating && (
            <button
              onClick={handleStop}
              className="rounded-lg border border-red-500/50 px-3 py-1.5 text-xs text-red-300 transition hover:bg-red-500/10"
            >
              ⏹ 停止生成
            </button>
          )}
          <button
            onClick={handleSend}
            disabled={!input.trim() || generating}
            className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-medium transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            发送
          </button>
        </div>
      </div>
    </aside>
  );
}
