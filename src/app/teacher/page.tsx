// Cloudflare Pages 部署：动态服务端页面必须跑在 edge runtime
export const runtime = "edge";

import { createClient } from "@/lib/supabase/server";
import TeacherDashboard from "./TeacherDashboard";
import EnableTeacherButton from "./EnableTeacherButton";
import type {
  ClassRoom,
  FamilyMember,
  RewardAccount,
  Task,
  RewardTransaction,
  RewardTemplate,
} from "@/types";

type Kid = FamilyMember & { account: RewardAccount | null };

const EMPTY_UUID = "00000000-0000-0000-0000-000000000000";

export default async function TeacherPage() {
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

    // 老师身份 = user_metadata.is_teacher 开关
    if (user.user_metadata?.is_teacher !== true) {
      return (
        <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
          <div className="text-center max-w-sm bg-white rounded-2xl border border-gray-100 p-8">
            <div className="text-5xl mb-4">👩‍🏫</div>
            <h2 className="font-bold text-gray-700 mb-2">开通老师身份</h2>
            <p className="text-gray-500 text-sm mb-5">
              开通后可以创建班级、邀请学生、和其他老师共管、布置任务
            </p>
            <EnableTeacherButton />
          </div>
        </main>
      );
    }

    // 我共管的班级（多老师共管：class_teachers N:N）
    const { data: myLinks } = await supabase
      .from("class_teachers")
      .select(`class_id`)
      .eq("teacher_user_id", user.id);

    const classIds = [...new Set((myLinks || []).map((l: any) => l.class_id as string))];

    // 是否属于某个家庭（决定老师端是否显示"家庭端"入口；默认注册都会建家，老账号可能没有）
    const { data: myMemberRow } = await supabase
      .from("family_members")
      .select(`id`)
      .eq("user_id", user.id)
      .maybeSingle();
    const hasFamily = !!myMemberRow;

    // 没有班级 → 空态由 Dashboard 展示建班/加入引导
    if (classIds.length === 0) {
      return (
        <TeacherDashboard
          classes={[]}
          studentsByClass={{}}
          tasks={[]}
          transactions={[]}
          templates={[]}
          currentUserId={user.id}
          hasFamily={hasFamily}
        />
      );
    }

    // 班级信息 + 学生关联（并行）
    const [{ data: classList }, { data: studentLinks }] = await Promise.all([
      supabase.from("classes").select(`*`).in("id", classIds).order("created_at"),
      supabase.from("class_students").select(`*`).in("class_id", classIds),
    ]);

    const childIds = [...new Set((studentLinks || []).map((l: any) => l.child_member_id as string))];

    // 查学生的 member 行（RLS 只放行共管班的孩子）
    const { data: childMembers } = childIds.length
      ? await supabase.from("family_members").select(`*`).in("id", childIds)
      : { data: [] };

    const members = (childMembers || []) as FamilyMember[];
    const familyIds = [...new Set(members.map((m) => m.family_id))];

    // 并行查：tasks（按学生所在家庭）、templates、accounts、transactions
    const [{ data: taskList }, { data: templates }, { data: accList }, { data: txns }] =
      await Promise.all([
        supabase
          .from("tasks")
          .select(`*`)
          .in("family_id", familyIds.length ? familyIds : [EMPTY_UUID])
          .order("created_at", { ascending: false })
          .limit(50),
        supabase.from("reward_templates").select(`*`).eq("is_active", true).order("sort_order"),
        supabase
          .from("reward_accounts")
          .select(`*`)
          .in("child_member_id", childIds.length ? childIds : [EMPTY_UUID]),
        supabase
          .from("reward_transactions")
          .select(`*`)
          .in("member_id", childIds.length ? childIds : [EMPTY_UUID])
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

    const accounts = (accList || []) as RewardAccount[];

    // 组装学生对象（带账户），并按班级分组
    const kidMap = new Map<string, Kid>();
    members.forEach((m) => {
      if (m.role === "child") {
        kidMap.set(m.id, { ...m, account: accounts.find((a) => a.child_member_id === m.id) || null });
      }
    });

    const studentsByClass: Record<string, Kid[]> = {};
    (studentLinks || []).forEach((l: any) => {
      const kid = kidMap.get(l.child_member_id);
      if (kid) {
        (studentsByClass[l.class_id] ||= []).push(kid);
      }
    });

    return (
      <TeacherDashboard
        classes={(classList || []) as ClassRoom[]}
        studentsByClass={studentsByClass}
        tasks={(taskList || []) as Task[]}
        transactions={(txns || []) as RewardTransaction[]}
        templates={(templates || []) as RewardTemplate[]}
        currentUserId={user.id}
        hasFamily={hasFamily}
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
