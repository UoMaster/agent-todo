-- schema 迁移：待办 / 标签 / 子任务 / 附件 四张表
-- 生成时间：2026-10-14 15:35
--
-- 说明：
-- - priority 用 smallint 存（0=无 1=低 2=中 3=高），避免 enum 迁移的麻烦
-- - start_date 为空表示未安排；end_date 为空表示单日待办，有值表示区间（end >= start）
-- - 标签用「标签表 + 关联表」建模，便于统计每个标签的待办数
-- - 附件只存元数据，文件本体落在 UPLOADS_DIR 磁盘上（相对路径存在 storage_path）

create table if not exists todos (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  description text not null default '',
  done boolean not null default false,
  priority smallint not null default 0,
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint todos_priority_range check (priority between 0 and 3),
  constraint todos_date_range check (end_date is null or (start_date is not null and end_date >= start_date))
);

-- 列表按开始日期排序、日历按月取数
create index if not exists todos_start_date_idx on todos (start_date);
create index if not exists todos_done_idx on todos (done);

create table if not exists subtasks (
  id uuid primary key default gen_random_uuid(),
  todo_id uuid not null references todos (id) on delete cascade,
  title text not null default '',
  done boolean not null default false,
  position integer not null default 0
);

create index if not exists subtasks_todo_id_idx on subtasks (todo_id, position);

create table if not exists tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table if not exists todo_tags (
  todo_id uuid not null references todos (id) on delete cascade,
  tag_id uuid not null references tags (id) on delete cascade,
  primary key (todo_id, tag_id)
);

create table if not exists attachments (
  id uuid primary key default gen_random_uuid(),
  todo_id uuid not null references todos (id) on delete cascade,
  name text not null,
  mime_type text not null default '',
  size bigint not null default 0,
  -- 相对 UPLOADS_DIR 的存储路径，文件本体在磁盘上
  storage_path text not null,
  created_at timestamptz not null default now()
);

create index if not exists attachments_todo_id_idx on attachments (todo_id, created_at);
