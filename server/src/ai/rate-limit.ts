/**
 * 简单的内存限流器：每人每 10 分钟最多 20 次 AI 请求。
 *
 * 为什么需要：Claude API 按 token 计费，AI 请求是最烧钱的部分。
 * 没有限流的话，用户狂点按钮或前端出 bug 疯狂重试，账单会失控。
 *
 * 实现：滑动窗口。每个用户维护一个「最近请求时间戳」数组，
 * 每次请求时先把窗口外的旧时间戳清掉，再看窗口内还剩几条。
 * 单进程足够；多实例部署要换成 Redis（README 有说明）。
 */

const WINDOW_MS = 10 * 60 * 1000; // 10 分钟
const MAX_REQUESTS = 20;

const buckets = new Map<string, number[]>();

/** 返回 true = 放行，false = 超限 */
export function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const recent = (buckets.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);

  if (recent.length >= MAX_REQUESTS) {
    buckets.set(userId, recent);
    return false;
  }

  recent.push(now);
  buckets.set(userId, recent);
  return true;
}
