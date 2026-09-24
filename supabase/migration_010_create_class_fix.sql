-- migration_010: 修复老师新建班级失败
-- 根因：insert(...).select().single() 在插入 classes 后立刻查回新行，
-- 但 "teachers read their classes" 策略只认 class_teachers 关联（get_my_class_ids()），
-- 老师此时尚未挂到 class_teachers（第二步才插入），RLS 隐藏新行 → select 回 0 行 → 报错。
-- 修复：select 策略补充 created_by = auth.uid()（建班者永远能看到自己建的班）。

-- 1. 修复 classes 的 select 策略
drop policy if exists "teachers read their classes" on public.classes;
create policy "teachers read their classes" on public.classes for select
  using (
    id in (select public.get_my_class_ids())
    or created_by = auth.uid()
  );

-- 2. 自愈：把之前"建了班但没挂上老师"的孤儿班级补上 class_teachers 关联
insert into public.class_teachers (class_id, teacher_user_id)
select c.id, c.created_by
from public.classes c
where not exists (
  select 1 from public.class_teachers ct
  where ct.class_id = c.id and ct.teacher_user_id = c.created_by
)
on conflict do nothing;
