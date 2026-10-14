-- 基线迁移：应用级元数据（key/value）
-- 迁移器会自动维护 schema_migrations 表，本文件只写业务/结构变更
create table if not exists app_meta (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
