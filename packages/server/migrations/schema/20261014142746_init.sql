-- schema 迁移：基线 —— 应用级元数据表
-- 生成时间：2026-10-14 14:27
create table if not exists app_meta (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 旧版迁移记录表（脚手架阶段使用），已被 migration_runs 取代
drop table if exists schema_migrations;
