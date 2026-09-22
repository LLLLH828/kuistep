// Cloudflare Pages 部署：动态服务端页面必须跑在 edge runtime
export const runtime = "edge";

import { createClient } from "@/lib/supabase/server";
import { validateConfig } from "@/lib/supabase/config";
import ParentDashboard from "./ParentDashboard";
import type {
  FamilyMember,
  RewardAccount,
  Task,
  RewardTransaction,
  RewardTemplate,
} from "@/types";

export default async function ParentPage() {
  const t0 = Date.now();

  // 检查 Supabase 是否配置好
  const { ok, missing } = validateConfig();
  if (!ok) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <div className="text-6xl mb-4">⚙️</div>
          <h1 className="text-2xl font-bold text-indigo-600 mb-4">跬步 正在初始化</h1>
          <p className="text-gray-600 mb-4">
            请在 <code className="bg-gray-100 px-2 py-0.5 rounded">.env.local</code> 中填入 Supabase 配置：
          </p>
          <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-left text-sm overflow-x-auto">
{`NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx`}
          </pre>
          <p className="text-gray-500 text-sm mt-4">
            缺少: {missing.join(", ")}
          </p>
        </div>
      </main>
    );
  }

  const supabase = createClient();

  try {
    const t1 = Date.now();

    // 用 getSession() 读本地 cookie JWT —— 零网络 RTT（middleware 已用 getUser() 兜底校验过）
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) {
      return (
        <main className="min-h-screen flex items-center justify-center p-6">
          <p className="text-gray-500">请先登录</p>
        </main>
      );
    }

    const t2 = Date.now();

    // 查出当前用户的 parent 行拿 family_id（唯一的串行依赖，后续全部并行）
    const { data: members } = await supabase
      .from("family_members")
      .select(`*, family:families(*)`)
      .eq("user_id", user.id)
      .single();

    if (!members) {
      return (
        <main className="min-h-screen flex items-center justify-center p-6">
          <div className="text-center">
            <div className="text-4xl mb-2">🏠</div>
            <p className="text-gray-500">找不到你的家庭信息</p>
            <p className="text-gray-400 text-sm mt-2">这可能是因为数据库还没有初始化，请先在 Supabase SQL Editor 执行 schema.sql</p>
          </div>
        </main>
      );
    }

    const familyId = members.family_id;
    const t3 = Date.now();

    // 第一次并行：children / tasks / templates —— 都只需要 family_id
    const [
      { data: children },
      { data: tasks },
      { data: templates },
    ] = await Promise.all([
      supabase
        .from("family_members")
        .select(`*`)
        .eq("family_id", familyId)
        .eq("role", "child")
        .order("nickname"),
      supabase
        .from("tasks")
        .select(`*`)
        .eq("family_id", familyId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("reward_templates")
        .select(`*`)
        .eq("family_id", familyId)
        .eq("is_active", true)
        .order("sort_order"),
    ]);

    const t4 = Date.now();
    const childIds = (children || []).map((c) => c.id);

    // 第二次并行：accounts / transactions —— 需要 childIds（从 children 结果来）
    const [
      { data: accounts },
      { data: transactions },
    ] = await Promise.all([
      supabase
        .from("reward_accounts")
        .select(`*`)
        .in("child_member_id", childIds.length ? childIds : ["00000000-0000-0000-0000-000000000000"]),
      supabase
        .from("reward_transactions")
        .select(`*`)
        .in("member_id", childIds.length ? childIds : ["00000000-0000-0000-0000-000000000000"])
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    const t5 = Date.now();

    const accountMap = new Map();
    (accounts || []).forEach((a: any) => accountMap.set(a.child_member_id, a));
    const childrenWithAccount = (children || []).map((c: any) => ({
      ...c,
      account: accountMap.get(c.id) || null,
    })) as (FamilyMember & { account: RewardAccount | null })[];

    // 兜底：没有 reward_account 的孩子，并行创建（数据库触发器本该自动做，这里只是保险）
    const missingChildren = childrenWithAccount.filter((c) => !c.account);
    if (missingChildren.length > 0) {
      const insResults = await Promise.all(
        missingChildren.map((c) =>
          supabase.from("reward_accounts").insert({ child_member_id: c.id }).select().single()
        )
      );
      insResults.forEach((r, i) => {
        if (r.data) missingChildren[i].account = r.data as RewardAccount;
      });
    }

    const t6 = Date.now();
    const timingStr = `getSession=${t2 - t1}ms,parent=${t3 - t2}ms,batch1=${t4 - t3}ms,batch2=${t5 - t4}ms,fill=${t6 - t5}ms,total=${t6 - t0}ms`;
    console.log(`[SSR-timing] ${timingStr}`);

    return (
      <ParentDashboard
        familyId={familyId}
        kids={childrenWithAccount}
        tasks={(tasks || []) as Task[]}
        transactions={(transactions || []) as RewardTransaction[]}
        templates={(templates || []) as RewardTemplate[]}
        currentUserId={members.id}
        userNickname={members.nickname || ""}
        ssrTiming={timingStr}
        ssrTotalMs={t6 - t0}
      />
    );
  } catch (err: any) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <div className="text-4xl mb-2">😵</div>
          <h2 className="font-bold text-gray-700 mb-2">加载出错了</h2>
          <p className="text-gray-500 text-sm">{err.message}</p>
          <p className="text-gray-400 text-xs mt-4">
            如果是 RLS 或表不存在的错误，请在 Supabase SQL Editor 执行 supabase/schema.sql
          </p>
        </div>
      </main>
    );
  }
}
