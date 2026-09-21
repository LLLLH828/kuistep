// Cloudflare Pages 部署：动态服务端页面必须跑在 edge runtime
export const runtime = "edge";

import { createClient } from "@/lib/supabase/server";
import { validateConfig } from "@/lib/supabase/config";
import KidHome from "./KidHome";
import type { FamilyMember, RewardAccount, Task } from "@/types";

export default async function KidPage() {
  const { ok, missing } = validateConfig();
  if (!ok) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center">
          <div className="text-6xl mb-4">⚙️</div>
          <h1 className="text-xl font-bold text-purple-600 mb-4">跬步 正在初始化</h1>
          <p className="text-gray-500 text-sm">请先配置 .env.local 中的 Supabase</p>
          <p className="text-gray-400 text-xs mt-2">缺少: {missing.join(", ")}</p>
        </div>
      </main>
    );
  }

  const supabase = createClient();

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return (
        <main className="min-h-screen flex items-center justify-center p-6">
          <p className="text-gray-500">请先登录</p>
        </main>
      );
    }

    const { data: member } = await supabase
      .from("family_members")
      .select("*, family:families(*)")
      .eq("user_id", user.id)
      .single();

    if (!member) {
      return (
        <main className="min-h-screen flex items-center justify-center p-6">
          <div className="text-center">
            <div className="text-4xl mb-2">🏠</div>
            <p className="text-gray-500">找不到家庭信息</p>
          </div>
        </main>
      );
    }

    // 如果当前用户是家长，展示选择孩子界面
    if (member.role === "parent") {
      const { data: children } = await supabase
        .from("family_members")
        .select("*, reward_accounts(*)")
        .eq("family_id", member.family_id)
        .eq("role", "child");

      for (const c of children || []) {
        if (!c.reward_accounts?.[0]) {
          await supabase.from("reward_accounts").insert({ child_member_id: c.id });
        }
      }

      return (
        <KidSelector
          kids={(children || []).map((c: any) => ({
            ...c,
            account: c.reward_accounts?.[0] || null,
          }))}
        />
      );
    }

    // 孩子角色
    let { data: account } = await supabase
      .from("reward_accounts")
      .select("*")
      .eq("child_member_id", member.id)
      .single();

    if (!account) {
      await supabase.from("reward_accounts").insert({ child_member_id: member.id });
      const { data: newAccount } = await supabase
        .from("reward_accounts")
        .select("*")
        .eq("child_member_id", member.id)
        .single();
      account = newAccount;
    }

    if (!account) {
      return (
        <main className="min-h-screen flex items-center justify-center p-6">
          <div className="text-center">
            <div className="text-4xl mb-2">🌸</div>
            <p className="text-gray-500">小红花账户初始化失败</p>
          </div>
        </main>
      );
    }

    const { data: tasks } = await supabase
      .from("tasks")
      .select("*")
      .eq("child_member_id", member.id)
      .neq("status", "confirmed")
      .order("due_date", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: false });

    return (
      <KidHome
        childMember={member as unknown as FamilyMember}
        account={account as RewardAccount}
        tasks={(tasks || []) as Task[]}
      />
    );
  } catch (err: any) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center">
          <div className="text-4xl mb-2">😵</div>
          <h2 className="font-bold text-gray-700 mb-2">加载出错了</h2>
          <p className="text-gray-500 text-sm">{err.message}</p>
        </div>
      </main>
    );
  }
}

function KidSelector({
  kids,
}: {
  kids: (FamilyMember & { account: RewardAccount | null })[];
}) {
  if (kids.length === 0) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center">
          <div className="text-6xl mb-4">👧👦</div>
          <p className="text-gray-500">还没有添加孩子，请让家长先添加</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="space-y-3 w-full max-w-sm">
        <h1 className="text-center text-2xl font-bold text-purple-600 mb-6">
          选择谁的界面
        </h1>
        {kids.map((child) => (
          <div key={child.id} className="card text-center py-6">
            <div className="text-4xl mb-2">🌸</div>
            <div className="font-semibold text-lg">{child.nickname}</div>
            <div className="text-gray-500 text-sm">
              共 {child.account?.total_points || 0} 朵小红花
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
