-- ============================================================
-- Migration 006: 双主体加分（家庭 vs 学校）
-- 核心：reward_transactions / tasks 加 scope 字段（'family' | 'school'）
-- 写权限按 scope 隔离：家长只能写 family，老师只能写 school
-- 读权限保持交叉：双方都能读 family + school
-- 总分天然 = 两者之和（reward_accounts.total_points 是 reward_transactions 的 SUM，触发器维护）
-- 幂等：可重复执行——每个 create 前先 drop 新名字，不管旧名字是什么
-- ============================================================

-- 1. reward_transactions 加 scope（默认 family，向后兼容所有历史数据）
alter table public.reward_transactions
  add column if not exists scope text not null default 'family'
  check (scope in ('family', 'school'));

-- 2. tasks 加 scope（默认 family，向后兼容所有历史数据）
alter table public.tasks
  add column if not exists scope text not null default 'family'
  check (scope in ('family', 'school'));

-- ------------------------------------------------------------
-- 3. reward_transactions: 写权限按 scope 隔离
-- ------------------------------------------------------------

-- 家长 insert 只能写 scope='family'
drop policy if exists "insert transactions" on public.reward_transactions;
drop policy if exists "insert family txns" on public.reward_transactions;
create policy "insert family txns" on public.reward_transactions for insert
  with check (
    account_id in (select public.get_my_child_account_ids())
    and member_id in (select public.get_my_child_member_ids())
    and scope = 'family'
  );

-- 老师 insert 只能写 scope='school'（这是新增的！之前老师根本不能写流水）
drop policy if exists "teacher inserts class txns" on public.reward_transactions;
drop policy if exists "teacher inserts school txns" on public.reward_transactions;
create policy "teacher inserts school txns" on public.reward_transactions for insert
  with check (
    member_id in (select public.get_my_student_member_ids())
    and scope = 'school'
  );

-- select 保持不变：家长读自家孩子全部流水（含 school），老师读共管班孩子全部流水（含 family）
-- 现有 "read transactions" + "teacher reads class txns" 两个 policy 已经支持交叉只读 ✓

-- ------------------------------------------------------------
-- 4. tasks: 写权限按 scope 隔离
-- ------------------------------------------------------------

-- 家长 insert 只能写 scope='family'
drop policy if exists "insert tasks" on public.tasks;
drop policy if exists "insert family tasks" on public.tasks;
create policy "insert family tasks" on public.tasks for insert
  with check (
    family_id = public.get_user_family_id()
    and scope = 'family'
  );

-- 家长 update 只能改 scope='family'（不能改学校布置的任务）
drop policy if exists "update tasks" on public.tasks;
drop policy if exists "update family tasks" on public.tasks;
create policy "update family tasks" on public.tasks for update
  using (
    family_id = public.get_user_family_id()
    and scope = 'family'
  );

-- 家长 delete 只能删 scope='family'
drop policy if exists "delete tasks" on public.tasks;
drop policy if exists "delete family tasks" on public.tasks;
create policy "delete family tasks" on public.tasks for delete
  using (
    family_id = public.get_user_family_id()
    and scope = 'family'
  );

-- 老师 insert 只能写 scope='school'
drop policy if exists "teacher inserts class tasks" on public.tasks;
drop policy if exists "insert school tasks" on public.tasks;
create policy "insert school tasks" on public.tasks for insert
  with check (
    family_id in (select public.get_my_student_family_ids())
    and scope = 'school'
  );

-- 老师 update：先不给（老师布置任务后，状态变更是家长端 confirm，老师只读）
-- 如果以后老师也需要改自己布置的任务，再加：
-- drop policy if exists "update school tasks" on public.tasks;
-- create policy "update school tasks" on public.tasks for update
--   using (family_id in (select public.get_my_student_family_ids()) and scope = 'school');

-- ------------------------------------------------------------
-- 5. 验证（执行后跑这些查询）
-- ------------------------------------------------------------
-- select policyname, cmd from pg_policies where tablename in ('reward_transactions','tasks') order by tablename, policyname;
-- select column_name, data_type from information_schema.columns where table_name in ('reward_transactions','tasks') and column_name = 'scope';
