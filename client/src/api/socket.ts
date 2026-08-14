import { io, type Socket } from "socket.io-client";

/**
 * Socket.io 客户端单例。
 * 开发环境下 Vite 把 /socket.io 代理到后端；生产环境同源部署时无需任何配置。
 */

let socket: Socket | null = null;

/** 建立连接。JWT 放在握手 auth 里，服务端在连接建立前校验 */
export function connectSocket(token: string): Socket {
  if (socket) socket.disconnect();
  socket = io({ auth: { token } });
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

/** 获取当前连接（登录后由 AuthContext 负责建立，业务组件直接拿来用） */
export function getSocket(): Socket | null {
  return socket;
}
