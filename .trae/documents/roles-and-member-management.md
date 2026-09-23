# 实现计划（同邮箱+后缀方案）

## 账号模型
- 一个家庭可共用一个主邮箱
- 家长主账号：`parent@xx.com` → role=parent
- 家长为孩子创建：`parent+朵朵@xx.com` → role=child，**家长可设密码**
- 家长为老师创建：`parent+李老师@xx.com` → role=teacher，**家长可设密码**
- 后缀格式：主邮箱 `user@domain` → 成员邮箱 `user+${成员昵称}@domain`（自动生成）

## 要做的事

### 第一批（UI/前端改动）
1. **登录角色识别** — 登录后根据 family_members.role 跳转 /parent /kid /teacher
2. **成员管理改造** — SettingsMenu "添加孩子" → "成员管理"
   - 展示家庭邀请码 + 复制
   - 成员列表（角色 + 邮箱 + 绑定状态）
   - **新增"为成员创建账号"按钮** → 弹窗输入密码（或自动用家长密码）→ 调 Supabase signUp 创建后缀邮箱账号
3. **DayDetailModal 双 tab** — 积分/任务切换
4. **Calendar 周/日视图双分类** — 积分/任务切换

### 第二批（DB + 后端）
5. **Schema 变更** — role CHECK 加 teacher，handle_new_user 分支
6. **Teacher 路由** — /teacher 页面 + TeacherDashboard
7. **Middleware** — 按 role 保护路由

## 改动文件
- `src/types/index.ts` — role 加 teacher
- `src/app/login/page.tsx` — 登录后按 role 分流
- `src/middleware.ts` — 角色路由保护
- `src/app/parent/page.tsx` — 传全部成员 + 邀请码
- `src/app/parent/ParentDashboard.tsx` — 成员管理 + DayDetailModal 双 tab + 为成员创建账号
- `src/components/Calendar.tsx` — 周/日视图双分类
- `src/app/teacher/page.tsx` + `TeacherDashboard.tsx`（新建）
- `supabase/schema.sql` + migration — role CHECK + 触发器

## 关键实现：为成员创建账号
```
用户点击"为朵朵创建账号"
→ 自动生成邮箱：parent+朵朵@xx.com（从 parent 的 session.user.email 解析）
→ 弹窗让家长设密码
→ supabase.auth.signUp({ email: suffixEmail, password })
→ 自动关联到 family：handle_new_user 触发器
   - 检查 metadata 里的 invite_code 或创建方式
   - 匹配到当前 family 里的 offline child → UPDATE user_id
   - 或新建 family_member 行
```
