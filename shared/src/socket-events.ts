/**
 * Socket.io 事件名统一定义。
 * 前后端都从这里导入，避免手写字符串拼错（拼错不会报错，只会静默不工作，非常难查）。
 */

export const SOCKET_EVENTS = {
  // --- 客户端 → 服务端 ---
  /** 加入房间 { roomId } */
  roomJoin: "room:join",
  /** 离开房间 { roomId } */
  roomLeave: "room:leave",
  /** 发送消息 { roomId, content }，content 以 @AI 开头会触发群聊机器人 */
  messageSend: "message:send",
  /** 打字开始/结束 { roomId } */
  typingStart: "typing:start",
  typingStop: "typing:stop",

  // --- 私聊 DM（客户端 → 服务端） ---
  /** 发送私信 { toUserId, content, type } */
  dmSend: "dm:send",
  /** 打开某个人的会话（服务端把未读标为已读）{ fromUserId } */
  dmOpen: "dm:open",

  // --- 私聊 DM（服务端 → 客户端） ---
  /** 新私信到达 */
  dmNew: "dm:new",
  /** 对方已读（更新发送方的已读状态）{ userId } */
  dmRead: "dm:read",

  // --- AI 相关（客户端 → 服务端） ---
  /** 私聊助手 { conversationId | null, content, mode } */
  aiChat: "ai:chat",
  /** 停止当前用户的 AI 流式输出 */
  aiChatStop: "ai:chat:stop",
  /** 群聊 @AI 机器人 { roomId, content } */
  aiRoom: "ai:room",
  /** 群聊消息总结 { roomId, limit? } */
  aiSummarize: "ai:summarize",

  // --- 服务端 → 客户端 ---
  /** 新消息（人类/AI/系统统一走这里） */
  messageNew: "message:new",
  /** 房间在线名单 */
  roomUsers: "room:users",
  /** 打字提示 */
  typing: "typing",
  /** AI 流式增量 */
  aiDelta: "ai:delta",
  /** AI 输出结束 */
  aiDone: "ai:done",
  /** AI 错误（无 Key / 限流 / API 异常等） */
  aiError: "ai:error",
  /** 新会话创建成功（私聊） */
  aiConversationNew: "ai:conversation:new",
} as const;
