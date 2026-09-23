-- migration_008_family_approval.sql
-- 家庭加入审核流程：凭家庭邀请码注册 → 创建待审核请求（不再直接加入）
-- 需要家庭主家长审核通过后才真正加入

-- 1. 创建 family_join_requests 表
create table if not exists public.family_join_requests (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  requester_user_id uuid not null,  -- auth.users.id（不加 FK 避免触发器顺序问题）
  requester_email text,
  requester_nickname text not null,
  role text not null default 'parent',  -- parent | child
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid  -- 审核人 user_id
);

create index if not exists idx_fjr_family_pending on public.family_join_requests(family_id) where status = 'pending';
create index if not exists idx_fjr_user on public.family_join_requests(requester_user_id);

-- 2. RLS
alter table public.family_join_requests enable row level security;

-- 家长能看自己家庭的请求
create or replace policy "read own family requests"
  on public.family_join_requests for select
  using (
    family_id in (
      select fm.family_id from public.family_members fm
      where fm.user_id = auth.uid() and fm.role = 'parent'
    )
  );

-- 用户能看自己的请求
create or replace policy "read own requests"
  on public.family_join_requests for select
  using (requester_user_id = auth.uid());

-- 3. approve_family_join RPC（security definer，绕过 RLS 写入 family_members）
create or replace function public.approve_family_join(p_request_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.family_join_requests%rowtype;
  v_exists int;
begin
  -- 查请求
  select * into v_req from public.family_join_requests where id = p_request_id and status = 'pending';
  if not found then
    return 'NOT_FOUND';
  end if;

  -- 权限检查：调用者必须是该家庭的家长
  select 1 into v_exists
  from public.family_members
  where family_id = v_req.family_id and user_id = auth.uid() and role = 'parent'
  limit 1;
  if v_exists is null then
    return 'FORBIDDEN';
  end if;

  -- 检查是否已在家庭中（防止重复加入）
  select 1 into v_exists
  from public.family_members
  where family_id = v_req.family_id and user_id = v_req.requester_user_id
  limit 1;
  if v_exists is not null then
    update public.family_join_requests set status = 'approved', reviewed_at = now(), reviewed_by = auth.uid()
    where id = p_request_id;
    return 'ALREADY_MEMBER';
  end if;

  -- 加入家庭
  insert into public.family_members (family_id, user_id, role, nickname, is_primary)
  values (v_req.family_id, v_req.requester_user_id, v_req.role, v_req.requester_nickname, false);

  -- 更新请求状态
  update public.family_join_requests
  set status = 'approved', reviewed_at = now(), reviewed_by = auth.uid()
  where id = p_request_id;

  return 'OK';
end;
$$;

-- 4. reject_family_join RPC
create or replace function public.reject_family_join(p_request_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.family_join_requests%rowtype;
  v_exists int;
begin
  select * into v_req from public.family_join_requests where id = p_request_id and status = 'pending';
  if not found then
    return 'NOT_FOUND';
  end if;

  -- 权限检查
  select 1 into v_exists
  from public.family_members
  where family_id = v_req.family_id and user_id = auth.uid() and role = 'parent'
  limit 1;
  if v_exists is null then
    return 'FORBIDDEN';
  end if;

  update public.family_join_requests
  set status = 'rejected', reviewed_at = now(), reviewed_by = auth.uid()
  where id = p_request_id;

  return 'OK';
end;
$$;

-- 5. 修改 handle_new_user trigger：凭家庭码注册 → 创建待审核请求（不再直接加入）
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
      -- 凭家庭邀请码以家长身份申请加入已有家庭 → 创建待审核请求
      select id into v_family_id from public.families where invite_code = v_invite;
      if v_family_id is null then
        raise exception '无效的家庭邀请码: %', v_invite;
      end if;

      -- 不再直接 insert family_members，改为创建待审核请求
      insert into public.family_join_requests (family_id, requester_user_id, requester_email, requester_nickname, role, status)
      values (v_family_id, NEW.id, NEW.email, v_nick, 'parent', 'pending');
    else
      -- 创建新家庭（不变）
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
        (v_family_id, 'zhi', '作业拖拉', -2, true, 3),
        (v_family_id, 'ti', '运动30分钟', 2, false, 1),
        (v_family_id, 'ti', '主动锻炼', 1, false, 2),
        (v_family_id, 'ti', '久坐不动', -1, true, 3),
        (v_family_id, 'mei', '画画/手工', 2, false, 1),
        (v_family_id, 'mei', '主动唱歌', 1, false, 2),
        (v_family_id, 'mei', '乱涂乱画', -1, true, 3),
        (v_family_id, 'lao', '做家务', 2, false, 1),
        (v_family_id, 'lao', '整理房间', 1, false, 2),
        (v_family_id, 'lao', '不愿劳动', -1, true, 3);
    end if;

  -- ======= 孩子 =======
  elsif v_role = 'child' then
    if v_invite is not null then
      -- 孩子凭家庭码注册 → 也创建待审核请求
      select id into v_family_id from public.families where invite_code = v_invite;
      if v_family_id is null then
        raise exception '无效的家庭邀请码: %', v_invite;
      end if;

      insert into public.family_join_requests (family_id, requester_user_id, requester_email, requester_nickname, role, status)
      values (v_family_id, NEW.id, NEW.email, v_nick, 'child', 'pending');
    else
      raise exception '孩子注册必须提供家庭邀请码';
    end if;
  end if;

  return NEW;
end;
$$;
