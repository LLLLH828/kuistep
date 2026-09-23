-- ============================================================
-- Migration 004: 班级制角色模型
-- 架构（2026-09 定稿）：
--   1. 孩子通过班级邀请码加入班级（class_students），孩子关联的是班级而非老师
--   2. 老师凭同一邀请码共管班级（class_teachers，多老师共管）
--   3. 老师身份 = auth.users.raw_user_meta_data.is_teacher 开关（注册勾选或登录后开通）
--   4. 老师进家庭 = 以 parent 成员进入（注册时填家庭邀请码，或本就是自己家的家长）
-- 兼容：幂等可重复执行；自动清理上一版 teachers/teacher_students（若存在）
-- ============================================================

-- ------------------------------------------------------------
-- 0. 清理旧版老师模型（上一版 teacher_students 直接关联方案）
--    注意：drop policy ... on <table> 要求表存在；已确认本库从未建过 teachers/teacher_students，
--         所以只清理 family_members/reward_*/*tasks 上的旧 policy（这些表必定存在）
-- ------------------------------------------------------------
drop policy if exists "teacher can read family_members of their students" on public.family_members;
drop policy if exists "teacher reads student accounts" on public.reward_accounts;
drop policy if exists "teacher reads student txns" on public.reward_transactions;
drop policy if exists "teacher reads student tasks" on public.tasks;
drop table if exists public.teacher_students;
drop table if exists public.teachers;
drop function if exists public.set_teacher_invite_code();

-- ------------------------------------------------------------
-- 1. 班级表
-- ------------------------------------------------------------
create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text unique not null,  -- 班级邀请码：家长凭此把孩子加进班，老师凭此共管
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

create or replace function public.set_class_invite_code()
returns trigger language plpgsql as $$
begin
  if NEW.invite_code is null then
    NEW.invite_code := upper(substring(md5(random()::text), 1, 8));
  end if;
  return NEW;
end;
$$;

drop trigger if exists on_class_insert on public.classes;
create trigger on_class_insert before insert on public.classes
  for each row execute function public.set_class_invite_code();

-- 班级 ↔ 老师（多老师共管）
create table if not exists public.class_teachers (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  teacher_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  unique(class_id, teacher_user_id)
);

create index if not exists idx_class_teachers_teacher on public.class_teachers(teacher_user_id);
create index if not exists idx_class_teachers_class on public.class_teachers(class_id);

-- 班级 ↔ 学生（family_members 里的孩子成员）
create table if not exists public.class_students (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  child_member_id uuid not null references public.family_members(id) on delete cascade,
  created_at timestamptz default now(),
  unique(class_id, child_member_id)
);

create index if not exists idx_class_students_class on public.class_students(class_id);
create index if not exists idx_class_students_child on public.class_students(child_member_id);

-- ------------------------------------------------------------
-- 2. RLS
-- ------------------------------------------------------------
alter table public.classes enable row level security;
alter table public.class_teachers enable row level security;
alter table public.class_students enable row level security;

-- 辅助函数：我共管的班级 id 集合
-- （security definer：避免 class_teachers 策略子查询自引用造成 PG 无限递归）
create or replace function public.get_my_class_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select ct.class_id from public.class_teachers ct where ct.teacher_user_id = auth.uid();
$$;

-- classes：共管老师可读；家长可读自己孩子已加入的；创建者可建可改名
drop policy if exists "teachers read their classes" on public.classes;
create policy "teachers read their classes" on public.classes for select
  using (id in (select public.get_my_class_ids()));

drop policy if exists "parents read joined classes" on public.classes;
create policy "parents read joined classes" on public.classes for select
  using (id in (
    select cs.class_id from public.class_students cs
    join public.family_members fm on fm.id = cs.child_member_id
    where fm.family_id = public.get_user_family_id()
  ));

drop policy if exists "creator inserts class" on public.classes;
create policy "creator inserts class" on public.classes for insert
  with check (created_by = auth.uid());

drop policy if exists "creator updates class" on public.classes;
create policy "creator updates class" on public.classes for update
  using (created_by = auth.uid());

-- class_teachers：共管老师可见同班老师；老师可自加入/自退出；建班者可移除他人
drop policy if exists "teachers read co-teachers" on public.class_teachers;
create policy "teachers read co-teachers" on public.class_teachers for select
  using (class_id in (select public.get_my_class_ids()));

drop policy if exists "teacher adds self" on public.class_teachers;
create policy "teacher adds self" on public.class_teachers for insert
  with check (teacher_user_id = auth.uid());

drop policy if exists "teacher removes self" on public.class_teachers;
create policy "teacher removes self" on public.class_teachers for delete
  using (teacher_user_id = auth.uid());

drop policy if exists "creator removes co-teacher" on public.class_teachers;
create policy "creator removes co-teacher" on public.class_teachers for delete
  using (class_id in (select id from public.classes where created_by = auth.uid()));

-- class_students：共管老师可读；家长可读/删自己孩子的行
-- （写入只经 security definer RPC join_class_as_parent，防止家长把别人家孩子塞进班）
drop policy if exists "teachers read class students" on public.class_students;
create policy "teachers read class students" on public.class_students for select
  using (class_id in (select public.get_my_class_ids()));

drop policy if exists "parents read own children links" on public.class_students;
create policy "parents read own children links" on public.class_students for select
  using (child_member_id in (
    select id from public.family_members where family_id = public.get_user_family_id()
  ));

drop policy if exists "parents remove own children" on public.class_students;
create policy "parents remove own children" on public.class_students for delete
  using (child_member_id in (
    select id from public.family_members where family_id = public.get_user_family_id()
  ));

-- family_members：老师能看到共管班里的孩子
drop policy if exists "teacher sees class students" on public.family_members;
create policy "teacher sees class students" on public.family_members for select
  using (
    id in (
      select cs.child_member_id from public.class_students cs
      where cs.class_id in (select public.get_my_class_ids())
    )
  );

-- reward_accounts：老师能读共管班孩子的账户
drop policy if exists "teacher reads class accounts" on public.reward_accounts;
create policy "teacher reads class accounts" on public.reward_accounts for select
  using (
    child_member_id in (
      select cs.child_member_id from public.class_students cs
      where cs.class_id in (select public.get_my_class_ids())
    )
  );

-- reward_transactions：老师能读共管班孩子的流水
drop policy if exists "teacher reads class txns" on public.reward_transactions;
create policy "teacher reads class txns" on public.reward_transactions for select
  using (
    member_id in (
      select cs.child_member_id from public.class_students cs
      where cs.class_id in (select public.get_my_class_ids())
    )
  );

-- tasks：老师能读/写共管班孩子所在家庭的任务（布置任务需要 insert）
drop policy if exists "teacher reads class tasks" on public.tasks;
create policy "teacher reads class tasks" on public.tasks for select
  using (
    family_id in (
      select fm.family_id from public.family_members fm
      where fm.id in (
        select cs.child_member_id from public.class_students cs
        where cs.class_id in (select public.get_my_class_ids())
      )
    )
  );

drop policy if exists "teacher inserts class tasks" on public.tasks;
create policy "teacher inserts class tasks" on public.tasks for insert
  with check (
    family_id in (
      select fm.family_id from public.family_members fm
      where fm.id in (
        select cs.child_member_id from public.class_students cs
        where cs.class_id in (select public.get_my_class_ids())
      )
    )
  );

-- ------------------------------------------------------------
-- 3. 按码加入班级的 RPC（security definer，避免家长裸查 classes 泄露全表）
-- ------------------------------------------------------------
-- 家长凭班级邀请码把自己的孩子加入班级；成功返回班名，失败返回错误标记
create or replace function public.join_class_as_parent(p_code text, p_child_member_ids uuid[])
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class public.classes%rowtype;
  v_family uuid := public.get_user_family_id();
begin
  if v_family is null then
    return 'NO_FAMILY';
  end if;

  select * into v_class from public.classes where invite_code = upper(trim(p_code));
  if v_class.id is null then
    return 'CLASS_NOT_FOUND';
  end if;

  -- 校验：每个孩子都必须属于当前用户家庭且 role=child
  if exists (
    select 1 from unnest(p_child_member_ids) as x(id)
    where not exists (
      select 1 from public.family_members fm
      where fm.id = x.id and fm.family_id = v_family and fm.role = 'child'
    )
  ) then
    return 'CHILD_INVALID';
  end if;

  insert into public.class_students (class_id, child_member_id)
  select v_class.id, x.id from unnest(p_child_member_ids) as x(id)
  on conflict (class_id, child_member_id) do nothing;

  return v_class.name;
end;
$$;

-- 老师凭班级邀请码加入班级（成为共管老师）；成功返回班名
create or replace function public.join_class_as_teacher(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class public.classes%rowtype;
begin
  select * into v_class from public.classes where invite_code = upper(trim(p_code));
  if v_class.id is null then
    return 'CLASS_NOT_FOUND';
  end if;

  insert into public.class_teachers (class_id, teacher_user_id)
  values (v_class.id, auth.uid())
  on conflict (class_id, teacher_user_id) do nothing;

  return v_class.name;
end;
$$;

revoke execute on function public.join_class_as_parent(text, uuid[]) from anon;
revoke execute on function public.join_class_as_teacher(text) from anon;
grant execute on function public.join_class_as_parent(text, uuid[]) to authenticated;
grant execute on function public.join_class_as_teacher(text) to authenticated;

-- ------------------------------------------------------------
-- 4. 注册触发器：家长建家（或凭家庭码以家长身份加入）、孩子用邀请码加入
--    老师分支删除：is_teacher 只是 user_metadata，无需数据库动作
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(NEW.raw_user_meta_data->>'role', 'parent');
  v_family_id uuid;
  v_member_id uuid;
  v_nick text := coalesce(NEW.raw_user_meta_data->>'nickname', split_part(NEW.email, '@', 1));
  v_invite text := NEW.raw_user_meta_data->>'invite_code';
begin

  -- ======= 家长（默认）=======
  if v_role = 'parent' then
    if v_invite is not null then
      -- 凭家庭邀请码以家长身份加入已有家庭（老师进家庭走这条路，第二家长也走这条路）
      select id into v_family_id from public.families where invite_code = v_invite;
      if v_family_id is null then
        raise exception '无效的家庭邀请码: %', v_invite;
      end if;

      insert into public.family_members (family_id, user_id, role, nickname, is_primary)
      values (v_family_id, NEW.id, 'parent', v_nick, false);
    else
      -- 创建新家庭
      insert into public.families (name, invite_code)
      values (
        coalesce(NEW.raw_user_meta_data->>'family_name', v_nick || '的家'),
        upper(substring(md5(random()::text), 1, 6))
      )
      returning id into v_family_id;

      insert into public.family_members (family_id, user_id, role, nickname, is_primary)
      values (v_family_id, NEW.id, 'parent', v_nick, true);

      -- 初始化五维模板
      insert into public.reward_templates (family_id, dimension, item_name, points, is_decrease, sort_order) values
        (v_family_id, 'de', '主动帮助他人', 2, false, 1),
        (v_family_id, 'de', '礼貌待人', 1, false, 2),
        (v_family_id, 'de', '撒谎/没礼貌', -2, true, 3),
        (v_family_id, 'zhi', '作业全对', 3, false, 1),
        (v_family_id, 'zhi', '主动提问', 2, false, 2),
        (v_family_id, 'zhi', '作业拖沓', -2, true, 3),
        (v_family_id, 'ti', '坚持运动', 2, false, 1),
        (v_family_id, 'ti', '按时作息', 1, false, 2),
        (v_family_id, 'ti', '久坐不动', -1, true, 3),
        (v_family_id, 'mei', '展示才艺', 2, false, 1),
        (v_family_id, 'mei', '整理房间', 1, false, 2),
        (v_family_id, 'mei', '乱涂乱画', -1, true, 3),
        (v_family_id, 'lao', '主动做家务', 2, false, 1),
        (v_family_id, 'lao', '自己整理书包', 1, false, 2),
        (v_family_id, 'lao', '丢三落四', -1, true, 3);
    end if;

  -- ======= 孩子（必须用家庭邀请码）=======
  elsif v_role = 'child' and v_invite is not null then
    select id into v_family_id from public.families where invite_code = v_invite;
    if v_family_id is null then
      raise exception '无效的家庭邀请码: %', v_invite;
    end if;

    -- 优先绑定家长预先创建的离线孩子（同家庭 + 同昵称 + 未绑定）
    select id into v_member_id
      from public.family_members
      where family_id = v_family_id and role = 'child' and nickname = v_nick and user_id is null
      limit 1;

    if v_member_id is not null then
      update public.family_members set user_id = NEW.id where id = v_member_id;
    else
      insert into public.family_members (family_id, user_id, role, nickname, is_primary)
      values (v_family_id, NEW.id, 'child', v_nick, false);
    end if;

  end if;

  return NEW;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
