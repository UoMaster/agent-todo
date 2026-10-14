# syntax=docker/dockerfile:1

# ---------- 构建阶段：装全量依赖 + 构建前端 ----------
FROM node:24-slim AS build
WORKDIR /app
RUN corepack enable
# 先拷贝清单，最大化利用构建缓存
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/cli/package.json packages/cli/
COPY packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/web packages/web
RUN pnpm --filter @agent-todo/web build

# ---------- 依赖阶段：只保留生产依赖 ----------
FROM node:24-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/cli/package.json packages/cli/
COPY packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# ---------- 运行阶段 ----------
FROM node:24-slim AS runtime
ENV NODE_ENV=production \
    PORT=3001 \
    HOST=0.0.0.0 \
    STATIC_DIR=/app/packages/web/dist \
    UPLOADS_DIR=/data/uploads
WORKDIR /app

RUN groupadd --system --gid 1001 app \
 && useradd --system --uid 1001 --gid app app \
 && mkdir -p /data/uploads \
 && chown -R app:app /data

# 生产依赖（pnpm 的符号链接结构：直接整体拷贝依赖层，避免逐个目录不存在的问题）
COPY --from=deps /app ./

# server 源码与迁移：由 Node 原生 type stripping 直接运行，无需构建
COPY packages/shared/package.json packages/shared/package.json
COPY packages/shared/src packages/shared/src
COPY packages/server/package.json packages/server/package.json
COPY packages/server/src packages/server/src
COPY packages/server/migrations packages/server/migrations

# 前端构建产物（由 server 托管）
COPY --from=build /app/packages/web/dist packages/web/dist

USER app
EXPOSE 3001

# 进程存活 + 数据库可用才算健康
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>r.json()).then(j=>process.exit(j.ok&&j.db&&j.db.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "packages/server/src/index.ts"]
