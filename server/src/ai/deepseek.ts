/**
 * DeepSeek 的流式实现（OpenAI 兼容协议）。
 *
 * DeepSeek 官方推荐直接用 OpenAI SDK，把 baseURL 指向 https://api.deepseek.com 即可，
 * 因此这里用 openai 包而不是自己拼 HTTP 请求。
 *
 * 模型：deepseek-chat（DeepSeek-V3 通用对话版，速度快、价格极低）。
 * 另有 deepseek-reasoner（R1 深度推理版），会先输出思考过程再给答案，
 * 输出更慢但推理更强——想给「代码排错」模式换它的话，改 model 字段即可，
 * 但需要额外处理 reasoning_content 字段（R1 的思考内容走独立的流）。
 */
import OpenAI from "openai";
import type { StreamOptions, StreamResult } from "./types.js";
import { injectSearchResults, searchWeb } from "./search.js";

/**
 * 惰性初始化：只在实际调用 DeepSeek 时才构造客户端。
 * OpenAI SDK 在构造时就会校验 API Key 并直接抛异常——如果像普通依赖一样
 * 在模块加载时 new，那么「只配了 Claude Key」或「什么都没配」时服务会直接崩溃。
 */
let deepseek: OpenAI | null = null;

function getClient(): OpenAI {
  if (!deepseek) {
    deepseek = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: "https://api.deepseek.com",
    });
  }
  return deepseek;
}

export async function streamDeepseek(options: StreamOptions): Promise<StreamResult> {
  // 联网搜索（检索增强）：先搜索，把结果注入对话再请求模型。
  // 搜索失败（没配 Key / 服务抖动）自动回退为普通回答，不让搜索拖垮整个 AI。
  let messages = options.messages;
  if (options.webSearch) {
    try {
      const results = await searchWeb(options.webSearch.query);
      if (results.length > 0) {
        messages = injectSearchResults(options, results);
      }
    } catch (err) {
      console.warn("[search] 联网搜索失败，回退为普通回答：", err instanceof Error ? err.message : err);
    }
  }

  const stream = await getClient().chat.completions.create(
    {
      model: "deepseek-chat",
      messages: [{ role: "system", content: options.system }, ...messages],
      max_tokens: options.maxTokens ?? 4096,
      stream: true,
      // 让最后一个 chunk 带上 token 用量（成本报表数据）
      stream_options: { include_usage: true },
    },
    // 第二个参数是请求选项：AbortController 让「停止生成」按钮生效
    { signal: options.signal },
  );

  let text = "";
  let usage: { inputTokens: number; outputTokens: number } | undefined;
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      text += delta;
      options.onDelta(delta);
    }
    // 开了 include_usage 后，最后一个 chunk 不带内容但带 usage
    if (chunk.usage) {
      usage = {
        inputTokens: chunk.usage.prompt_tokens ?? 0,
        outputTokens: chunk.usage.completion_tokens ?? 0,
      };
    }
  }

  // DeepSeek 的内容安全过滤：触发时 finish_reason 为 content_filter，输出为空字符串
  return { text, refused: text.length === 0, usage };
}
