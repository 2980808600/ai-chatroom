import { useEffect, useRef } from "react";
import { useChat } from "../context/ChatContext";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

/** 私聊消息流：我发的靠右，对方靠左；图片直接展示 */
export default function DmMessageList() {
  const { activeDmUserId, dmMessages, dmUserMap } = useChat();
  const bottomRef = useRef<HTMLDivElement>(null);

  const list = activeDmUserId ? (dmMessages[activeDmUserId] ?? []) : [];
  const other = activeDmUserId ? dmUserMap[activeDmUserId] : null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [list.length]);

  if (!activeDmUserId) {
    return (
      <div className="flex flex-1 items-center justify-center text-zinc-600">
        <p className="text-sm">在左侧「私信」里选择一个会话</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4">
      {list.length === 0 && (
        <p className="mt-8 text-center text-xs text-zinc-600">
          这是你和 {other?.username ?? "对方"} 的私聊，打个招呼吧 👋
        </p>
      )}
      {list.map((m) => {
        const mine = m.senderId !== activeDmUserId;
        return (
          <div key={m.id} className={`mb-3 flex ${mine ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[70%] rounded-2xl px-3.5 py-2 text-sm ${
                mine
                  ? "rounded-br-sm bg-indigo-600 text-white"
                  : "rounded-bl-sm border border-zinc-800 bg-zinc-900"
              }`}
            >
              {m.type === "IMAGE" ? (
                <img
                  src={m.content}
                  alt="图片"
                  className="max-h-64 rounded-lg"
                  onClick={() => window.open(m.content, "_blank")}
                />
              ) : (
                <p className="whitespace-pre-wrap break-words">{m.content}</p>
              )}
              <div className={`mt-1 text-right text-[10px] ${mine ? "text-indigo-200/70" : "text-zinc-600"}`}>
                {formatTime(m.createdAt)}
                {mine && <span className="ml-1">{m.readAt ? "已读" : "未读"}</span>}
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
