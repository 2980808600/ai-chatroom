/**
 * AI 用量记账：每次 AI 请求都记录到 AiRequestLog 表。
 *
 * 这是商业化的两个关键问题的答案：
 * 1. 配额：普通用户每天能用多少次 AI（count 今日记录）
 * 2. 成本：每次请求花了多少钱（token 用量 × 供应商单价，在管理后台汇总）
 */
import { prisma } from "../prisma.js";
import { config } from "../config.js";

export interface AiRequestEntry {
  userId: string;
  provider: string;
  scope: string; // chat | room | summarize
  status: string; // OK | ERROR | REFUSED
  inputTokens?: number | null;
  outputTokens?: number | null;
}

export async function recordAiRequest(entry: AiRequestEntry): Promise<void> {
  try {
    await prisma.aiRequestLog.create({
      data: {
        userId: entry.userId,
        provider: entry.provider,
        scope: entry.scope,
        status: entry.status,
        inputTokens: entry.inputTokens ?? null,
        outputTokens: entry.outputTokens ?? null,
      },
    });
  } catch (err) {
    // 记账失败不能拖垮 AI 主流程，只记错误日志
    console.error("[usage] AI 请求记账失败：", err);
  }
}

/** 今天 0 点以来的请求次数（配额判断用） */
export async function getTodayRequestCount(userId: string): Promise<number> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return prisma.aiRequestLog.count({ where: { userId, createdAt: { gte: start } } });
}

export interface QuotaCheck {
  allowed: boolean;
  /** 未通过时的提示语 */
  message?: string;
}

/** 每日配额检查：USER 有上限，MEMBER/ADMIN 不限 */
export async function checkAiQuota(user: { id: string; role: string }): Promise<QuotaCheck> {
  if (user.role !== "USER") return { allowed: true };

  const used = await getTodayRequestCount(user.id);
  if (used >= config.aiDailyLimit) {
    return {
      allowed: false,
      message: `今日免费 AI 额度（${config.aiDailyLimit} 次）已用完，明天再来，或升级会员不限量使用。`,
    };
  }
  return { allowed: true };
}
