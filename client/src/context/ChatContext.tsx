import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { SOCKET_EVENTS } from "shared";
import type {
  AiDeltaPayload,
  AiDonePayload,
  AiErrorPayload,
  DmConversationDto,
  DmMessageDto,
  MessageDto,
  OnlineUser,
  RoomDto,
  TypingPayload,
  UserPublic,
} from "shared";
import { getSocket } from "../api/socket";
import { http } from "../api/http";

/**
 * 聊天室全局状态：频道（房间）与私信（DM）两套数据 + 实时事件。
 * 所有实时数据都来自 socket 事件；组件通过 useChat() 读取和操作。
 */
interface ChatContextValue {
  // ---- 频道（房间） ----
  rooms: RoomDto[];
  activeRoomId: string | null;
  messages: Record<string, MessageDto[]>;
  onlineUsers: Record<string, OnlineUser[]>;
  typingUsers: Record<string, OnlineUser[]>;
  streamingText: Record<string, string>;
  aiGenerating: Record<string, boolean>;
  joinRoom: (roomId: string) => Promise<void>;
  sendMessage: (content: string, imageUrl?: string) => void;
  createRoom: (name: string, description: string) => Promise<void>;
  summarizeRoom: () => void;

  // ---- 私聊 DM ----
  /** 当前主区域视图：频道 or 私聊 */
  view: "room" | "dm";
  setView: (v: "room" | "dm") => void;
  dmConversations: DmConversationDto[];
  activeDmUserId: string | null;
  dmMessages: Record<string, DmMessageDto[]>;
  /** 私聊对象信息（会话列表 + 在线列表点进来的人都会登记） */
  dmUserMap: Record<string, UserPublic>;
  totalUnread: number;
  openDm: (userId: string, user?: UserPublic) => Promise<void>;
  closeDm: () => void;
  sendDm: (content: string, imageUrl?: string) => void;

  // ---- 其他 ----
  notice: string | null;
  clearNotice: () => void;
  refreshRooms: () => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  // ---------- 频道状态 ----------
  const [rooms, setRooms] = useState<RoomDto[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, MessageDto[]>>({});
  const [onlineUsers, setOnlineUsers] = useState<Record<string, OnlineUser[]>>({});
  const [typingUsers, setTypingUsers] = useState<Record<string, OnlineUser[]>>({});
  const [streamingText, setStreamingText] = useState<Record<string, string>>({});
  const [aiGenerating, setAiGenerating] = useState<Record<string, boolean>>({});

  // ---------- 私聊状态 ----------
  const [view, setView] = useState<"room" | "dm">("room");
  const [dmConversations, setDmConversations] = useState<DmConversationDto[]>([]);
  const [activeDmUserId, setActiveDmUserId] = useState<string | null>(null);
  const [dmMessages, setDmMessages] = useState<Record<string, DmMessageDto[]>>({});
  const [dmUserMap, setDmUserMap] = useState<Record<string, UserPublic>>({});

  const [notice, setNotice] = useState<string | null>(null);

  // 打字提示的定时器：userId -> timer，3 秒后移除
  const typingTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const activeRoomRef = useRef<string | null>(null);
  const activeDmRef = useRef<string | null>(null);
  // 已加载过历史消息的 DM 会话（避免重复请求）
  const dmLoadedRef = useRef(new Set<string>());

  const refreshRooms = useCallback(() => {
    http.get<RoomDto[]>("/rooms").then((res) => setRooms(res.data)).catch(() => {});
  }, []);

  /** 拉取私聊会话列表（未读数/最后消息） */
  const refreshDmList = useCallback(() => {
    http
      .get<DmConversationDto[]>("/dm/conversations")
      .then((res) => {
        setDmConversations(res.data);
        setDmUserMap((prev) => {
          const next = { ...prev };
          for (const c of res.data) next[c.user.id] = c.user;
          return next;
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshRooms();
    refreshDmList();
  }, [refreshRooms, refreshDmList]);

  useEffect(() => {
    activeRoomRef.current = activeRoomId;
  }, [activeRoomId]);
  useEffect(() => {
    activeDmRef.current = activeDmUserId;
  }, [activeDmUserId]);

  // 提示条 5 秒后自动消失
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  // 注册 socket 事件监听（只在挂载时注册一次；注意清理函数，React StrictMode 会挂载两次）
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onMessageNew = (msg: MessageDto) => {
      setMessages((prev) => ({ ...prev, [msg.roomId]: [...(prev[msg.roomId] ?? []), msg] }));
    };

    const onRoomUsers = (payload: { roomId: string; users: OnlineUser[] }) => {
      setOnlineUsers((prev) => ({ ...prev, [payload.roomId]: payload.users }));
      // 在线用户也登记到 dmUserMap（侧栏点人名就能私聊）
      setDmUserMap((prev) => {
        const next = { ...prev };
        for (const u of payload.users) next[u.id] = u;
        return next;
      });
    };

    const onTyping = (payload: TypingPayload) => {
      const key = payload.roomId + ":" + payload.user.id;
      setTypingUsers((prev) => {
        const list = (prev[payload.roomId] ?? []).filter((u) => u.id !== payload.user.id);
        return { ...prev, [payload.roomId]: [...list, payload.user] };
      });
      const old = typingTimers.current.get(key);
      if (old) clearTimeout(old);
      typingTimers.current.set(
        key,
        setTimeout(() => {
          setTypingUsers((prev) => ({
            ...prev,
            [payload.roomId]: (prev[payload.roomId] ?? []).filter((u) => u.id !== payload.user.id),
          }));
          typingTimers.current.delete(key);
        }, 3000),
      );
    };

    const onAiDelta = (payload: AiDeltaPayload) => {
      if (payload.scope !== "room") return;
      setStreamingText((prev) => ({
        ...prev,
        [payload.targetId]: (prev[payload.targetId] ?? "") + payload.delta,
      }));
      setAiGenerating((prev) => ({ ...prev, [payload.targetId]: true }));
    };

    const onAiDone = (payload: AiDonePayload) => {
      if (payload.scope !== "room") return;
      setStreamingText((prev) => ({ ...prev, [payload.targetId]: "" }));
      setAiGenerating((prev) => ({ ...prev, [payload.targetId]: false }));
    };

    const onAiError = (payload: AiErrorPayload) => {
      if (payload.scope === "room") {
        setStreamingText((prev) => ({ ...prev, [payload.targetId!]: "" }));
        setAiGenerating((prev) => ({ ...prev, [payload.targetId!]: false }));
      }
      setNotice(payload.message);
    };

    const onDmNew = (msg: DmMessageDto) => {
      // 对方发来（senderId=对方）或我自己发（recipientId=对方）：都挂到「与 senderId 的会话」下
      const otherId = msg.senderId;
      setDmMessages((prev) => ({ ...prev, [otherId]: [...(prev[otherId] ?? []), msg] }));
      void refreshDmList();
    };

    const onDmRead = () => {
      void refreshDmList();
    };

    socket.on(SOCKET_EVENTS.messageNew, onMessageNew);
    socket.on(SOCKET_EVENTS.roomUsers, onRoomUsers);
    socket.on(SOCKET_EVENTS.typing, onTyping);
    socket.on(SOCKET_EVENTS.aiDelta, onAiDelta);
    socket.on(SOCKET_EVENTS.aiDone, onAiDone);
    socket.on(SOCKET_EVENTS.aiError, onAiError);
    socket.on(SOCKET_EVENTS.dmNew, onDmNew);
    socket.on(SOCKET_EVENTS.dmRead, onDmRead);

    return () => {
      socket.off(SOCKET_EVENTS.messageNew, onMessageNew);
      socket.off(SOCKET_EVENTS.roomUsers, onRoomUsers);
      socket.off(SOCKET_EVENTS.typing, onTyping);
      socket.off(SOCKET_EVENTS.aiDelta, onAiDelta);
      socket.off(SOCKET_EVENTS.aiDone, onAiDone);
      socket.off(SOCKET_EVENTS.aiError, onAiError);
      socket.off(SOCKET_EVENTS.dmNew, onDmNew);
      socket.off(SOCKET_EVENTS.dmRead, onDmRead);
      for (const timer of typingTimers.current.values()) clearTimeout(timer);
      typingTimers.current.clear();
    };
  }, [refreshDmList]);

  // ---------- 频道操作 ----------

  const joinRoom = useCallback(async (roomId: string) => {
    const socket = getSocket();
    if (!socket || activeRoomRef.current === roomId) return;

    if (activeRoomRef.current) {
      socket.emit(SOCKET_EVENTS.roomLeave, { roomId: activeRoomRef.current });
    }

    const res = await http.get<MessageDto[]>(`/rooms/${roomId}/messages`);
    setMessages((prev) => ({ ...prev, [roomId]: res.data }));
    setActiveRoomId(roomId);
    activeRoomRef.current = roomId;
    setStreamingText((prev) => ({ ...prev, [roomId]: "" }));
    setAiGenerating((prev) => ({ ...prev, [roomId]: false }));
    setView("room");

    socket.emit(SOCKET_EVENTS.roomJoin, { roomId });
  }, []);

  const sendMessage = useCallback((content: string, imageUrl?: string) => {
    const socket = getSocket();
    const roomId = activeRoomRef.current;
    if (!socket || !roomId) return;
    socket.emit(SOCKET_EVENTS.messageSend, { roomId, content, imageUrl });
  }, []);

  const createRoom = useCallback(
    async (name: string, description: string) => {
      const room = await http.post<RoomDto>("/rooms", { name, description });
      setRooms((prev) => [...prev, room.data]);
      await joinRoom(room.data.id);
    },
    [joinRoom],
  );

  const summarizeRoom = useCallback(() => {
    const socket = getSocket();
    const roomId = activeRoomRef.current;
    if (!socket || !roomId) return;
    socket.emit(SOCKET_EVENTS.aiSummarize, { roomId, limit: 50 });
  }, []);

  // ---------- 私聊操作 ----------

  const openDm = useCallback(async (userId: string, user?: UserPublic) => {
    const socket = getSocket();
    if (!socket) return;

    setActiveDmUserId(userId);
    activeDmRef.current = userId;
    setView("dm");
    if (user) {
      setDmUserMap((prev) => ({ ...prev, [userId]: user }));
    }

    // 历史消息只拉一次
    if (!dmLoadedRef.current.has(userId)) {
      dmLoadedRef.current.add(userId);
      const res = await http.get<DmMessageDto[]>(`/dm/${userId}/messages`);
      setDmMessages((prev) => ({ ...prev, [userId]: res.data }));
    }

    // 通知服务端：对方发来的未读标为已读（服务端会推 dmRead 给对面）
    socket.emit(SOCKET_EVENTS.dmOpen, { fromUserId: userId });
    void refreshDmList();
  }, [refreshDmList]);

  const closeDm = useCallback(() => {
    setActiveDmUserId(null);
    setView("room");
  }, []);

  const sendDm = useCallback((content: string, imageUrl?: string) => {
    const socket = getSocket();
    const toUserId = activeDmRef.current;
    if (!socket || !toUserId) return;
    socket.emit(SOCKET_EVENTS.dmSend, {
      toUserId,
      content,
      type: imageUrl ? "IMAGE" : "TEXT",
    });
  }, []);

  const totalUnread = dmConversations.reduce((sum, c) => sum + c.unreadCount, 0);

  return (
    <ChatContext.Provider
      value={{
        rooms,
        activeRoomId,
        messages,
        onlineUsers,
        typingUsers,
        streamingText,
        aiGenerating,
        joinRoom,
        sendMessage,
        createRoom,
        summarizeRoom,
        view,
        setView,
        dmConversations,
        activeDmUserId,
        dmMessages,
        dmUserMap,
        totalUnread,
        openDm,
        closeDm,
        sendDm,
        notice,
        clearNotice: () => setNotice(null),
        refreshRooms,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat 必须在 ChatProvider 内使用");
  return ctx;
}
