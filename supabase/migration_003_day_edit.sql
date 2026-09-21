-- ============================================================
-- 迁移 003：每日明细编辑（流水 update/delete + 余额自动同步）
-- 幂等版，可反复执行
-- ============================================================

-- 1. 流水的 update / delete 权限（与 read/insert 同款家庭隔离规则）
drop policy if exists "update transactions" on public.reward_transactions;
create policy "update transactions" on public.reward_transactions for update
  using (
    account_id in (
      select ra.id from public.reward_accounts ra
      where ra.child_member_id in (
        select fm.id from public.family_members fm
        where fm.family_id = public.get_user_family_id()
      )
    )
  )
  with check (
    account_id in (
      select ra.id from public.reward_accounts ra
      where ra.child_member_id in (
        select fm.id from public.family_members fm
        where fm.family_id = public.get_user_family_id()
      )
    )
  );

drop policy if exists "delete transactions" on public.reward_transactions;
create policy "delete transactions" on public.reward_transactions for delete
  using (
    account_id in (
      select ra.id from public.reward_accounts ra
      where ra.child_member_id in (
        select fm.id from public.family_members fm
        where fm.family_id = public.get_user_family_id()
      )
    )
  );

-- 2. 余额同步触发器：编辑/删除流水时，自动修正 reward_accounts 的总分
create or replace function public.sync_account_on_tx_update()
returns trigger as $$
begin
  update public.reward_accounts
  set
    total_points = total_points - OLD.points + NEW.points,
    lifetime_points = lifetime_points - OLD.points + NEW.points,
    updated_at = now()
  where id = NEW.account_id;
  return NEW;
end;
$$ language plpgsql security definer;

create or replace function public.sync_account_on_tx_delete()
returns trigger as $$
begin
  update public.reward_accounts
  set
    total_points = total_points - OLD.points,
    lifetime_points = lifetime_points - OLD.points,
    updated_at = now()
  where id = OLD.account_id;
  return OLD;
end;
$$ language plpgsql security definer;

drop trigger if exists on_tx_updated on public.reward_transactions;
create trigger on_tx_updated
  after update on public.reward_transactions
  for each row execute function public.sync_account_on_tx_update();

drop trigger if exists on_tx_deleted on public.reward_transactions;
create trigger on_tx_deleted
  after delete on public.reward_transactions
  for each row execute function public.sync_account_on_tx_delete();
