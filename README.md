# ✨ AI 聊天室（AI Chatroom）

一个融合了**实时通信**与**大模型 AI**（Claude / DeepSeek 双供应商）的全栈聊天室项目：多房间实时群聊 + 私聊 + 四类 AI 功能 + 商业化体系。适合作为全栈求职的作品集项目——覆盖了 WebSocket 实时通信、JWT 鉴权、数据库设计、AI 多供应商架构、流式输出、安全加固、Docker 部署等面试高频考点。

## 功能一览

**实时聊天（无需 API Key 即可体验）**
- 多房间群聊，消息实时广播
- 一对一私聊 DM：实时推送 + 未读红点 + 已读回执
- 图片上传（频道和私聊都支持，5MB / 格式白名单）
- 在线名单（进出房间实时更新）、「正在输入…」提示、断线自动清理

**AI 功能（Claude / DeepSeek 双供应商，全部流式输出）**
| 功能 | 说明 |
|---|---|
| 🤖 AI 私聊助手 | 右侧面板一对一对话，多轮上下文记忆，打字机流式回复，可开启 🔍 联网搜索（回答最新资讯并标注来源） |
| 🐞 代码排错模式 | 粘贴代码 + 报错，AI 按「诊断 → 根因 → 修复代码 → 预防」结构化回答，代码块语法高亮 |
| @AI 群聊机器人 | 在任意房间发以 `@AI` 开头的消息，AI 带上下文流式回答，全房间实时可见 |
| 📋 消息总结 | 一键总结房间最近 50 条消息，以系统卡片形式展示 |

**商业化与运营**
- 🎫 会员体系：普通用户每日 20 次 AI 配额，会员/管理员不限量（AI 面板实时显示剩余次数）
- 🛠 管理后台：总览统计 / 用户管理（改角色、封禁）/ AI 成本报表（token × 单价折算）/ 审计日志
- 🔐 安全加固：helmet 安全头、CORS 收紧、登录限流防爆破、密码强度校验、敏感词过滤、封禁机制（登录 + socket 双拦截）

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19 · TypeScript · Vite · Tailwind CSS 4 · Socket.io-client · react-markdown + 代码高亮 |
| 后端 | Node.js · Express 5 · Socket.io 4 · TypeScript |
| 数据库 | SQLite + Prisma ORM（换一行配置即可切 PostgreSQL） |
| 鉴权 | JWT + bcrypt 密码哈希 |
| AI | 双供应商：Claude API（`claude-opus-5`）· DeepSeek（`deepseek-chat`），流式输出，`.env` 一键切换 |
| 工程化 | npm workspaces monorepo（shared 包共享前后端类型） |

## 架构

```
浏览器 (React + Vite :5173，dev 代理到 :4000)
   │  REST 接口：注册/登录/房间/私聊/历史消息/图片上传/管理后台
   │  WebSocket：实时消息/私聊回执/在线状态/打字提示/AI 流式输出
   ▼
Express + Socket.io (:4000)
   ├── JWT 鉴权（REST 中间件 + Socket 握手校验共用一套逻辑）
   ├── Prisma → SQLite（User / Room / Message / DmMessage / AiConversation / UsageRecord / AuditLog）
   ├── AI Provider 统一接口（Claude / DeepSeek 双供应商）→ 流式 token 经 socket 转发
   └── 联网搜索（博查 / Tavily）：DeepSeek 走检索增强、Claude 走服务端工具调用
```

## 目录结构

```
ai-chatroom/
├── shared/          # 前后端共用类型 + socket 事件名常量（monorepo 的核心价值）
├── server/
│   ├── prisma/      # 数据模型 + 迁移 + 种子数据
│   └── src/
│       ├── auth/    # JWT 签发/校验（REST 与 Socket 共用）
│       ├── routes/  # REST 路由（auth / room / dm / ai / upload / users / admin）
│       ├── sockets/ # Socket.io 鉴权 + 群聊/私聊/AI 事件 + 流式登记表 + 房间状态
│       ├── ai/      # Provider 抽象层（Claude/DeepSeek）、联网搜索、prompt、限流、用量记账
│       ├── moderation/ # 敏感词过滤
│       └── audit/   # 审计日志（改角色/封禁/删房间留痕）
└── client/
    └── src/
        ├── context/ # AuthContext（登录态）/ ChatContext（聊天全局状态）
        ├── pages/   # 登录 / 注册 / 聊天主界面 / 管理后台
        └── components/ # 房间侧栏、消息流、DM 列表、气泡、输入框、AI 面板
```

## 快速开始

环境要求：Node.js 20+（开发时使用 v24）

```bash
# 1. 安装依赖（monorepo 一次装齐）
npm install

# 2. 初始化数据库（创建 SQLite + 数据表 + 种子数据）
npm run db:migrate
npm run db:seed

# 3. 一键启动前后端（或分开跑：npm run dev:server / npm run dev:client）
npm run dev
```

- 前端：http://localhost:5173
- 后端：http://localhost:4000（`/api/health` 可查健康状态）

**演示账号**（密码都是 `demo1234`）：`alice`（普通用户）/ `bob`（会员，AI 不限量）/ `admin`（管理员，可进管理后台）。开两个浏览器窗口登录互聊，即可验证实时性——不需要 API Key。

**跑测试**：`scripts/smoke-test.ts`（基础链路）、`scripts/commercial-test.ts`（商业化功能，需先起一个 `AI_DAILY_LIMIT=2 PORT=4001` 的临时服务，详见脚本头部注释）。

## 配置 AI 服务（启用 AI 功能）

项目支持两家模型供应商，**配任意一家即可**，`server/.env` 里设 `AI_PROVIDER` 控制：

- `AI_PROVIDER=auto`（默认）：哪个配了 Key 就用哪个；**都配了优先 DeepSeek（便宜）**
- `AI_PROVIDER=deepseek` / `AI_PROVIDER=anthropic`：强制指定

没有 Key 时聊天功能完全正常，AI 功能会提示未配置。

### 方案 A：DeepSeek（推荐先用，便宜）

1. 打开 [platform.deepseek.com](https://platform.deepseek.com) 注册
2. 左侧 **API Keys** → 创建 Key，复制形如 `sk-...` 的密钥
3. 粘贴到 `server/.env` 的 `DEEPSEEK_API_KEY=`，重启后端

> DeepSeek 价格极低（学习用途几块钱能用很久），使用 `deepseek-chat` 模型。

### 方案 B：Claude（Anthropic）

1. 打开 [console.anthropic.com](https://console.anthropic.com) 注册账号
2. 左侧 **Billing** → 充值（最低 5 美元）
3. 左侧 **API Keys** → **Create Key** → 复制形如 `sk-ant-...` 的密钥
4. 粘贴到 `server/.env` 的 `ANTHROPIC_API_KEY=`，重启后端

> 💡 无论哪家供应商：AI 全部走流式输出 + 请求限流（每人每 10 分钟 20 次），正常学习使用费用很低。想给「代码排错」模式换 DeepSeek R1 深度推理模型？改 `server/src/ai/deepseek.ts` 里的 model 字段即可（需额外处理 reasoning_content 流，见该文件注释）。

### 方案 C：联网搜索（可选）

AI 面板上的「🔍 联网」开关让 AI 能回答训练数据之外的最新信息（新闻、文档、价格…）。配任意一家搜索服务即可，`SEARCH_PROVIDER` 控制：

- **博查**（[open.bochaai.com](https://open.bochaai.com)）：国内服务、注册简单、中文结果质量好，按量付费
- **Tavily**（[tavily.com](https://tavily.com)）：海外主流 LLM 搜索服务，免费额度 1000 次/月

```env
SEARCH_PROVIDER="auto"     # 哪个配了用哪个
BOCHA_API_KEY="你的博查Key"
TAVILY_API_KEY="你的TavilyKey"
```

**两种技术路线的实现**（面试加分点）：
- **DeepSeek 走「检索增强」**：提问 → 先调搜索 API → 结果注入对话 → 模型基于资料回答并标来源（`server/src/ai/search.ts` + `deepseek.ts`）
- **Claude 走「服务端搜索工具」**：直接声明 `web_search` 工具，搜索在 Anthropic 服务器上执行，模型自己决定搜什么（`server/src/ai/client.ts`）

搜索失败（未配 Key / 服务抖动）会自动回退为普通回答，不会拖垮 AI。

## REST API

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/register` | 注册，返回 `{ token, user }` |
| POST | `/api/auth/login` | 登录 |
| GET | `/api/auth/me` | 恢复登录态 |
| GET / POST | `/api/rooms` | 房间列表 / 创建房间 |
| GET | `/api/rooms/:id/messages?before=&limit=` | 游标分页拉历史消息 |
| GET / POST / DELETE | `/api/ai/conversations` | 私聊会话管理 |
| GET | `/api/ai/conversations/:id/messages` | 会话历史 |

## Socket 事件协议

| 方向 | 事件 | payload |
|---|---|---|
| C→S | `room:join` / `room:leave` | `{ roomId }` |
| C→S | `message:send` | `{ roomId, content }`（`@AI` 开头触发机器人） |
| C→S | `typing:start` | `{ roomId }` |
| C→S | `ai:chat` | `{ conversationId \| null, content, mode }` |
| C→S | `ai:chat:stop` | 停止当前用户的 AI 流 |
| C→S | `ai:summarize` | `{ roomId, limit? }` |
| S→C | `message:new` | 新消息（人类/AI/系统统一走这里） |
| S→C | `room:users` | `{ roomId, users }` 在线名单 |
| S→C | `typing` | `{ roomId, user }` |
| S→C | `ai:delta` / `ai:done` / `ai:error` | 流式增量（`scope: "conversation" \| "room"`） |

## 部署指引（Docker 一键上线）

Socket.io 需要长连接，**不适合 Vercel/Netlify 等 serverless 平台**（会断连）。项目已配好 Docker + Caddy（自动 HTTPS），上线只需：

1. 一台云服务器（2C2G 足够），装 Docker + Docker Compose
2. 把 `Caddyfile` 里的 `你的域名.com` 换成真实域名（DNS 解析到服务器 IP）
3. 在服务器上：
   ```bash
   git clone <你的仓库地址>
   cd ai-chatroom
   DEEPSEEK_API_KEY=sk-xxx docker compose up -d --build
   ```
   （其他环境变量见 `docker-compose.yml`，或用服务器上的 `.env` 文件注入）
4. 访问 `https://你的域名.com` —— Caddy 自动申请并续期 HTTPS 证书，后端自动执行数据库迁移，前端产物由后端同源托管

**上线前必做清单**：
- [ ] `JWT_SECRET` 换成随机长字符串
- [ ] `CORS_ORIGIN` 设成你的域名
- [ ] 创建 `admin` 账号（先 `npm run db:seed`，或手动改数据库角色）并改密码
- [ ] 敏感词库按需扩充（`server/src/moderation/sensitive-words.ts`，真实上线接专业内容安全 API）

**进阶方向**：pm2 守护进程；SQLite 换 PostgreSQL（Prisma 改一行配置）；多实例部署时把在线名单/限流迁移到 Redis；AI 成本报表接真实账单对账。


## 后续可扩展方向

- AI 视觉多模态（识别聊天图片内容，接口已预留）
- AI 知识库问答（RAG：文档切片 + 向量检索，企业级应用方向）
- Redis 缓存 + 多实例水平扩展（在线名单/限流迁移到 Redis）
- 单元测试（Vitest）+ CI/CD（GitHub Actions 自动构建 Docker 镜像）
- 生产环境 SQLite → PostgreSQL（Prisma 改一行配置即可切换）
