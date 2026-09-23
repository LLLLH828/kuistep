-- migration_009_protect_parent.sql
-- 防止误删：家庭至少保留一位家长（UI 已隐藏自己的删除按钮，这里是数据库兜底）
-- 可重复执行

create or replace function prevent_last_parent_delete()
returns trigger as $$
declare
  parent_count int;
begin
  if old.role = 'parent' then
    select count(*) into parent_count
    from family_members
    where family_id = old.family_id and role = 'parent';
    if parent_count <= 1 then
      raise exception '家庭至少需要保留一位家长，不能删除';
    end if;
  end if;
  return old;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_prevent_last_parent_delete on family_members;
create trigger trg_prevent_last_parent_delete
  before delete on family_members
  for each row execute function prevent_last_parent_delete();
