/**
 * 敏感词过滤（最简单的关键词替换实现）。
 *
 * 用途：内容合规是商业化上线的基本要求。本实现只做演示级别的关键词替换；
 * 真实上线请接专业内容安全服务（阿里云/腾讯云内容安全 API），
 * 它们有更全的词库、语义理解和变体识别（谐音/拆字/拼音），本地词表远不够。
 *
 * 扩展词库：直接往 DEFAULT_WORDS 里加词，或改成从 server/config/sensitive-words.txt 读取。
 */

const DEFAULT_WORDS = [
  "傻逼",
  "傻B",
  "妈的",
  "操你",
  "去死",
  "fuck",
  "shit",
  "bitch",
];

/** 把文本中的敏感词替换为等长的 * */
export function filterSensitive(text: string): string {
  return DEFAULT_WORDS.reduce((acc, word) => {
    // split/join 是简单的全局替换；对大小写不敏感的词可以用正则
    return acc.split(word).join("*".repeat(word.length));
  }, text);
}

/** 是否有敏感词（供前端/日志判断用） */
export function hasSensitive(text: string): boolean {
  return DEFAULT_WORDS.some((word) => text.includes(word));
}
