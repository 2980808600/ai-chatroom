# AI 聊天室 - 单容器部署（前端构建产物由后端一起托管，配合 docker-compose + Caddy 上线）
#
# 构建：docker build -t ai-chatroom .
# 说明：为了简单可靠，镜像里保留 tsx 直跑源码；生产硬化可用 tsc 编译后再跑。

# ---------- 阶段 1：构建前端 ----------
FROM node:24-alpine AS client-build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared ./shared
COPY client ./client
COPY server/package.json ./server/package.json
RUN npm ci
RUN npm run build -w client

# ---------- 阶段 2：运行 ----------
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY shared ./shared
COPY server ./server
# 前端产物从前一阶段拿过来，由 server 的静态托管逻辑（src/index.ts）服务
COPY --from=client-build /app/client/dist ./client/dist

RUN npm ci
# 生成 Prisma Client（SQLite 引擎随包分发）
RUN npx prisma generate --schema=server/prisma/schema.prisma

EXPOSE 4000

# 启动前先同步数据库结构（幂等），再起服务
CMD ["sh", "-c", "npx prisma migrate deploy --schema=server/prisma/schema.prisma && npm run start -w server"]
