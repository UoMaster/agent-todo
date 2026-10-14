// 一次性演示数据：把原型的 15 条待办灌进本地库，方便看效果
// 用法：NO_PROXY=localhost,127.0.0.1 node packages/server/scripts/seed-demo.mjs（server 需在 3001 运行）
//
// 注意：server 默认监听 localhost，Node 的 fetch 解析 localhost 走的是本机解析顺序，
// 用 127.0.0.1 可能连不上（默认监听 ::1），所以这里固定用 localhost。
const BASE = process.env.AGENT_TODO_SERVER ?? 'http://localhost:3001'

const TODOS = [
  {
    title: '完成 Q4 产品路线图评审',
    description: '与增长、工程一起过一遍 Q4 优先级，确认资源分配。\n\n**评审要点**\n\n- 核对各团队人力投入\n- 确认 Top 3 方向与验收口径\n- 输出[决策记录](https://example.com/notes)',
    priority: 'high',
    tags: ['产品', '会议'],
    startDate: '2026-10-14',
    subtasks: ['整理上季度数据', '邀请相关同事'],
  },
  { title: '重构登录鉴权模块', description: '迁移到新的 token 方案，覆盖刷新与登出逻辑。', priority: 'high', tags: ['研发'], startDate: '2026-10-12', endDate: '2026-10-16' },
  { title: '整理用户访谈纪要', description: '', priority: 'medium', tags: ['研究'], startDate: '2026-10-14' },
  { title: '提交季度预算表', description: '', priority: 'high', tags: ['财务'], startDate: '2026-10-13' },
  { title: '更新设计规范文档', description: '', priority: 'low', tags: ['设计'], startDate: '2026-10-15' },
  { title: '设计评审会', description: '', priority: 'medium', tags: ['设计', '会议'], startDate: '2026-10-16' },
  { title: '预约牙医', description: '', priority: 'medium', tags: ['生活'], startDate: '2026-10-17' },
  { title: '整理竞品分析材料', description: '', priority: 'medium', tags: ['研究', '竞品'], startDate: '2026-10-18', endDate: '2026-10-22' },
  { title: '回复客户邮件', description: '', priority: 'high', tags: ['支持'], startDate: '2026-10-14' },
  { title: '健身 5 公里', description: '', priority: 'low', tags: ['健康'], startDate: '2026-10-14', done: true },
  { title: '准备发布说明', description: '', priority: 'medium', tags: ['研发', '发布'], startDate: '2026-10-20' },
  { title: '采购办公用品', description: '', priority: 'none', tags: ['行政'] },
  { title: '制定下周迭代计划', description: '', priority: 'medium', tags: ['产品'], startDate: '2026-10-19', endDate: '2026-10-23' },
  {
    title: '确认续约合同条款',
    description: '法务已反馈修改意见，需在续约前完成确认。',
    priority: 'high',
    tags: ['财务', '会议'],
    startDate: '2026-10-08',
  },
  {
    title: '修复线上崩溃问题',
    description: '用户反馈支付流程偶发崩溃，**需在版本发布前修复**。\n\n> 复现路径：结算页 → 选择优惠券 → 提交订单。\n\n- 定位崩溃堆栈\n- 补充回归用例',
    priority: 'high',
    tags: ['研发', '支持'],
    startDate: '2026-10-09',
    endDate: '2026-10-12',
  },
]

async function request(path, init) {
  const response = await fetch(`${BASE}${path}`, init)
  if (!response.ok) throw new Error(`${path} → ${response.status} ${await response.text()}`)

  return response.status === 204 ? null : response.json()
}

// 清空历史（含冒烟测试 / 误点新建写入的空待办）
for (const todo of await request('/api/todos')) {
  await request(`/api/todos/${todo.id}`, { method: 'DELETE' })
}

for (const { done = false, ...todo } of TODOS) {
  const created = await request('/api/todos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...todo, done }),
  })

  if (created.done !== done) throw new Error(`写入 ${todo.title} 后完成状态不对`)
}

const all = await request('/api/todos')
console.log(`✔ 已写入 ${all.length} 条演示待办（其中已完成 ${all.filter((todo) => todo.done).length} 条）`)
