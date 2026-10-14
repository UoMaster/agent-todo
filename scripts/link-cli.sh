#!/bin/sh
# 把 agent-todo CLI 链接到全局（在 PATH 里生成一个启动器）。
#
# 用法：
#   ./scripts/link-cli.sh link      # 创建/更新启动器
#   ./scripts/link-cli.sh unlink    # 移除启动器
#
# 说明：pnpm 12 移除了 `pnpm link --global`，且新版全局 bin 目录（$PNPM_HOME/bin）
# 默认不在 PATH 里；所以这里在 $PNPM_HOME（已在 PATH）下生成一个薄启动器，
# 直接运行仓库里的 TS 源码（Node 原生类型擦除），改代码即时生效。
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
BIN_DIR="${PNPM_HOME:-$HOME/Library/pnpm}"
TARGET="$BIN_DIR/agent-todo"
ENTRY="$ROOT/packages/cli/src/index.ts"

action="${1:-link}"

case "$action" in
  link)
    if [ -f "$TARGET" ] && ! grep -q "agent-todo 仓库生成的启动器" "$TARGET" 2>/dev/null; then
      echo "✗ $TARGET 已存在且不是本仓库生成的，请手动处理后重试" >&2
      exit 1
    fi

    cat > "$TARGET" <<EOF
#!/bin/sh
# agent-todo 仓库生成的启动器（pnpm cli:unlink 可移除）
exec node "$ENTRY" "\$@"
EOF
    chmod +x "$TARGET"
    echo "✔ 已链接：$TARGET → $ENTRY"

    case ":$PATH:" in
      *":$BIN_DIR:"*) echo "  现在可以在任意目录运行：agent-todo --help" ;;
      *) echo "  ⚠ $BIN_DIR 不在 PATH，需要先加入 PATH" ;;
    esac
    ;;

  unlink)
    if [ -f "$TARGET" ] && grep -q "agent-todo 仓库生成的启动器" "$TARGET" 2>/dev/null; then
      rm -f "$TARGET"
      echo "✔ 已移除 $TARGET"
    else
      echo "（$TARGET 不存在或不是本仓库生成的，无需处理）"
    fi
    ;;

  *)
    echo "用法：$0 [link|unlink]" >&2
    exit 2
    ;;
esac
