/**
 * AI 流式调用的统一类型：无论底层是哪家供应商，业务代码看到的都是这套接口。
 * （单独一个文件是为了让 client.ts / deepseek.ts / provider.ts 互相 import 类型时不产生循环依赖）
 */

/** 统一对话消息形状（Claude 和 DeepSeek 都是 role + content 结构） */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface StreamOptions {
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
  /** 每收到一个文本增量就调用一次 */
  onDelta: (delta: string) => void;
  /** 用户点「停止」时触发 abort */
  signal?: AbortSignal;
  /**
   * 联网搜索开关。两家供应商的实现方式不同：
   * - DeepSeek（无服务端搜索工具）：实现层先调搜索 API，把结果注入对话再请求模型（检索增强）
   * - Claude（有服务端 web_search 工具）：直接声明工具，模型自己决定搜什么、什么时候搜
   */
  webSearch?: { query: string };
  /**
   * 图片 URL（AI 看图预留接口）：Claude 支持视觉（作为图片内容块发送）；
   * DeepSeek 无视觉能力，业务层会先拦截并返回友好提示。
   */
  imageUrl?: string;
}

export interface StreamResult {
  text: string;
  /** 被内容安全策略拒绝（供应商不同，表现不同：Claude 是 refusal，DeepSeek 是空输出） */
  refused: boolean;
  /** token 用量（成本报表数据；部分供应商流式模式可能拿不到） */
  usage?: { inputTokens: number; outputTokens: number };
}
