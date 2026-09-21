-- ============================================================
-- 迁移 002：两条线模型（任务线 + 表现线）
-- 在 Supabase SQL Editor 执行
-- ============================================================

-- 1. reward_templates 加分类字段（用于快速操作分组展示）
-- 分类参考真实家庭积分表：学习习惯/学习科目/学习成绩/生活习惯/性格培养
alter table public.reward_templates
  add column if not exists category text not null default '其他';

-- 2. tasks 加重复规则 + 加分项关联
-- recurrence: once=一次性 / daily=每日 / weekly=每周 / monthly=每月
alter table public.tasks
  add column if not exists recurrence text not null default 'once';
-- 任务可关联一个加分项模板，确认完成时按模板分值自动加分
alter table public.tasks
  add column if not exists template_id uuid references public.reward_templates(id) on delete set null;

-- 3. 替换默认模板为参考表内容（清空本家庭旧模板，重新导入）
-- 注意：只删模板，不动已有流水
delete from public.reward_templates;

-- ========== 加分项 ==========
-- 学习习惯（智）
insert into public.reward_templates (family_id, dimension, category, item_name, points, is_decrease, sort_order)
select f.id, v.dim::public.evaluation_dimension, v.cat, v.name, v.pts, false, v.ord
from public.families f, (values
  ('zhi','学习习惯','认真完成各科作业',2,1),
  ('zhi','学习习惯','复习今日所学内容',2,2),
  ('zhi','学习习惯','预习明日要学课程',3,3),
  ('zhi','学习习惯','每日练字15分钟',2,4),
  ('ti','学习习惯','坐姿、握笔姿势标准',2,5),
  ('zhi','学习习惯','课外书阅读30分钟',5,6),
  ('zhi','学习习惯','学习不无故离开座位',5,7),
  ('zhi','学习科目','口算题50道',2,10),
  ('zhi','学习科目','阅读理解1篇',3,11),
  ('zhi','学习科目','看图写话1篇',5,12),
  ('zhi','学习科目','听力1篇',5,13),
  ('zhi','学习科目','摘抄好词好句30个',3,14),
  ('zhi','学习成绩','单元测试95分以上',2,20),
  ('zhi','学习成绩','获得学校的奖状',3,21),
  ('zhi','学习成绩','课堂听写默写满分',5,22),
  ('de','学习成绩','被老师表扬',5,23),
  ('de','性格培养','一天不发脾气',3,30),
  ('de','性格培养','主动和认识的人打招呼',2,31),
  ('de','性格培养','公共场合不大声喧哗',2,32),
  ('de','性格培养','尊敬长辈，不顶嘴',3,33),
  ('zhi','性格培养','遇到难题想办法解决',5,34),
  ('de','性格培养','遇到问题不哭',5,35),
  ('ti','生活习惯','主动洗漱',2,40),
  ('lao','生活习惯','整理书包、课桌',1,41),
  ('ti','生活习惯','吃饭认真、不挑食',1,42),
  ('ti','生活习惯','吃饭不超过20分钟',1,43),
  ('ti','生活习惯','按时睡觉、起床',2,44),
  ('lao','生活习惯','主动做家务',2,45),
  ('de','生活习惯','照顾弟弟/妹妹',2,46),
  ('ti','生活习惯','每日运动30分钟',3,47)
) as v(dim,cat,name,pts,ord);

-- ========== 减分项 ==========
insert into public.reward_templates (family_id, dimension, category, item_name, points, is_decrease, sort_order)
select f.id, v.dim::public.evaluation_dimension, v.cat, v.name, v.pts, true, v.ord
from public.families f, (values
  ('zhi','学习习惯','不认真完成各科作业',-5,50),
  ('zhi','学习习惯','没有复习今日所学',-1,51),
  ('zhi','学习习惯','没有预习明日课程',-2,52),
  ('zhi','学习习惯','没有进行每日练字',-1,53),
  ('ti','学习习惯','坐姿、握笔不标准',-2,54),
  ('zhi','学习习惯','没有进行课外书阅读',-2,55),
  ('zhi','学习习惯','做作业好动、不认真',-5,56),
  ('lao','生活习惯','不主动洗漱',-2,60),
  ('lao','生活习惯','不主动整理书包、课桌',-1,61),
  ('ti','生活习惯','吃饭不认真、挑食',-2,62),
  ('ti','生活习惯','吃饭超过30分钟',-1,63),
  ('ti','生活习惯','睡觉、起床拖拉磨蹭',-1,64),
  ('lao','生活习惯','乱扔东西、垃圾',-3,65),
  ('zhi','学习成绩','单元测试85分以下',-3,70),
  ('zhi','学习成绩','单元测试70分以下',-5,71),
  ('zhi','学习成绩','单元测试不及格',-10,72),
  ('de','学习成绩','被老师点名批评',-10,73),
  ('de','学习成绩','差，老师找家长',-15,74),
  ('de','性格培养','乱发脾气',-3,80),
  ('de','性格培养','和长辈顶嘴',-5,81),
  ('de','性格培养','说脏话',-5,82),
  ('de','性格培养','无故哭闹',-3,83),
  ('de','性格培养','撒谎，屡教不改',-10,84)
) as v(dim,cat,name,pts,ord);
