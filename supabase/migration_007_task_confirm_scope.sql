-- ============================================================
-- Migration 007: on_task_confirmed 触发器 补 scope 字段
-- 任务确认后自动加分时，reward_transactions.scope 应继承任务的 scope
-- 家庭任务 → scope='family'；学校任务 → scope='school'
-- 幂等：可重复执行（create or replace）
-- ============================================================

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
    v_points := NEW.points_reward * NEW.points_multiplier;
    v_member_id := NEW.child_member_id;

    select id into v_account_id
    from public.reward_accounts
    where child_member_id = NEW.child_member_id;

    if v_account_id is not null then
      insert into public.reward_transactions
        (account_id, member_id, points, reason, dimension, source, source_id, created_by, scope)
      values
        (v_account_id, v_member_id, v_points, NEW.title, NEW.dimension, 'task', NEW.id, NEW.confirmed_by, coalesce(NEW.scope, 'family'));
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists on_task_confirm_update on public.tasks;
create trigger on_task_confirm_update
  after update on public.tasks
  for each row execute function public.on_task_confirmed();
