import { useState, type FormEvent } from "react";
import { useChat } from "../context/ChatContext";
import { useAuth } from "../context/AuthContext";
import { apiErrorMessage } from "../api/http";
import type { UserPublic } from "shared";

/**
 * 左侧栏：频道列表 / 私信会话列表（标签页切换）+ 在线名单 + 当前用户。
 * 在线名单点人名可直接发起私聊。
 */
export default function RoomSidebar() {
  const {
    rooms,
    activeRoomId,
    onlineUsers,
    joinRoom,
    createRoom,
    dmConversations,
    totalUnread,
    openDm,
    setView,
    view,
  } = useChat();
  const { user, logout } = useAuth();

  const [tab, setTab] = useState<"rooms" | "dms">("rooms");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onlineList = onlineUsers[activeRoomId ?? ""] ?? [];

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await createRoom(name.trim(), description.trim());
      setName("");
      setDescription("");
      setCreating(false);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  };

  const handleClickUser = (u: UserPublic) => {
    void openDm(u.id, u);
  };

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900/60">
      {/* 品牌 */}
      <div className="border-b border-zinc-800 px-4 py-4">
        <h1 className="font-bold">✨ AI 聊天室</h1>
      </div>

      {/* 标签页：频道 / 私信 */}
      <div className="flex border-b border-zinc-800 text-sm">
        <button
          onClick={() => {
            setTab("rooms");
            setView("room");
          }}
          className={`flex-1 py-2.5 transition ${
            tab === "rooms" ? "border-b-2 border-indigo-500 text-indigo-300" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          🏠 频道
        </button>
        <button
          onClick={() => setTab("dms")}
          className={`relative flex-1 py-2.5 transition ${
            tab === "dms" ? "border-b-2 border-indigo-500 text-indigo-300" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          ✉️ 私信
          {totalUnread > 0 && (
            <span className="absolute right-2 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {totalUnread > 99 ? "99+" : totalUnread}
            </span>
          )}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {tab === "rooms" ? (
          <>
            {/* ---------- 频道列表 ---------- */}
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">房间</span>
              <button className="text-xs text-indigo-400 hover:underline" onClick={() => setCreating((v) => !v)}>
                {creating ? "收起" : "+ 新建"}
              </button>
            </div>

            {creating && (
              <form onSubmit={handleCreate} className="mb-3 flex flex-col gap-2 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                <input
                  className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm outline-none focus:border-indigo-500"
                  placeholder="房间名"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
                <input
                  className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm outline-none focus:border-indigo-500"
                  placeholder="描述（可选）"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
                {error && <p className="text-xs text-red-400">{error}</p>}
                <button
                  type="submit"
                  disabled={!name.trim()}
                  className="rounded bg-indigo-600 py-1.5 text-xs font-medium hover:bg-indigo-500 disabled:opacity-50"
                >
                  创建
                </button>
              </form>
            )}

            <ul className="flex flex-col gap-1">
              {rooms.map((room) => (
                <li key={room.id}>
                  <button
                    onClick={() => void joinRoom(room.id)}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                      room.id === activeRoomId && view === "room"
                        ? "bg-indigo-600/25 text-indigo-200"
                        : "text-zinc-300 hover:bg-zinc-800"
                    }`}
                  >
                    <span className="block truncate font-medium"># {room.name}</span>
                    {room.description && (
                      <span className="block truncate text-xs text-zinc-500">{room.description}</span>
                    )}
                  </button>
                </li>
              ))}
              {rooms.length === 0 && <p className="px-3 py-2 text-xs text-zinc-600">还没有房间，创建一个吧</p>}
            </ul>

            {/* ---------- 在线名单（点人名可私聊） ---------- */}
            {activeRoomId && (
              <div className="mt-5">
                <span className="mb-2 block px-1 text-xs font-medium uppercase tracking-wider text-zinc-500">
                  在线 · {onlineList.length}
                </span>
                <ul className="flex flex-col gap-1">
                  {onlineList
                    .filter((u) => u.id !== user?.id)
                    .map((u) => (
                      <li key={u.id}>
                        <button
                          onClick={() => handleClickUser(u)}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm text-zinc-300 transition hover:bg-zinc-800"
                          title="点击发起私聊"
                        >
                          <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                          </span>
                          <span className="truncate">{u.username}</span>
                          {u.role !== "USER" && (
                            <span className="ml-auto text-[10px] text-amber-400">
                              {u.role === "ADMIN" ? "管理员" : "会员"}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  {onlineList.filter((u) => u.id !== user?.id).length === 0 && (
                    <li className="px-3 py-1 text-xs text-zinc-600">暂无其他人在线</li>
                  )}
                </ul>
              </div>
            )}
          </>
        ) : (
          <>
            {/* ---------- 私信会话列表 ---------- */}
            <ul className="flex flex-col gap-1">
              {dmConversations.map((c) => (
                <li key={c.user.id}>
                  <button
                    onClick={() => void openDm(c.user.id)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-zinc-800"
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                      style={{ backgroundColor: c.user.avatarColor }}
                    >
                      {c.user.username.charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between">
                        <span className="truncate font-medium text-zinc-200">{c.user.username}</span>
                        <span className="shrink-0 text-[10px] text-zinc-600">
                          {new Date(c.lastMessage.createdAt).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}
                        </span>
                      </span>
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs text-zinc-500">{c.lastMessage.content}</span>
                        {c.unreadCount > 0 && (
                          <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                            {c.unreadCount > 99 ? "99+" : c.unreadCount}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
              {dmConversations.length === 0 && (
                <p className="px-3 py-2 text-xs text-zinc-600">
                  还没有私聊。在频道页点在线的人名，即可发起私聊。
                </p>
              )}
            </ul>
          </>
        )}
      </div>

      {/* 当前用户 */}
      <div className="flex items-center gap-3 border-t border-zinc-800 px-4 py-3">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold"
          style={{ backgroundColor: user?.avatarColor ?? "#6366f1" }}
        >
          {user?.username.charAt(0).toUpperCase()}
        </span>
        <span className="flex-1 truncate text-sm">
          {user?.username}
          {user?.role !== "USER" && (
            <span className="ml-1.5 text-[10px] text-amber-400">{user?.role === "ADMIN" ? "管理员" : "会员"}</span>
          )}
        </span>
        <button onClick={logout} className="text-xs text-zinc-500 transition hover:text-zinc-300" title="退出登录">
          退出
        </button>
      </div>
    </aside>
  );
}
