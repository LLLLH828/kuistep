# 班级制角色架构重构计划

## Context（背景与目标）

用户给出了最终角色架构图并明确：**孩子关联的是班级（而不是老师），老师若要关联家庭，应以"类似家长"的方式进入**。上一版 `teacher_students`（老师直接关联孩子）模型废弃。

用户已确认的决策：
1. **多老师共管**：一个班级可有多个老师（class_teachers 关联表）
2. **本轮不做学校实体**：老师直接创建班级
3. **老师身份新模型**：注册默认是家长（自动建家庭），可勾选"我也是老师"；也可以登录后在设置里开通老师身份 → 老师身份 = `user_metadata.is_teacher` 开关，不再是独立角色
4. **实测数据库状态**：migration_004 从未执行（`teachers`/`teacher_students` 表不存在，通过线上反代 REST 探测确认），可干净重建

新架构数据流：
```
家庭: family_members (parent / child)          老师: class_teachers ── classes
                    │                                （多对多）        │
                    └──── 孩子(child member) ──── class_students ──────┘
                                                    （孩子加入班级）
老师进家庭 = 自己就是某个家庭的 parent 成员（注册默认建家 / 注册时填家庭码加入）
```

## 数据模型（新）

```sql
classes          (id, name, invite_code 8位, created_by, created_at)
class_teachers   (class_id, teacher_user_id, unique(class_id, teacher_user_id))  -- 多老师共管
class_students   (class_id, child_member_id → family_members.id, unique(...))    -- 孩子进班
```
- `teachers` / `teacher_students` 表删除，不再需要
- 老师身份 = `auth.users.raw_user_meta_data.is_teacher = true`（开关），`metadata.role` 只剩 `parent | child`
- 老师加入别人的班 = 凭班级邀请码把自己写进 `class_teachers`（共管）

## 文件改动清单

### 1. `supabase/schema.sql`（规范化全量 schema）
- **4b 节**：删除 teachers/set_teacher_invite_code/teacher_students，替换为三张新表 + `set_class_invite_code()` 触发器（8 位码，沿用 md5 随机写法）
- **RLS 节**：删除"老师相关 RLS"整段，替换为新段（见下方 RLS 设计）
- **handle_new_user()**：重写为两分支——
  - `parent`（默认）：若 metadata 带 `invite_code` → 以 parent 成员加入该已有家庭（不建家、不建模板）；否则建新家庭 + 模板（现状逻辑）
  - `child`：按家庭邀请码加入 + 离线孩子绑定（现状逻辑保留）
  - 删除整个 teacher 分支（is_teacher 只是 metadata，无需 DB 动作）

### 2. `supabase/migration_004_class_model.sql`（新文件，删除旧 `migration_004_teacher_students.sql`）
幂等迁移脚本（drop if exists 开路，兼容任何历史状态）：
1. 清理：drop 旧 teacher 相关 policies（family_members/reward_accounts/reward_transactions/tasks 上的 4 条）→ drop teacher_students/teachers 表
2. 建三张新表 + 邀请码触发器 + 索引 + RLS policies
3. 两个 security definer RPC（见下）
4. `create or replace handle_new_user()` + 重建 `on_auth_user_created` 触发器

### 3. `src/types/index.ts`
- 删 `Teacher` / `TeacherStudent`
- 增 `ClassRoom` / `ClassTeacher` / `ClassStudent`
- `UserRole` 改为 `'parent' | 'child'`；`ROLE_LABELS` 同步（teacher 标签在需要处用字面量"老师"）

### 4. `src/app/login/page.tsx`
- 身份选择：三格改两格（👨‍👩‍👧 家长·默认 / 🧒 孩子·需家庭码）
- role=parent 时显示复选框 **"我也是老师（可创建班级）"** → metadata 追加 `is_teacher: true`
- 删除 `teacherCode` / `teacherNoFamily` 状态与相关 UI
- 注册成功跳转：child → /kid，parent（含老师）→ /parent

### 5. `src/middleware.ts`
- role 判定：`'child'` 走 /kid，其余视为 parent
- `/teacher`：要求 `user_metadata.is_teacher === true`，否则 redirect /parent
- `/parent`：拦 child；`/login` 已登录跳转逻辑同步

### 6. `src/app/teacher/page.tsx`（重写，保持 edge runtime）
- 无 session → 提示登录；`is_teacher` 不为真 → 渲染"开通老师身份"引导卡（内嵌小客户端组件 `EnableTeacherButton`：`supabase.auth.updateUser({ data: { is_teacher: true } })` 后 `router.refresh()`）
- 有老师身份：`class_teachers`(teacher_user_id=me) → classIds → `classes` → `class_students` → childIds（去重）→ `family_members`(in id) → familyIds → 并行查 tasks/accounts/transactions/templates（沿用现有并行模式）
- 组装 `classes` + `studentsByClass: Record<classId, Kid[]>` 传给 Dashboard；无班级时同样传空让前端展示建班引导

### 7. `src/app/teacher/TeacherDashboard.tsx`（重写）
- 顶栏：👩‍🏫 老师 · 班级切换（横滑，多班）· ＋建班 · （是家长成员时显示"🏠家庭端"链接）· 退出
- 班级卡：班级邀请码大字+复制 · 加入班级入口（输码调 RPC `join_class_as_teacher` 成为共管老师）· 学生 chips 横滑（选中者看日历，默认第一个）
- 建班弹窗：输入班名 → insert `classes{name}` + insert `class_teachers{class_id, teacher_user_id}`（RLS 放行自建自加）→ router.refresh()
- 无班级空态：建班表单 + 输码加入
- 复用 `Calendar`（选中学生）与 `CreateTaskModal`（kids=当前班学生，selectedChildIds 默认当前选中或全班）

### 8. `src/app/parent/ParentDashboard.tsx`
- Props 增 `isTeacher: boolean`
- SettingsMenu：`isTeacher` ? 显示"👩‍🏫 老师端"链接 : 显示"开通老师身份"按钮（`updateUser({data:{is_teacher:true}})` → refresh）
- MemberManageModal 段4 "关联老师" → **"加入班级"**：
  - 输入班级邀请码(8位) + 多选孩子 → RPC `join_class_as_parent`
  - 下方展示已加入班级列表（查 `class_students`（孩子范围）+ `classes` 名称映射），每条带"退出班级"（delete `class_students` 行）
- 邀请码卡片文案更新："孩子注册时填入可加入家庭；老师也可用它以家长身份加入"

### 9. `src/app/parent/page.tsx`
- 传 `isTeacher={user.user_metadata?.is_teacher === true}`（一行改动）

### 10. 不改的文件
- `CreateTaskModal.tsx`（多选孩子逻辑直接复用）
- `/kid` 孩子端、`Calendar`、积分相关全部不动

## RLS 设计要点（关键坑）

1. **递归坑**：`class_teachers` 的 policy 子查询再查 `class_teachers` 会触发 PG 无限递归 → 建 security definer 函数 `get_my_class_ids() returns setof uuid`，所有老师侧 policy 统一用它：
   ```sql
   create policy "teacher reads classes" on public.classes for select
     using (id in (select public.get_my_class_ids()));
   ```
2. **家长按码进班不能裸 select classes**（会泄露全表班名/码）→ 两个 security definer RPC：
   - `join_class_as_parent(p_code, p_child_member_ids[])`：校验码存在 + 每个孩子都属于 `get_user_family_id()` 的家庭且 role='child' → insert class_students（on conflict do nothing）→ 返回班名或错误标记
   - `join_class_as_teacher(p_code)`：校验码存在 → insert class_teachers(auth.uid()) → 返回班名
3. 家长读 `class_students`（自己孩子的行，用于展示/退出班级）与读已加入 `classes`（via class_students join 自己家庭的孩子）各一条 select policy；家长可 delete 自己孩子的 class_students 行
4. 老师 insert 班级（created_by = auth.uid()）、insert 自己的 class_teachers 行、读共管班 class_students
5. 老师看学生数据：`family_members` / `reward_accounts` / `reward_transactions` / `tasks` 各加 select policy（用 get_my_class_ids() 关联 class_students）；**新增老师 insert tasks policy**（family_id ∈ 学生所在家庭，CreateTaskModal 需要）

## 验证

1. `npx tsc --noEmit` 通过
2. 用户在 Supabase SQL Editor 执行 `supabase/migration_004_class_model.sql`（已确认旧 004 未执行，直接跑即可）
3. 端到端手测清单（push 部署后）：
   - 注册默认家长 → 建家成功；勾选"我也是老师"→ ⚙ 出现"老师端"
   - 未勾选老师的家长在 ⚙ 点"开通老师身份"→ 出现老师端入口
   - 老师端建班"三年二班" → 得 8 位班级码
   - 家长 ⚙→成员管理→加入班级：输码+选孩子 → 成功；老师端看到学生
   - 第二位老师输同码加入 → 共管可见
   - 老师给学生布置任务 → 家长端任务列表可见
   - 老师注册时填某家庭邀请码 → 以家长成员进入该家庭，可访问家庭端
