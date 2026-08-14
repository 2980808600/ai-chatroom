/**
 * 房间在线状态（进程内维护）。
 * 单进程部署下足够；多实例部署时需要换成 Redis 等共享存储（README 里有说明）。
 */
import type { Server } from "socket.io";
import { SOCKET_EVENTS } from "shared";
import type { OnlineUser } from "shared";

/** roomId -> Map(userId -> 用户信息) */
const roomOnline = new Map<string, Map<string, OnlineUser>>();

/** Socket.io 的房间名加前缀，避免和 socket 自己的命名空间混淆 */
export function roomChannel(roomId: string): string {
  return `room:${roomId}`;
}

export function addOnlineUser(roomId: string, user: OnlineUser): void {
  let users = roomOnline.get(roomId);
  if (!users) {
    users = new Map();
    roomOnline.set(roomId, users);
  }
  users.set(user.id, user);
}

export function removeOnlineUser(roomId: string, userId: string): void {
  const users = roomOnline.get(roomId);
  if (!users) return;
  users.delete(userId);
  if (users.size === 0) roomOnline.delete(roomId);
}

/** 把最新的在线名单广播给房间内所有人 */
export function emitRoomUsers(io: Server, roomId: string): void {
  const users = [...(roomOnline.get(roomId)?.values() ?? [])];
  io.to(roomChannel(roomId)).emit(SOCKET_EVENTS.roomUsers, { roomId, users });
}
