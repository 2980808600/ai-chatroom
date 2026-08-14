import { useState } from "react";
import { ChatProvider, useChat } from "../context/ChatContext";
import { useAuth } from "../context/AuthContext";
import RoomSidebar from "../components/RoomSidebar";
import MessageList from "../components/MessageList";
import DmMessageList from "../components/DmMessageList";
import MessageInput from "../components/MessageInput";
import AiPanel from "../components/AiPanel";

/**
 * 聊天室主界面布局：
 * [ 侧栏（频道/私信） ] [ 主区（房间聊天 或 私聊） ] [ AI 助手面板 ]
 */
function ChatInner({ onOpenAdmin }: { onOpenAdmin: () => void }) {
  const { user, logout } = useAuth();
  const {
    view,
    activeRoomId,
    rooms,
    onlineUsers,
    typingUsers,
    notice,
    clearNotice,
    activeDmUserId,
    dmUserMap,
    closeDm,
  } = useChat();
  const [aiOpen, setAiOpen] = useState(true);

  const activeRoom = rooms.find((r) => r.id === activeRoomId) ?? null;
  const typingList = typingUsers[activeRoomId ?? ""] ?? [];
  const onlineCount = (onlineUsers[activeRoomId ?? ""] ?? []).length;

  const isDm = view === "dm" && activeDmUserId !== null;
  const dmUser = activeDmUserId ? dmUserMap[activeDmUserId] : null;

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <RoomSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* 头部：房间/私聊信息 + 操作按钮 */}
        <header className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold">
              {isDm ? (
                <>
                  💬 私聊 · {dmUser?.username ?? "…"}
                  <button
                    onClick={closeDm}
                    className="ml-3 text-xs font-normal text-indigo-400 hover:underline"
                  >
                    ← 返回频道
                  </button>
                </>
              ) : activeRoom ? (
                <>
                  # {activeRoom.name}
                  <span className="ml-2 text-xs font-normal text-zinc-500">{onlineCount} 人在线</span>
                </>
              ) : (
                "选择一个房间"
              )}
            </h1>
            <p className="truncate text-xs text-zinc-500">
              {isDm ? "一对一实时私聊" : activeRoom?.description ?? "左侧选择或创建房间"}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {!isDm && typingList.length > 0 && (
              <span className="text-xs text-indigo-400">
                {typingList.map((u) => u.username).join("、")} 正在输入…
              </span>
            )}
            {user?.role === "ADMIN" && (
              <button
                onClick={onOpenAdmin}
                className="rounded-lg border border-amber-500/50 px-3 py-1.5 text-sm text-amber-300 transition hover:bg-amber-500/10"
              >
                🛠 管理后台
              </button>
            )}
            <button
              onClick={() => setAiOpen((v) => !v)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                aiOpen
                  ? "border-indigo-500 bg-indigo-500/20 text-indigo-300"
                  : "border-zinc-700 text-zinc-400 hover:border-zinc-600"
              }`}
              title="打开 / 收起 AI 助手面板"
            >
              🤖 AI 助手
            </button>
            <button
              onClick={logout}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200"
            >
              退出
            </button>
          </div>
        </header>

        {/* 全局提示条 */}
        {notice && (
          <div className="flex items-center justify-between border-b border-amber-500/30 bg-amber-500/10 px-5 py-2 text-sm text-amber-300">
            <span>{notice}</span>
            <button className="ml-3 opacity-60 hover:opacity-100" onClick={clearNotice}>
              ✕
            </button>
          </div>
        )}

        {isDm ? <DmMessageList /> : <MessageList />}
        <MessageInput />
      </div>

      {aiOpen && <AiPanel />}
    </div>
  );
}

export default function Chat({ onOpenAdmin }: { onOpenAdmin: () => void }) {
  return (
    <ChatProvider>
      <ChatInner onOpenAdmin={onOpenAdmin} />
    </ChatProvider>
  );
}
