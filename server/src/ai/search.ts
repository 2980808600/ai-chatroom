/**
 * 联网搜索层（检索增强用的外部知识来源）。
 *
 * 支持两家搜索服务，`.env` 里配哪个用哪个：
 *   - 博查（bochaai.com）：国内服务，中文结果质量好，按量付费（几块钱起）
 *   - Tavily（tavily.com）：海外主流 LLM 搜索服务，免费额度 1000 次/月
 *
 * 搜索失败时向上抛异常，由调用方（deepseek.ts）捕获后自动回退为普通回答，
 * 保证「搜索挂了」不会导致「AI 完全不可用」。
 */
import type { StreamOptions } from "./types.js";

export interface SearchResult {
  title: string;
  url: string;
  /** 内容摘要 */
  snippet: string;
}

export type SearchProviderName = "tavily" | "bocha";

export function resolveSearchProvider(): SearchProviderName | null {
  const configured = (process.env.SEARCH_PROVIDER ?? "auto").toLowerCase();
  const hasTavily = Boolean(process.env.TAVILY_API_KEY);
  const hasBocha = Boolean(process.env.BOCHA_API_KEY);

  if (configured === "tavily" && hasTavily) return "tavily";
  if (configured === "bocha" && hasBocha) return "bocha";
  if (configured === "auto") {
    if (hasBocha) return "bocha";
    if (hasTavily) return "tavily";
  }
  return null;
}

export const searchEnabled = resolveSearchProvider() !== null;

async function searchTavily(query: string, maxResults: number): Promise<SearchResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query,
      max_results: maxResults,
      search_depth: "basic",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Tavily 搜索失败（HTTP ${res.status}）`);

  const data = (await res.json()) as {
    results?: { title: string; url: string; content: string }[];
  };
  return (data.results ?? []).map((r) => ({ title: r.title, url: r.url, snippet: r.content }));
}

async function searchBocha(query: string, maxResults: number): Promise<SearchResult[]> {
  const res = await fetch("https://api.bochaai.com/v1/web-search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.BOCHA_API_KEY}`,
    },
    body: JSON.stringify({ query, summary: true, count: Math.min(maxResults, 10) }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`博查搜索失败（HTTP ${res.status}）`);

  const data = (await res.json()) as {
    data?: { webPages?: { value?: { name: string; url: string; summary?: string; snippet?: string }[] } };
  };
  return (data.data?.webPages?.value ?? []).map((r) => ({
    title: r.name,
    url: r.url,
    snippet: r.summary ?? r.snippet ?? "",
  }));
}

/** 搜索并返回前 maxResults 条结果；失败时抛异常（调用方决定如何兜底） */
export async function searchWeb(query: string, maxResults = 5): Promise<SearchResult[]> {
  const provider = resolveSearchProvider();
  if (!provider) throw new Error("未配置任何搜索服务（TAVILY_API_KEY 或 BOCHA_API_KEY）");

  switch (provider) {
    case "tavily":
      return searchTavily(query, maxResults);
    case "bocha":
      return searchBocha(query, maxResults);
  }
}

/**
 * 把搜索结果拼成一段可以注入对话的提示词文本。
 * 结果按 [编号] 标注，要求模型基于资料回答并列出参考来源。
 */
export function formatSearchResults(results: SearchResult[], query: string): string {
  const refs = results
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet}`)
    .join("\n\n");
  return `以下是针对「${query}」联网搜索到的资料：\n\n${refs}\n\n请基于这些资料回答用户的最后一个问题，引用资料时标注 [编号]，并在回答末尾列出参考来源链接。`;
}

/** 把搜索结果注入到对话里（插在用户最后一条消息之前，让模型先读资料再回答问题） */
export function injectSearchResults(
  options: StreamOptions,
  results: SearchResult[],
): NonNullable<StreamOptions["messages"]> {
  const messages = [...options.messages];
  const last = messages[messages.length - 1];
  const evidence = { role: "user" as const, content: formatSearchResults(results, options.webSearch!.query) };
  return [...messages.slice(0, -1), evidence, last];
}
