import { useEffect, useRef } from "react";
import { useChat } from "../context/ChatContext";
import MessageBubble from "./MessageBubble";
import Markdown from "./Markdown";

/**
 * 消息流：当前房间的历史消息 + 房间级 AI 流式输出的「打字中」气泡。
 * 新消息到达时自动滚动到底部。
 */
export default function MessageList() {
  const { activeRoomId, messages, streamingText, aiGenerating } = useChat();
  const bottomRef = useRef<HTMLDivElement>(null);

  const roomMessages = activeRoomId ? (messages[activeRoomId] ?? []) : [];
  const streaming = activeRoomId ? (streamingText[activeRoomId] ?? "") : "";
  const generating = activeRoomId ? (aiGenerating[activeRoomId] ?? false) : false;

  // 消息或流式文本变化时滚到底部
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [roomMessages.length, streaming.length]);

  if (!activeRoomId) {
    return (
      <div className="flex flex-1 items-center justify-center text-zinc-600">
        <div className="text-center">
          <p className="text-4xl">💬</p>
          <p className="mt-3 text-sm">从左侧选择一个房间开始聊天</p>
          <p className="mt-1 text-xs">发送以 @AI 开头的消息可以召唤 AI 机器人</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto py-3">
      {roomMessages.map((m) => (
        <MessageBubble key={m.id} message={m} />
      ))}

      {/* 房间级 AI 流式气泡：@AI 回复 / 消息总结的实时打字效果 */}
      {(streaming.length > 0 || generating) && (
        <div className="flex gap-3 px-5 py-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-lg">
            🤖
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-medium text-indigo-300">AI 助手</span>
              <span className="text-xs text-indigo-500">正在输入…</span>
            </div>
            <div className="mt-0.5 text-sm text-zinc-100">
              {streaming.length === 0 ? (
                <span className="text-zinc-500">思考中…</span>
              ) : (
                <span className="typing-cursor">
                  <Markdown content={streaming} />
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
