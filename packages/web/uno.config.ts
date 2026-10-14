import { defineConfig } from '@unocss/vite'
import presetWind4 from '@unocss/preset-wind4'

/**
 * UnoCSS 配置（Tailwind 4 风格的 wind4 preset）。
 *
 * 设计系统的约定：
 * - 所有原始色值 / 尺寸 / 动效集中在 `src/tokens.css`（唯一来源）
 * - 这里的 theme 把语义色映射成 `--*` 变量引用 → `bg-surface`、`text-meta`、
 *   `border-border` 这类语义工具类可用，换主题只改 tokens.css
 * - 间距 / 圆角 / 阴影刻意不走 UnoCSS theme（避免和 wind4 自带的
 *   `--spacing`、`--radius-md` 变量撞名），直接用 `gap-[var(--space-3)]`、
 *   `rounded-[var(--radius-md)]` 这种写法
 */
export default defineConfig({
  presets: [presetWind4({ dark: 'media' })],
  theme: {
    colors: {
      bg: 'var(--bg)',
      surface: { DEFAULT: 'var(--surface)', warm: 'var(--surface-warm)' },
      fg: { DEFAULT: 'var(--fg)', 2: 'var(--fg-2)' },
      muted: 'var(--muted)',
      meta: 'var(--meta)',
      border: { DEFAULT: 'var(--border)', soft: 'var(--border-soft)' },
      accent: {
        DEFAULT: 'var(--accent)',
        on: 'var(--accent-on)',
        hover: 'var(--accent-hover)',
        active: 'var(--accent-active)',
        soft: 'var(--accent-soft)',
      },
      success: 'var(--success)',
      warn: 'var(--warn)',
      danger: { DEFAULT: 'var(--danger)', soft: 'var(--danger-soft)', text: 'var(--danger-text)' },
    },
    font: {
      // wind4 会自动生成 `--font-*` 变量（自引用覆盖我们的令牌），所以显示字体
      // 不走 theme：用下面的 font-heading shortcut 指到 tokens.css 的 --font-display
      sans: 'var(--font-body)',
      mono: 'var(--font-mono)',
    },
    breakpoint: {
      // 与原型一致：<920px 走「侧边栏横向 + 抽屉全宽」布局
      md: '920px',
      lg: '1200px',
    },
  },
  preflights: [
    {
      getCSS: () => `
        :root { color-scheme: light; }
        html, body, #root { height: 100%; }
        body {
          margin: 0;
          background: var(--bg);
          color: var(--fg);
          font-family: var(--font-body);
          -webkit-font-smoothing: antialiased;
          text-rendering: optimizeLegibility;
          overflow: hidden;
        }
        :focus-visible { outline: 2px solid color-mix(in oklab, var(--accent), transparent 30%); outline-offset: 2px; }
      `,
    },
  ],
  rules: [
    // 等宽数字（日期列对齐），原型里的 .num
    [
      'num',
      {
        'font-family': 'var(--font-mono)',
        'font-variant-numeric': 'tabular-nums',
      },
    ],
  ],
  shortcuts: [
    ['font-heading', 'font-[var(--font-display)] tracking-[var(--tracking-display)]'],
    ['btn', 'inline-flex items-center gap-[var(--space-2)] px-[var(--space-4)] py-[9px] rounded-[var(--radius-md)] text-sm font-500 border border-transparent transition-colors'],
    ['btn-primary', 'btn bg-accent text-accent-on hover:bg-accent-hover active:bg-accent-active'],
    ['btn-secondary', 'btn bg-bg text-fg border-border hover:bg-surface'],
    ['btn-icon', 'inline-grid place-items-center w-[34px] h-[34px] rounded-[var(--radius-sm)] text-muted hover:bg-surface hover:text-fg transition-colors'],
    ['btn-x', 'inline-grid place-items-center w-[24px] h-[24px] rounded-[6px] text-muted hover:bg-surface hover:text-fg transition-colors'],
    ['segmented', 'inline-flex gap-[2px] p-[2px] bg-surface rounded-[var(--radius-md)]'],
    ['seg-btn', 'px-[15px] py-[6px] rounded-[10px] text-sm text-muted transition-colors hover:text-fg'],
    ['seg-btn-active', 'bg-bg text-fg shadow-[0_1px_2px_color-mix(in_oklab,var(--fg),transparent_90%)]'],
    ['panel-label', 'text-xs font-600 tracking-[0.06em] uppercase text-meta'],
    ['tag-chip', 'inline-flex items-center px-[8px] py-[1px] border border-border rounded-full text-xs text-muted'],
    ['side-item', 'flex items-center justify-between gap-[var(--space-2)] w-full px-[10px] py-[8px] rounded-[var(--radius-sm)] text-sm text-left transition-colors hover:bg-[var(--fg-soft)]'],
    ['side-item-active', 'bg-accent-soft font-600'],
    ['field-block', 'flex flex-col gap-[9px]'],
    ['mini-field', 'flex flex-col gap-[4px] text-xs text-muted'],
    ['mini-input', 'w-full px-[11px] py-[8px] border border-border rounded-[var(--radius-sm)] bg-bg text-sm focus:outline-none focus:border-accent'],
    ['cal-chip', 'flex items-center gap-[6px] px-[7px] py-[3px] bg-bg border border-border rounded-[7px] cursor-grab overflow-hidden transition-colors hover:border-[var(--meta)] hover:bg-surface-warm'],
  ],
})

