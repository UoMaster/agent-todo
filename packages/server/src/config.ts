/** server 运行时配置，全部可通过环境变量覆盖（Bun 自动加载 .env；Node 由 dev/start 脚本的 --env-file-if-exists 加载） */
export const config = {
  port: Number(process.env.PORT ?? 3001),
  /** 监听地址：本机开发用 localhost；容器里必须用 0.0.0.0，否则端口转发访问不到 */
  hostname: process.env.HOST ?? 'localhost',
  /** 前端构建产物目录；设置后由 server 托管（生产 / 容器模式），未设置则纯 API 模式 */
  staticDir: process.env.STATIC_DIR,
  /** 上传文件目录（未来的图片上传），容器里指向挂载卷 */
  uploadsDir: process.env.UPLOADS_DIR ?? new URL('../.data/uploads', import.meta.url).pathname,
  /** PostgreSQL 连接串；未配置时数据库相关功能不可用（/api/health 会明确提示） */
  databaseUrl: process.env.DATABASE_URL,
  /** 数据库迁移文件目录 */
  migrationsDir: process.env.MIGRATIONS_DIR ?? new URL('../migrations', import.meta.url).pathname,
}
