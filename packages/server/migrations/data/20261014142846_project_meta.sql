-- data 迁移：写入项目元数据
-- 生成时间：2026-10-14 14:28
-- 注意：data 脚本也只会执行一次，但请尽量写成幂等的（on conflict do nothing），
--       以防数据库恢复/重建等场景需要重放。
insert into app_meta (key, value)
values ('project', '{"name":"agent-todo"}'::jsonb)
on conflict (key) do nothing;
