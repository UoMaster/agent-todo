#!/bin/sh
# 迁移脚本守护（用 git 强制，不只是约定）：
#   1. 只允许新增：禁止修改 / 删除 / 重命名已有的迁移脚本
#   2. 文件名必须是 `<14 位完整时间戳>_<描述>.sql`
#   3. 迁移目录只允许放 .sql 文件
#
# 用法：
#   sh scripts/check-migrations.sh                 # 检查暂存区（pre-commit 用）
#   sh scripts/check-migrations.sh --base <ref>    # 检查 <ref>...HEAD 的差异（CI 用）
#
# 待检查的目录（只有这两个目录受保护）：
#   packages/server/migrations/schema  库表升级
#   packages/server/migrations/data    刷数据
set -eu

ROOT=${MIGRATIONS_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}
cd "$ROOT"

MODULES_DIR="packages/server/migrations"
MODULES="schema data"

fail() {
  echo "✗ $1" >&2
  exit 1
}

problems=""

# ---------- 1. 目录结构与文件名 ----------
for module in $MODULES; do
  dir="$MODULES_DIR/$module"
  if [ ! -d "$dir" ]; then
    problems="${problems}缺少迁移模块目录：${dir}（两个模块都必须存在且至少保留一个脚本）
"
    continue
  fi

  for file in "$dir"/*; do
    [ -e "$file" ] || continue
    base=$(basename "$file")

    case "$base" in
      *.sql) ;;
      *)
        problems="${problems}迁移目录只能放 .sql 文件：${module}/${base}
"
        continue
        ;;
    esac

    echo "$base" | grep -Eq '^[0-9]{14}_[a-z0-9_]+\.sql$' ||
      problems="${problems}文件名必须形如 20261014142746_description.sql（14 位完整时间戳）：${module}/${base}
"
  done
done

# ---------- 2. 只允许新增（git 差异检测） ----------
if [ "${1:-}" = "--base" ]; then
  base="${2:-}"
  if [ -z "$base" ]; then
    echo "（未提供基准引用，跳过差异检查）"
    exit 0
  fi
  case "$base" in
    0000000000000000000000000000000000000000)
      echo "（首次推送，跳过差异检查）"
      exit 0
      ;;
  esac
  git rev-parse --verify -q "${base}^{commit}" >/dev/null ||
    fail "无法解析基准引用：${base}（CI 需要 fetch-depth: 0 才能拿到基准提交）"
  changed=$(git diff --diff-filter=DMR --name-only "${base}...HEAD" -- "$MODULES_DIR/schema" "$MODULES_DIR/data")
  where="与 ${base} 对比"
else
  changed=$(git diff --cached --diff-filter=DMR --name-only -- "$MODULES_DIR/schema" "$MODULES_DIR/data")
  where="暂存区"
fi

if [ -n "$changed" ]; then
  problems="${problems}检测到修改 / 删除 / 重命名（${where}）：
$(echo "$changed" | sed 's/^/    /')
"
fi

if [ -n "$problems" ]; then
  echo "✗ 迁移脚本只允许新增，检查未通过：" >&2
  printf '%s' "$problems" >&2
  echo "  正确做法：新增一个带新时间戳的脚本（pnpm migrations:new <schema|data> <描述>），不要改老脚本。" >&2
  exit 1
fi

echo "✔ 迁移脚本检查通过（${where}：无修改 / 删除 / 重命名）"
