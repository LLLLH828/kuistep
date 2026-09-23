-- ============================================================
-- Migration 005: 修复 RLS 无限递归
-- 问题：migration 004 的策略互相裸查对方表
--   family_members"teacher" → class_students → family_members → 💥 infinite recursion
-- 修法：所有跨表子查询统一收口到 security definer 函数（函数内不受 RLS，循环无从产生）
-- 幂等：可重复执行
-- ============================================================

-- ------------------------------------------------------------
-- 1. security definer 辅助函数（打破递归的关键）
-- ------------------------------------------------------------
-- 我家孩子成员 id（家长侧）
create or replace function public.get_my_child_member_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select id from public.family_members
  where family_id = public.get_user_family_id() and role = 'child';
$$;

-- 我共管班级的学生成员 id（老师侧）
create or replace function public.get_my_student_member_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select cs.child_member_id from public.class_students cs
  where cs.class_id in (select public.get_my_class_ids());
$$;

-- 我共管学生所在的家庭 id（老师布置任务用）
create or replace function public.get_my_student_family_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select fm.family_id from public.family_members fm
  where fm.id in (select public.get_my_student_member_ids());
$$;

-- 我家孩子的班级 id（家长读已加入班级用）
create or replace function public.get_my_parent_class_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select cs.class_id from public.class_students cs
  where cs.child_member_id in (select public.get_my_child_member_ids());
$$;

-- 我家孩子的积分账户 id（流水策略用）
create or replace function public.get_my_child_account_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select ra.id from public.reward_accounts ra
  where ra.child_member_id in (select public.get_my_child_member_ids());
$$;

-- ------------------------------------------------------------
-- 2. 重写产生递归的策略（全部只引用上面的 SD 函数）
-- ------------------------------------------------------------

-- === family_members ===
drop policy if exists "teacher sees class students" on public.family_members;
create policy "teacher sees class students" on public.family_members for select
  using (id in (select public.get_my_student_member_ids()));

-- === class_students ===
drop policy if exists "parents read own children links" on public.class_students;
create policy "parents read own children links" on public.class_students for select
  using (child_member_id in (select public.get_my_child_member_ids()));

drop policy if exists "parents remove own children" on public.class_students;
create policy "parents remove own children" on public.class_students for delete
  using (child_member_id in (select public.get_my_child_member_ids()));

-- === classes ===
drop policy if exists "parents read joined classes" on public.classes;
create policy "parents read joined classes" on public.classes for select
  using (id in (select public.get_my_parent_class_ids()));

-- === reward_accounts ===
drop policy if exists "read accounts" on public.reward_accounts;
create policy "read accounts" on public.reward_accounts for select
  using (child_member_id in (select public.get_my_child_member_ids()));

drop policy if exists "teacher reads class accounts" on public.reward_accounts;
create policy "teacher reads class accounts" on public.reward_accounts for select
  using (child_member_id in (select public.get_my_student_member_ids()));

-- === reward_transactions ===
drop policy if exists "read transactions" on public.reward_transactions;
create policy "read transactions" on public.reward_transactions for select
  using (account_id in (select public.get_my_child_account_ids()));

drop policy if exists "insert transactions" on public.reward_transactions;
create policy "insert transactions" on public.reward_transactions for insert
  with check (
    account_id in (select public.get_my_child_account_ids())
    and member_id in (select public.get_my_child_member_ids())
  );

drop policy if exists "teacher reads class txns" on public.reward_transactions;
create policy "teacher reads class txns" on public.reward_transactions for select
  using (member_id in (select public.get_my_student_member_ids()));

-- === tasks ===
drop policy if exists "teacher reads class tasks" on public.tasks;
create policy "teacher reads class tasks" on public.tasks for select
  using (family_id in (select public.get_my_student_family_ids()));

drop policy if exists "teacher inserts class tasks" on public.tasks;
create policy "teacher inserts class tasks" on public.tasks for insert
  with check (family_id in (select public.get_my_student_family_ids()));

-- ------------------------------------------------------------
-- 3. 验证（可选）：执行后跑这条应返回 4 行策略名
--    select policyname from pg_policies where tablename = 'family_members';
-- ------------------------------------------------------------
