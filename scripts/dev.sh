# agent-todo 一键运行：Postgres（Docker）+ server + web（本地，带 HMR）
#
# 用法：pnpm dev:all
# 说明：
#   - Postgres 跑在 Docker 里，数据存在命名卷 pgdata（不会丢）
#   - server / web 在本机跑，改代码即时热更新
#   - 停止：Ctrl+C（Postgres 容器保持运行，需要停掉用 pnpm docker:down）

set -euo pipefail
cd "$(dirname "$0")/.."

# 1. 确保 Postgres 容器在运行
if docker compose ps --status running --services 2>/dev/null | grep -qx db; then
  echo "✔ Postgres 已在运行"
else
  echo "▶ 启动 Postgres（docker compose up -d db）"
  docker compose up -d db
fi

# 2. 等 Postgres 健康检查通过
echo -n "▶ 等待 Postgres 就绪"
health="unknown"
for _ in $(seq 1 60); do
  health=$(docker inspect --format '{{.State.Health.Status}}' "$(docker compose ps -q db)" 2>/dev/null || echo unknown)
  [ "$health" = "healthy" ] && break
  echo -n "."
  sleep 1
done
echo
if [ "$health" != "healthy" ]; then
  echo "✗ Postgres 未就绪，查看日志：docker compose logs db"
  exit 1
fi
echo "✔ Postgres 就绪"

# 3. 首次运行时生成 server 的 .env（DATABASE_URL 指向本机 5432）
ENV_FILE=packages/server/.env
if [ ! -f "$ENV_FILE" ]; then
  echo "▶ 生成 $ENV_FILE"
  cat > "$ENV_FILE" <<'EOF'
# 由 scripts/dev.sh 生成；可用 pnpm dev:all 一键开发
PORT=3001
DATABASE_URL=postgres://agent_todo:agent_todo_dev@localhost:5432/agent_todo
EOF
fi

# 4. 启动 web + server（Ctrl+C 一起退出）
echo "▶ 启动 web + server（Ctrl+C 停止）"
exec pnpm dev
