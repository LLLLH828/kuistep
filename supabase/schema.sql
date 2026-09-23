-- ============================================================
-- 跬步 KuiBu - 完整数据库 Schema
-- 在 Supabase SQL Editor 中执行此文件
-- ============================================================

-- 清理旧对象（重新初始化时用）
-- 注意：drop trigger ... on <表> 要求表必须存在，所以表内触发器不在这里删，
--       由下方 drop table ... cascade 连带删除；只保留 auth.users 上的触发器清理。
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop function if exists public.update_account_after_transaction();
drop function if exists public.on_task_confirmed();
drop function if exists public.get_user_family_id();

drop table if exists public.task_submissions cascade;
drop table if exists public.redemptions cascade;
drop table if exists public.reward_transactions cascade;
drop table if exists public.reward_items cascade;
drop table if exists public.reward_accounts cascade;
drop table if exists public.reward_templates cascade;
drop table if exists public.wrong_questions cascade;
drop table if exists public.tasks cascade;
drop table if exists public.family_members cascade;
drop table if exists public.families cascade;

drop type if exists public.evaluation_dimension;
drop type if exists public.task_status;
drop type if exists public.task_mode;

-- ------------------------------------------------------------
-- 枚举类型
-- ------------------------------------------------------------
create type public.evaluation_dimension as enum ('de', 'zhi', 'ti', 'mei', 'lao', 'custom');
create type public.task_status as enum ('pending', 'submitted', 'confirmed', 'rejected');
create type public.task_mode as enum ('required', 'challenge');

-- ------------------------------------------------------------
-- 1. 家庭与成员
-- ------------------------------------------------------------
create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text unique not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,  -- 孩子可以暂时没有 user_id
  role text not null check (role in ('parent', 'child')),
  nickname text,
  avatar_url text,
  is_primary boolean default false,
  created_at timestamptz default now()
);

-- 部分唯一索引：同一用户在同一家庭只出现一次（孩子未绑定时 user_id 为 null，不参与）
create unique index idx_family_members_family_user
  on public.family_members(family_id, user_id)
  where user_id is not null;

create index idx_family_members_family on public.family_members(family_id);
create index idx_family_members_user on public.family_members(user_id);

-- ------------------------------------------------------------
-- 2. 奖励系统
-- ------------------------------------------------------------
create table public.reward_accounts (
  id uuid primary key default gen_random_uuid(),
  child_member_id uuid not null references public.family_members(id) on delete cascade,
  total_points integer not null default 0,
  lifetime_points integer not null default 0,
  daily_points_earned integer not null default 0,
  daily_points_spent integer not null default 0,
  daily_reset_date date default current_date,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(child_member_id)
);

create table public.reward_transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.reward_accounts(id) on delete cascade,
  member_id uuid not null references public.family_members(id) on delete cascade,
  points integer not null,
  reason text not null,
  dimension public.evaluation_dimension default 'zhi',
  custom_dimension_name text,
  source text default 'manual',
  source_id uuid,
  created_by uuid references public.family_members(id),
  created_at timestamptz default now()
);

create index idx_reward_transactions_account on public.reward_transactions(account_id);
create index idx_reward_transactions_member on public.reward_transactions(member_id);
create index idx_reward_transactions_created on public.reward_transactions(created_at desc);

create table public.reward_templates (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  dimension public.evaluation_dimension not null,
  custom_dimension_name text,
  item_name text not null,
  points integer not null,
  is_decrease boolean default false,
  is_active boolean default true,
  sort_order integer default 0,
  created_at timestamptz default now()
);

create index idx_reward_templates_family on public.reward_templates(family_id);

create table public.reward_items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_member_id uuid references public.family_members(id) on delete set null,
  name text not null,
  description text,
  points_required integer not null,
  category text check (category in ('material', 'non-material')),
  image_url text,
  stock integer,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table public.redemptions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.reward_items(id),
  account_id uuid not null references public.reward_accounts(id),
  points_spent integer not null,
  status text check (status in ('pending', 'fulfilled', 'cancelled')) default 'pending',
  fulfilled_by uuid references public.family_members(id),
  fulfilled_at timestamptz,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- 3. 任务系统
-- ------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_member_id uuid not null references public.family_members(id) on delete cascade,
  title text not null,
  description text,
  dimension public.evaluation_dimension default 'zhi',
  points_reward integer not null default 1,
  mode public.task_mode default 'required',
  points_multiplier numeric(3,1) default 1.0,
  due_date timestamptz,
  status public.task_status default 'pending',
  ai_generated boolean default false,
  source_text text,
  created_by uuid references public.family_members(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_tasks_family on public.tasks(family_id);
create index idx_tasks_child on public.tasks(child_member_id);
create index idx_tasks_status on public.tasks(status);

create table public.task_submissions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  submitted_by uuid not null references public.family_members(id),
  content text,
  photo_urls text[],
  audio_url text,
  ai_score numeric(5,2),
  ai_feedback text,
  status public.task_status default 'submitted',
  confirmed_by uuid references public.family_members(id),
  confirmed_at timestamptz,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- 4. 错题本
-- ------------------------------------------------------------
create table public.wrong_questions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_member_id uuid not null references public.family_members(id) on delete cascade,
  subject text not null,
  content text not null,
  photo_url text,
  knowledge_point text,
  difficulty integer default 3,
  review_count integer default 0,
  last_reviewed_at timestamptz,
  next_review_at timestamptz,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- 4b. 班级系统（孩子通过班级关联老师；老师身份是 user_metadata.is_teacher 开关，
--     老师进家庭 = 以 parent 成员身份进入，不在家庭里有独立角色）
-- ------------------------------------------------------------
create table public.classes (
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
create table public.class_teachers (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  teacher_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  unique(class_id, teacher_user_id)
);

create index idx_class_teachers_teacher on public.class_teachers(teacher_user_id);
create index idx_class_teachers_class on public.class_teachers(class_id);

-- 班级 ↔ 学生（family_members 里的孩子成员）
create table public.class_students (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  child_member_id uuid not null references public.family_members(id) on delete cascade,
  created_at timestamptz default now(),
  unique(class_id, child_member_id)
);

create index idx_class_students_class on public.class_students(class_id);
create index idx_class_students_child on public.class_students(child_member_id);

-- ------------------------------------------------------------
-- 5. Row Level Security
-- ------------------------------------------------------------
alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.reward_accounts enable row level security;
alter table public.reward_transactions enable row level security;
alter table public.reward_templates enable row level security;
alter table public.reward_items enable row level security;
alter table public.tasks enable row level security;
alter table public.task_submissions enable row level security;
alter table public.wrong_questions enable row level security;
alter table public.classes enable row level security;
alter table public.class_teachers enable row level security;
alter table public.class_students enable row level security;

-- 辅助函数：当前用户所属的 family_id
create or replace function public.get_user_family_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select fm.family_id
  from public.family_members fm
  where fm.user_id = auth.uid()
  limit 1;
$$;

-- families
create policy "read family" on public.families for select
  using (id = public.get_user_family_id());
create policy "update family" on public.families for update
  using (id = public.get_user_family_id());

-- family_members
create policy "read members" on public.family_members for select
  using (family_id = public.get_user_family_id());
create policy "insert members" on public.family_members for insert
  with check (family_id = public.get_user_family_id());
create policy "update members" on public.family_members for update
  using (family_id = public.get_user_family_id());

-- reward_accounts
create policy "read accounts" on public.reward_accounts for select
  using (child_member_id in (
    select id from public.family_members where family_id = public.get_user_family_id()
  ));

-- reward_transactions
create policy "read transactions" on public.reward_transactions for select
  using (account_id in (
    select ra.id from public.reward_accounts ra
    where ra.child_member_id in (
      select fm.id from public.family_members fm
      where fm.family_id = public.get_user_family_id()
    )
  ));
create policy "insert transactions" on public.reward_transactions for insert
  with check (
    account_id in (
      select ra.id from public.reward_accounts ra
      where ra.child_member_id in (
        select fm.id from public.family_members fm
        where fm.family_id = public.get_user_family_id()
      )
    )
    and member_id in (
      select id from public.family_members where family_id = public.get_user_family_id()
    )
  );

-- tasks
create policy "read tasks" on public.tasks for select
  using (family_id = public.get_user_family_id());
create policy "insert tasks" on public.tasks for insert
  with check (family_id = public.get_user_family_id());
create policy "update tasks" on public.tasks for update
  using (family_id = public.get_user_family_id());
create policy "delete tasks" on public.tasks for delete
  using (family_id = public.get_user_family_id());

-- task_submissions
create policy "read submissions" on public.task_submissions for select
  using (task_id in (select id from public.tasks where family_id = public.get_user_family_id()));
create policy "insert submissions" on public.task_submissions for insert
  with check (task_id in (select id from public.tasks where family_id = public.get_user_family_id()));
create policy "update submissions" on public.task_submissions for update
  using (task_id in (select id from public.tasks where family_id = public.get_user_family_id()));

-- reward_templates / reward_items
create policy "read templates" on public.reward_templates for select
  using (family_id = public.get_user_family_id());
create policy "write templates" on public.reward_templates for all
  using (family_id = public.get_user_family_id())
  with check (family_id = public.get_user_family_id());
create policy "read items" on public.reward_items for select
  using (family_id = public.get_user_family_id());
create policy "write items" on public.reward_items for all
  using (family_id = public.get_user_family_id())
  with check (family_id = public.get_user_family_id());

-- wrong_questions
create policy "read wrong" on public.wrong_questions for select
  using (family_id = public.get_user_family_id());
create policy "write wrong" on public.wrong_questions for all
  using (family_id = public.get_user_family_id())
  with check (family_id = public.get_user_family_id());

-- ======= 班级系统 RLS =======
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
create policy "teachers read their classes" on public.classes for select
  using (id in (select public.get_my_class_ids()));
create policy "parents read joined classes" on public.classes for select
  using (id in (
    select cs.class_id from public.class_students cs
    join public.family_members fm on fm.id = cs.child_member_id
    where fm.family_id = public.get_user_family_id()
  ));
create policy "creator inserts class" on public.classes for insert
  with check (created_by = auth.uid());
create policy "creator updates class" on public.classes for update
  using (created_by = auth.uid());

-- class_teachers：共管老师可见同班老师；老师可自加入/自退出；建班者可移除他人
create policy "teachers read co-teachers" on public.class_teachers for select
  using (class_id in (select public.get_my_class_ids()));
create policy "teacher adds self" on public.class_teachers for insert
  with check (teacher_user_id = auth.uid());
create policy "teacher removes self" on public.class_teachers for delete
  using (teacher_user_id = auth.uid());
create policy "creator removes co-teacher" on public.class_teachers for delete
  using (class_id in (select id from public.classes where created_by = auth.uid()));

-- class_students：共管老师可读；家长可读/删自己孩子的行
-- （写入只经 security definer RPC join_class_as_parent，防止家长把别人家孩子塞进班）
create policy "teachers read class students" on public.class_students for select
  using (class_id in (select public.get_my_class_ids()));
create policy "parents read own children links" on public.class_students for select
  using (child_member_id in (
    select id from public.family_members where family_id = public.get_user_family_id()
  ));
create policy "parents remove own children" on public.class_students for delete
  using (child_member_id in (
    select id from public.family_members where family_id = public.get_user_family_id()
  ));

-- family_members：老师能看到共管班里的孩子
create policy "teacher sees class students" on public.family_members for select
  using (
    id in (
      select cs.child_member_id from public.class_students cs
      where cs.class_id in (select public.get_my_class_ids())
    )
  );

-- reward_accounts：老师能读共管班孩子的账户
create policy "teacher reads class accounts" on public.reward_accounts for select
  using (
    child_member_id in (
      select cs.child_member_id from public.class_students cs
      where cs.class_id in (select public.get_my_class_ids())
    )
  );

-- reward_transactions：老师能读共管班孩子的流水
create policy "teacher reads class txns" on public.reward_transactions for select
  using (
    member_id in (
      select cs.child_member_id from public.class_students cs
      where cs.class_id in (select public.get_my_class_ids())
    )
  );

-- tasks：老师能读/写共管班孩子所在家庭的任务（布置任务需要 insert）
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
-- 6. 触发器函数
-- ------------------------------------------------------------

-- 6a. 注册时按 role 分支：家长建家（或凭家庭码以家长身份加入已有家庭）、孩子用邀请码加入
--     老师不再是独立数据库角色：is_teacher 存于 user_metadata；
--     老师进家庭 = 以 parent 成员进入（注册时填家庭邀请码即可）
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

-- 6b. 孩子成员创建时自动开通小红花账户
create or replace function public.create_reward_account_for_child()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.role = 'child' then
    insert into public.reward_accounts (child_member_id)
    values (NEW.id)
    on conflict (child_member_id) do nothing;
  end if;
  return NEW;
end;
$$;

create trigger on_child_member_created
  after insert on public.family_members
  for each row execute function public.create_reward_account_for_child();

-- 6c. 流水写入后自动更新账户余额
create or replace function public.update_account_after_transaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    update public.reward_accounts
    set
      total_points = total_points + NEW.points,
      lifetime_points = lifetime_points + NEW.points,
      daily_points_earned = case when NEW.points > 0 then daily_points_earned + NEW.points else daily_points_earned end,
      daily_points_spent = case when NEW.points < 0 then daily_points_spent + abs(NEW.points) else daily_points_spent end,
      updated_at = now()
    where id = NEW.account_id;
  end if;
  return NEW;
end;
$$;

drop trigger if exists on_reward_transaction_insert on public.reward_transactions;
create trigger on_reward_transaction_insert
  after insert on public.reward_transactions
  for each row execute function public.update_account_after_transaction();

-- 6c. 任务确认后自动加分（积分 = 基础分 × 倍率，倍率在创建任务时已设好）
create or replace function public.on_task_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
  v_member_id uuid;
  v_points integer;
begin
  if NEW.status = 'confirmed' and OLD.status != 'confirmed' then
    -- NEW 就是被更新的任务行，直接取字段即可
    v_points := NEW.points_reward * NEW.points_multiplier;
    v_member_id := NEW.child_member_id;  -- fm.id 就是 child_member_id，无需查表

    select id into v_account_id
    from public.reward_accounts
    where child_member_id = NEW.child_member_id;

    if v_account_id is not null then
      insert into public.reward_transactions
        (account_id, member_id, points, reason, dimension, source, source_id, created_by)
      values
        (v_account_id, v_member_id, v_points, NEW.title, NEW.dimension, 'task', NEW.id, NEW.confirmed_by);
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists on_task_confirm_update on public.tasks;
create trigger on_task_confirm_update
  after update on public.tasks
  for each row execute function public.on_task_confirmed();
