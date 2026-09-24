-- migration_011: 兑奖系统（结算端 MVP）
-- 原则：家长扣家庭分（scope='family'），老师扣学校分（scope='school'），相互独立，不做统一结算
-- 兑换 = 1 条 redemptions 记录 + 1 条负分 reward_transactions（on_txn_change 触发器自动更新 total_points）
-- 孩子端"申请兑换"流程留待后续；本期为家长/老师直接结算

-- ------------------------------------------------------------
-- 1. 奖池物品
-- ------------------------------------------------------------
create table if not exists public.reward_items (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'family' check (scope in ('family','school')),
  family_id uuid references public.families(id) on delete cascade,  -- scope=family 必填
  class_id uuid references public.classes(id) on delete cascade,    -- scope=school 可选（MVP 先按老师个人管理）
  created_by uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  points_required int not null check (points_required > 0),
  category text not null default 'material' check (category in ('material','non-material')),
  image_url text,
  stock int,                              -- null = 不限量
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_reward_items_scope on public.reward_items(scope);
create index if not exists idx_reward_items_family on public.reward_items(family_id);

-- ------------------------------------------------------------
-- 2. 兑换记录
-- ------------------------------------------------------------
create table if not exists public.redemptions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.reward_items(id) on delete cascade,
  child_member_id uuid not null references public.family_members(id) on delete cascade,
  scope text not null default 'family' check (scope in ('family','school')),
  points_spent int not null check (points_spent > 0),
  status text not null default 'fulfilled' check (status in ('pending','fulfilled','cancelled')),
  note text,
  created_by uuid not null references auth.users(id) on delete cascade,  -- 结算人
  created_at timestamptz not null default now(),
  fulfilled_by uuid references auth.users(id),
  fulfilled_at timestamptz
);

create index if not exists idx_redemptions_child on public.redemptions(child_member_id);
create index if not exists idx_redemptions_item on public.redemptions(item_id);

alter table public.reward_items enable row level security;
alter table public.redemptions enable row level security;

-- ------------------------------------------------------------
-- 3. RLS
-- ------------------------------------------------------------
-- 奖池物品：家长管自家奖池（family）
drop policy if exists "family items managed by parents" on public.reward_items;
create policy "family items managed by parents" on public.reward_items for all
  using (scope = 'family' and family_id = public.get_user_family_id())
  with check (scope = 'family' and family_id = public.get_user_family_id());

-- 奖池物品：老师管理自己创建的学校奖池（school）
drop policy if exists "school items managed by creator" on public.reward_items;
create policy "school items managed by creator" on public.reward_items for all
  using (scope = 'school' and created_by = auth.uid())
  with check (scope = 'school' and created_by = auth.uid());

-- 奖池物品：家长可只读学校奖池（交叉只读）
drop policy if exists "school items readable by parents" on public.reward_items;
create policy "school items readable by parents" on public.reward_items for select
  using (scope = 'school');

-- 兑换记录：家长读写自家孩子的家庭兑换
drop policy if exists "family redemptions managed by parents" on public.redemptions;
create policy "family redemptions managed by parents" on public.redemptions for all
  using (scope = 'family' and child_member_id in (select public.get_my_child_member_ids()))
  with check (scope = 'family' and child_member_id in (select public.get_my_child_member_ids()));

-- 兑换记录：老师读写自己结算的学校兑换
drop policy if exists "school redemptions managed by creator" on public.redemptions;
create policy "school redemptions managed by creator" on public.redemptions for all
  using (scope = 'school' and created_by = auth.uid())
  with check (scope = 'school' and created_by = auth.uid());

-- ------------------------------------------------------------
-- 4. 兑换 RPC（原子：校验余额 → 记 redemption → 插负分流水触发器扣总分）
-- ------------------------------------------------------------
create or replace function public.redeem_reward(
  p_item_id uuid,
  p_child_member_id uuid,
  p_note text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.reward_items%rowtype;
  v_member public.family_members%rowtype;
  v_account public.reward_accounts%rowtype;
  v_scope text;
  v_uid uuid := auth.uid();
  v_redemption_id uuid;
begin
  if v_uid is null then
    raise exception '未登录';
  end if;

  select * into v_item from reward_items where id = p_item_id and is_active;
  if not found then
    raise exception '奖品不存在或已下架';
  end if;
  v_scope := v_item.scope;

  select * into v_member from family_members where id = p_child_member_id;
  if not found then
    raise exception '孩子不存在';
  end if;

  -- 权限：家长只能结算自家孩子的家庭奖品；老师只能结算自己奖池的学校奖品
  if v_scope = 'family' then
    if v_member.family_id is distinct from public.get_user_family_id() then
      raise exception '只能给自家孩子兑换家庭奖品';
    end if;
  else
    if v_item.created_by is distinct from v_uid then
      raise exception '只有奖池创建老师可以结算学校奖品';
    end if;
    if v_member.id not in (select public.get_my_student_member_ids()) then
      raise exception '该孩子不在你任教的班级里';
    end if;
  end if;

  select * into v_account from reward_accounts where child_member_id = p_child_member_id;
  if not found then
    raise exception '孩子积分账户不存在';
  end if;
  if v_account.total_points < v_item.points_required then
    raise exception '% 的总分（% 分）不足，兑换需要 % 分',
      v_member.nickname, v_account.total_points, v_item.points_required;
  end if;

  insert into redemptions (
    item_id, child_member_id, scope, points_spent,
    status, note, created_by, fulfilled_by, fulfilled_at
  ) values (
    v_item.id, p_child_member_id, v_scope, v_item.points_required,
    'fulfilled', p_note, v_uid, v_uid, now()
  ) returning id into v_redemption_id;

  -- 负分流水：触发器 on_txn_change 自动扣减 reward_accounts.total_points
  insert into reward_transactions (
    account_id, member_id, points, reason, dimension,
    source, source_id, scope, created_by
  ) values (
    v_account.id, p_child_member_id, -v_item.points_required,
    '兑换：' || v_item.name, 'custom',
    'redemption', v_redemption_id, v_scope, v_uid
  );

  return json_build_object(
    'redemption_id', v_redemption_id,
    'points_spent', v_item.points_required,
    'scope', v_scope
  );
end;
$$;

grant execute on function public.redeem_reward(uuid, uuid, text) to authenticated;
