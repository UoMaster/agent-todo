#!/bin/sh
# 生成一个新的迁移脚本（文件名自动带 14 位完整时间戳）
#
# 用法：
#   pnpm migrations:new schema add_todos_table
#   pnpm migrations:new data seed_project_meta
#
# 说明：schema = 库表升级（DDL），data = 刷数据（DML）。
# 生成后直接编辑文件即可；迁移脚本只允许新增，不允许改老的。
set -eu

ROOT=${MIGRATIONS_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}
module="${1:-}"
desc="${2:-}"

if [ "$module" != "schema" ] && [ "$module" != "data" ]; then
  echo "用法：$0 <schema|data> <描述>" >&2
  exit 2
fi

if [ -z "$desc" ]; then
  echo "用法：$0 <schema|data> <描述>" >&2
  exit 2
fi

case "$desc" in
  *[!a-z0-9_]*)
    echo "描述只能用小写字母、数字、下划线：${desc}（如 add_todos_table）" >&2
    exit 2
    ;;
esac

dir="$ROOT/packages/server/migrations/$module"
[ -d "$dir" ] || {
  echo "目录不存在：${dir}" >&2
  exit 1
}

file="$dir/$(date +%Y%m%d%H%M%S)_$desc.sql"
[ -e "$file" ] && {
  echo "同一秒内已存在同名文件，稍后重试" >&2
  exit 1
}

if [ "$module" = "schema" ]; then
  hint="库表升级（DDL），例如 create table / alter table / create index"
else
  hint="刷数据（DML），请尽量写成幂等的（on conflict do nothing）"
fi

cat > "$file" <<EOF
-- $module 迁移：$desc
-- 生成时间：$(date '+%Y-%m-%d %H:%M:%S')
-- 类型：$hint
-- 规则：迁移脚本只允许新增，不允许修改 / 删除（scripts/check-migrations.sh 用 git 强制）

EOF

echo "✔ 已创建 $file"
