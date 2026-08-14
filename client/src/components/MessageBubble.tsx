import type { MessageDto } from "shared";
import Markdown from "./Markdown";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

/** 头像：人类用户用用户名首字母 + 颜色圆，AI 用 🤖 */
function Avatar({ message }: { message: MessageDto }) {
  if (message.type === "AI") {
    return (
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-lg">
        🤖
      </span>
    );
  }
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
      style={{ backgroundColor: message.user?.avatarColor ?? "#52525b" }}
    >
      {(message.user?.username ?? "?").charAt(0).toUpperCase()}
    </span>
  );
}

export default function MessageBubble({ message }: { message: MessageDto }) {
  // 系统消息（如 AI 总结）：居中卡片样式
  if (message.type === "SYSTEM") {
    return (
      <div className="my-2 flex justify-center">
        <div className="max-w-[80%] rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-3">
          <div className="mb-1 text-xs font-medium text-indigo-300">📋 系统 · {formatTime(message.createdAt)}</div>
          <div className="text-sm">
            <Markdown content={message.content} />
          </div>
        </div>
      </div>
    );
  }

  const isAi = message.type === "AI";
  const isImage = message.type === "IMAGE";

  return (
    <div className="flex gap-3 px-5 py-2 hover:bg-zinc-900/40">
      <Avatar message={message} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={`text-sm font-medium ${isAi ? "text-indigo-300" : "text-zinc-200"}`}>
            {isAi ? "AI 助手" : message.user?.username ?? "未知用户"}
          </span>
          <span className="text-xs text-zinc-600">{formatTime(message.createdAt)}</span>
        </div>
        <div className="mt-0.5 text-sm text-zinc-100">
          {isImage ? (
            <img
              src={message.content}
              alt="图片"
              className="max-h-72 cursor-pointer rounded-lg border border-zinc-800"
              onClick={() => window.open(message.content, "_blank")}
            />
          ) : isAi ? (
            <Markdown content={message.content} />
          ) : (
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          )}
        </div>
      </div>
    </div>
  );
}
