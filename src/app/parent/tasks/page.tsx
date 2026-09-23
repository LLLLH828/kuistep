// Cloudflare Pages 部署：动态服务端页面必须跑在 edge runtime
export const runtime = "edge";

import { createClient } from "@/lib/supabase/server";
import { validateConfig } from "@/lib/supabase/config";
import TasksClient from "../TasksClient";
import LogoutButton from "@/components/LogoutButton";
import type {
  FamilyMember,
  RewardAccount,
  Task,
  RewardTemplate,
} from "@/types";

export default async function ParentTasksPage() {
  const { ok } = validateConfig();
  if (!ok) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <p className="text-gray-500">系统正在初始化</p>
      </main>
    );
  }

  const supabase = createClient();

  try {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) {
      return (
        <main className="min-h-screen flex items-center justify-center p-6">
          <p className="text-gray-500">请先登录</p>
        </main>
      );
    }

    const { data: members } = await supabase
      .from("family_members")
      .select(`*, family:families(*)`)
      .eq("user_id", user.id)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!members) {
      return (
        <main className="min-h-screen flex items-center justify-center p-6">
          <div className="text-center max-w-md">
            <div className="text-4xl mb-2">🏠</div>
            <p className="text-gray-500">找不到你的家庭信息</p>
            <div className="mt-4">
              <LogoutButton />
            </div>
          </div>
        </main>
      );
    }

    const familyId = members.family_id;

    const { data: allMembers } = await supabase
      .from("family_members")
      .select(`*`)
      .eq("family_id", familyId)
      .order("role")
      .order("nickname");

    const children = (allMembers || []).filter((m) => m.role === "child");
    const childIds = children.map((c) => c.id);

    const [
      { data: tasks },
      { data: templates },
      { data: accounts },
    ] = await Promise.all([
      supabase
        .from("tasks")
        .select(`*`)
        .eq("family_id", familyId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("reward_templates")
        .select(`*`)
        .eq("family_id", familyId)
        .eq("is_active", true)
        .order("sort_order"),
      supabase
        .from("reward_accounts")
        .select(`*`)
        .in("child_member_id", childIds.length ? childIds : ["00000000-0000-0000-0000-000000000000"]),
    ]);

    const accountMap = new Map(
      (accounts || []).map((a: any) => [a.child_member_id, a])
    );
    const childrenWithAccount = children.map((c: any) => ({
      ...c,
      account: accountMap.get(c.id) || null,
    })) as (FamilyMember & { account: RewardAccount | null })[];

    return (
      <TasksClient
        familyId={familyId}
        kids={childrenWithAccount}
        initialTasks={(tasks || []) as Task[]}
        templates={(templates || []) as RewardTemplate[]}
        currentUserId={members.id}
      />
    );
  } catch (err: any) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <div className="text-4xl mb-2">😵</div>
          <h2 className="font-bold text-gray-700 mb-2">加载出错了</h2>
          <p className="text-gray-500 text-sm">{err.message}</p>
        </div>
      </main>
    );
  }
}
