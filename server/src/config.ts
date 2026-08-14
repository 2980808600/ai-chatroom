/**
 * 环境变量集中管理：所有配置从这里读，代码里不直接碰 process.env。
 */
export const config = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-change-me",
  /** Claude 模型：当前最强的 Opus 系列 */
  aiModel: "claude-opus-5",

  /** CORS 允许的前端来源（逗号分隔）。开发走 Vite 代理不触发 CORS；生产改成你的域名 */
  corsOrigins: (process.env.CORS_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  /** 普通用户每日 AI 次数配额（会员/管理员不限量） */
  aiDailyLimit: Number(process.env.AI_DAILY_LIMIT ?? 20),

  /** AI 单价（美元 / 百万 token），用于管理后台成本报表估算 */
  aiPrices: {
    deepseek: {
      input: Number(process.env.DEEPSEEK_INPUT_PRICE ?? 0.27),
      output: Number(process.env.DEEPSEEK_OUTPUT_PRICE ?? 1.1),
    },
    anthropic: {
      input: Number(process.env.ANTHROPIC_INPUT_PRICE ?? 5),
      output: Number(process.env.ANTHROPIC_OUTPUT_PRICE ?? 25),
    },
  },

  /** 上传文件保存目录（相对 server 目录） */
  uploadDir: process.env.UPLOAD_DIR ?? "uploads",
} as const;
