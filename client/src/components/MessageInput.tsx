import { useRef, useState, type KeyboardEvent } from "react";
import { useChat } from "../context/ChatContext";
import { http, apiErrorMessage } from "../api/http";

/**
 * 消息输入框（频道/私聊双模式复用）：
 * - Enter 发送，Shift+Enter 换行
 * - 📷 图片上传（先传后发：POST /api/upload/image → 拿 URL → 随消息发出）
 * - 频道模式附加「@AI 提问」「总结最近消息」按钮
 */
export default function MessageInput() {
  const { activeRoomId, sendMessage, summarizeRoom, view, activeDmUserId, sendDm } = useChat();
  const [value, setValue] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const isDm = view === "dm" && activeDmUserId !== null;
  const disabled = isDm ? false : !activeRoomId;

  const handleSend = () => {
    const content = value.trim();
    if (!content && !imageUrl) return;
    if (isDm) {
      sendDm(content || "", imageUrl ?? undefined);
    } else {
      sendMessage(content || "", imageUrl ?? undefined);
    }
    setValue("");
    setImageUrl(null);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePickImage = async (file: File | undefined) => {
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("image", file);
      const res = await http.post<{ url: string }>("/upload/image", form);
      setImageUrl(res.data.url);
    } catch (err) {
      setUploadError(apiErrorMessage(err));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleAtAi = () => {
    setValue((v) => (v.startsWith("@AI") ? v : "@AI " + v));
  };

  return (
    <div className="border-t border-zinc-800 px-5 py-3">
      {/* 图片预览 */}
      {(imageUrl || uploading) && (
        <div className="mb-2 flex items-center gap-2">
          {imageUrl ? (
            <>
              <img src={imageUrl} alt="待发送" className="h-16 rounded-lg border border-zinc-700" />
              <button onClick={() => setImageUrl(null)} className="text-xs text-zinc-500 hover:text-red-400">
                ✕ 移除
              </button>
            </>
          ) : (
            <span className="text-xs text-zinc-500">图片上传中…</span>
          )}
          {uploadError && <span className="text-xs text-red-400">{uploadError}</span>}
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* 图片按钮 */}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="hidden"
          onChange={(e) => void handlePickImage(e.target.files?.[0])}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={disabled || uploading}
          className="rounded-xl border border-zinc-700 px-3 py-2.5 text-sm transition hover:border-indigo-500 hover:text-indigo-300 disabled:opacity-40"
          title="发送图片"
        >
          📷
        </button>

        <textarea
          className="max-h-32 min-h-[42px] flex-1 resize-none rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm outline-none transition placeholder:text-zinc-600 focus:border-indigo-500"
          placeholder={
            isDm
              ? "发私信…"
              : activeRoomId
                ? "发消息，@AI 开头召唤 AI 机器人…"
                : "先选择一个房间"
          }
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={1}
        />
        <button
          onClick={handleSend}
          disabled={disabled || (!value.trim() && !imageUrl)}
          className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          发送
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
        {!isDm && (
          <>
            <button
              onClick={handleAtAi}
              disabled={!activeRoomId}
              className="rounded-full border border-zinc-700 px-3 py-1 transition hover:border-indigo-500 hover:text-indigo-300 disabled:opacity-40"
            >
              @AI 提问
            </button>
            <button
              onClick={summarizeRoom}
              disabled={!activeRoomId}
              className="rounded-full border border-zinc-700 px-3 py-1 transition hover:border-indigo-500 hover:text-indigo-300 disabled:opacity-40"
            >
              📋 总结最近消息
            </button>
          </>
        )}
        <span className="ml-auto hidden sm:inline">Enter 发送 · Shift+Enter 换行</span>
      </div>
    </div>
  );
}
