/**
 * 当前正在进行的 AI 流式请求登记表。
 * 独立成模块是为了让 chat.handlers（断线清理）和 ai.handlers（开始/停止流）都能引用，
 * 避免二者互相 import 造成循环依赖。
 */

/** userId -> 该用户当前 AI 请求的 AbortController */
const activeStreams = new Map<string, AbortController>();

export function registerStream(userId: string, controller: AbortController): void {
  activeStreams.set(userId, controller);
}

export function unregisterStream(userId: string): void {
  activeStreams.delete(userId);
}

/** 终止某个用户正在进行的 AI 输出（点「停止」按钮或断线时调用） */
export function abortUserStream(userId: string): void {
  activeStreams.get(userId)?.abort();
}

export function hasActiveStream(userId: string): boolean {
  return activeStreams.has(userId);
}
