/**
 * AI 供应商统一入口（供应商抽象层）。
 *
 * 项目同时支持两家模型服务：
 *   - Anthropic Claude（claude-opus-5，官方 SDK）
 *   - DeepSeek（deepseek-chat，OpenAI 兼容协议）
 *
 * 业务代码（socket 事件处理）只依赖这里的统一接口 streamAi()，
 * 换供应商只需要改 .env，一行业务代码都不用动。
 * 这是「面向接口编程」的实际应用：上游切换实现，下游无感知。
 */
import { streamClaude } from "./client.js";
import { streamDeepseek } from "./deepseek.js";
import type { StreamOptions, StreamResult } from "./types.js";

// 统一类型从这里再导出一份，业务代码只 import provider 一个模块即可
export type { ChatMessage, StreamOptions, StreamResult } from "./types.js";

export type AiProvider = "deepseek" | "anthropic";

export class AiNotConfiguredError extends Error {
  constructor() {
    super("服务器未配置任何 AI 服务的 API Key（ANTHROPIC_API_KEY 或 DEEPSEEK_API_KEY）");
    this.name = "AiNotConfiguredError";
  }
}

/**
 * 根据 .env 决定用哪家供应商：
 *   AI_PROVIDER=auto（默认）—— 哪个配了 Key 就用哪个；都配了优先 DeepSeek（便宜）
 *   AI_PROVIDER=deepseek / anthropic —— 强制指定
 */
export function resolveProvider(): AiProvider | null {
  const configured = (process.env.AI_PROVIDER ?? "auto").toLowerCase();
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasDeepseek = Boolean(process.env.DEEPSEEK_API_KEY);

  if (configured === "deepseek" && hasDeepseek) return "deepseek";
  if (configured === "anthropic" && hasAnthropic) return "anthropic";
  if (configured === "auto") {
    if (hasDeepseek) return "deepseek";
    if (hasAnthropic) return "anthropic";
  }
  return null;
}

/** 进程启动时解析一次；改 .env 需要重启后端 */
export const activeProvider: AiProvider | null = resolveProvider();
export const aiEnabled = activeProvider !== null;

/** 统一入口：按当前供应商分发到对应实现 */
export function streamAi(options: StreamOptions): Promise<StreamResult> {
  switch (activeProvider) {
    case "deepseek":
      return streamDeepseek(options);
    case "anthropic":
      return streamClaude(options);
    default:
      throw new AiNotConfiguredError();
  }
}
