/**
 * Anthropic Claude 的流式实现。
 *
 * 关键点：
 * 1. 模型用 claude-opus-5（当前最强 Opus，默认不降级）
 * 2. 所有输出走「流式」：token 一到就通过回调发出去，由调用方经 socket 转发给前端，
 *    实现打字机效果，而不是等几十秒一次性返回
 * 3. 省略 thinking 参数（Opus 5 默认开启自适应思考）
 * 4. 开启服务端回退 fallbacks：当安全分类器拒绝请求时自动改用回退模型重跑，
 *    避免正常问题被误伤直接失败
 */
import Anthropic from "@anthropic-ai/sdk";
import type { StreamOptions, StreamResult } from "./types.js";

/**
 * 惰性初始化：只在实际调用 Claude 时才构造客户端（原因见 deepseek.ts 注释，
 * 两家 SDK 都会在构造时校验 Key）。
 */
let anthropic: Anthropic | null = null;

function getClient(): Anthropic {
  if (!anthropic) {
    anthropic = new Anthropic();
  }
  return anthropic;
}

export async function streamClaude(options: StreamOptions): Promise<StreamResult> {
  // beta 路径的流式参数类型（从 SDK 实例方法签名上直接提取，不硬编码类型名）
  type BetaStreamParams = Parameters<Anthropic["beta"]["messages"]["stream"]>[0];

  // 图片（视觉）：把图片作为内容块附到用户最后一条消息上
  let messages: Anthropic.MessageParam[] = options.messages as Anthropic.MessageParam[];
  if (options.imageUrl) {
    const last = options.messages[options.messages.length - 1];
    messages = [
      ...messages.slice(0, -1),
      {
        role: "user",
        content: [
          { type: "image", source: { type: "url", url: options.imageUrl } },
          { type: "text", text: last.content },
        ],
      },
    ];
  }

  const params = {
    model: "claude-opus-5",
    max_tokens: options.maxTokens ?? 4096,
    system: options.system,
    messages,
    // 联网搜索：Claude 走「服务端搜索工具」——工具在 Anthropic 服务器上执行，
    // 模型自己决定要不要搜、搜什么，我们一行执行代码都不用写。
    // （注：服务端工具回合较长时可能以 pause_turn 结束，简单问答场景极少触发；
    //   如需处理，参考 SDK 文档中的 resume 模式。）
    ...(options.webSearch ? { tools: [{ type: "web_search_20260209", name: "web_search" }] } : {}),
    betas: ["server-side-fallback-2026-07-01"],
    // 官方推荐的自动回退模式（按拒绝类别路由到合适的回退模型）。
    // 注：SDK 类型可能尚未收录该字段，所以整体走 unknown 断言；
    // 若未来 API 返回参数错误，删掉这一行即可，不影响其他功能。
    fallbacks: "default",
  } as unknown as BetaStreamParams;

  // stream 助手的 on("text") 只给文本增量，比手动筛 content_block_delta 简单
  const stream = getClient().beta.messages.stream(params, { signal: options.signal });
  stream.on("text", (delta) => options.onDelta(delta));

  const final = await stream.finalMessage();
  const text = final.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  // 重要：先看 stop_reason 再决定怎么处理内容（拒绝时 content 可能为空）
  return {
    text,
    refused: final.stop_reason === "refusal",
    usage: { inputTokens: final.usage.input_tokens, outputTokens: final.usage.output_tokens },
  };
}
