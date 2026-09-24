"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Calendar from "@/components/Calendar";
import DimensionQuickAdd from "@/components/DimensionQuickAdd";
import RewardManageModal from "@/components/RewardManageModal";
import CreateTaskModal from "@/app/parent/CreateTaskModal";
import type {
  ClassRoom,
  FamilyMember,
  RewardAccount,
  Task,
  RewardTransaction,
  RewardTemplate,
  Dimension,
} from "@/types";

type Kid = FamilyMember & { account: RewardAccount | null };

interface Props {
  classes: ClassRoom[];
  studentsByClass: Record<string, Kid[]>;
  tasks: Task[];
  transactions: RewardTransaction[];
  templates: RewardTemplate[];
  currentUserId: string;
  hasFamily: boolean;
}

export default function TeacherDashboard({
  classes,
  studentsByClass,
  tasks: initialTasks,
  transactions: initialTxns,
  templates,
  currentUserId,
  hasFamily,
}: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [activeClassId, setActiveClassId] = useState<string | null>(
    classes[0]?.id || null
  );
  const [activeChildId, setActiveChildId] = useState<string | null>(null);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showClassModal, setShowClassModal] = useState(false);
  const [showRedeem, setShowRedeem] = useState(false);
  const [tasks, setTasks] = useState(initialTasks);
  const [txns, setTxns] = useState(initialTxns);
  const [copied, setCopied] = useState(false);

  // 建班 / 加入班级
  const [newClassName, setNewClassName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => setTasks(initialTasks), [initialTasks]);
  useEffect(() => setTxns(initialTxns), [initialTxns]);

  const activeClass = classes.find((c) => c.id === activeClassId) || classes[0] || null;
  const students = activeClass ? studentsByClass[activeClass.id] || [] : [];
  // 选中的学生（班级切换后自动回退到第一个）
  const activeKid =
    students.find((s) => s.id === activeChildId) || students[0] || null;
  const childTxns = activeKid ? txns.filter((t) => t.member_id === activeKid.id) : [];

  const copyCode = async () => {
    if (!activeClass) return;
    try {
      await navigator.clipboard.writeText(activeClass.invite_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  // 老师给学校加分（scope='school'，RLS 老师 insert policy 只允许写 scope='school'）
  const handleDimQuickAdd = async (
    dim: Dimension,
    points: number,
    reason: string
  ) => {
    if (!activeKid?.account) {
      alert("孩子没有小红花账户");
      return;
    }
    const { error } = await supabase.from("reward_transactions").insert({
      account_id: activeKid.account.id,
      member_id: activeKid.id,
      points,
      reason,
      dimension: dim,
      source: "quick",
      scope: "school",
      created_by: currentUserId,
    });
    if (error) {
      alert(`加分失败：${error.message}`);
      return;
    }
    router.refresh();
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  // 创建班级：建 classes 行 + 把自己写进 class_teachers
  const handleCreateClass = async () => {
    const name = newClassName.trim();
    if (!name) return;
    setBusy("create");
    const { data, error } = await supabase
      .from("classes")
      .insert({ name, created_by: currentUserId })
      .select()
      .single();
    if (error || !data) {
      setBusy(null);
      alert(`创建失败：${error?.message || "未知错误"}`);
      return;
    }
    const { error: linkError } = await supabase
      .from("class_teachers")
      .insert({ class_id: data.id, teacher_user_id: currentUserId });
    setBusy(null);
    if (linkError) {
      alert(`班级已创建，但加入失败：${linkError.message}`);
      return;
    }
    setNewClassName("");
    setShowClassModal(false);
    router.refresh();
  };

  // 凭班级邀请码加入（成为共管老师）
  const handleJoinClass = async () => {
    const code = joinCode.trim();
    if (!code) return;
    setBusy("join");
    const { data, error } = await supabase.rpc("join_class_as_teacher", {
      p_code: code,
    });
    setBusy(null);
    if (error) {
      alert(`加入失败：${error.message}`);
      return;
    }
    if (data === "CLASS_NOT_FOUND") {
      alert("无效的班级邀请码");
      return;
    }
    setJoinCode("");
    setShowClassModal(false);
    alert(`已加入班级「${data}」（共管）`);
    router.refresh();
  };

  return (
    <main className="min-h-screen bg-gray-50 pb-8">
      {/* 顶部导航：老师 · 班级切换 · 建班/加入 · 家庭端 · 退出 */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-30">
        <div className="max-w-lg mx-auto px-3 py-2 flex items-center gap-2">
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-xl">👩‍🏫</span>
            <span className="font-bold text-indigo-600 text-sm">老师</span>
          </div>
          <div className="w-px h-4 bg-gray-200 flex-shrink-0" />

          <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {classes.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveClassId(c.id)}
                className={`flex-shrink-0 px-2.5 py-1 rounded-lg text-[12px] font-medium transition whitespace-nowrap ${
                  activeClass?.id === c.id
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "bg-gray-50 text-gray-600 border border-gray-200"
                }`}
              >
                🏫 {c.name}
                <span className="ml-0.5 opacity-70">
                  {(studentsByClass[c.id] || []).length}
                </span>
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowClassModal(true)}
            title="创建班级 / 凭邀请码加入"
            className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-600 text-sm flex items-center justify-center flex-shrink-0 hover:bg-indigo-100"
          >
            ＋
          </button>
          {hasFamily && (
            <button
              onClick={() => router.push("/parent")}
              title="进入家庭端"
              className="text-[14px] flex-shrink-0"
            >
              🏠
            </button>
          )}
          <button
            onClick={handleSignOut}
            className="text-[12px] text-gray-400 hover:text-gray-600 flex-shrink-0"
          >
            退出
          </button>
        </div>
      </header>

      {/* 主区域 */}
      <div className="max-w-lg mx-auto px-3 py-3 space-y-3">
        {activeClass ? (
          <>
            {/* 班级邀请码卡片 */}
            <div className="bg-amber-50 rounded-2xl p-3 border border-amber-100">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-amber-600 text-xs font-medium">
                  {activeClass.name} · 班级邀请码
                </span>
                <button
                  onClick={copyCode}
                  className="text-[10px] text-amber-500 hover:text-amber-700"
                >
                  {copied ? "✓ 已复制" : "复制"}
                </button>
              </div>
              <div className="font-mono text-lg font-bold text-amber-700 tracking-widest">
                {activeClass.invite_code}
              </div>
              <p className="text-[10px] text-amber-500 mt-1">
                家长输入此码把孩子加进班；其他老师输入此码可共管本班
              </p>
            </div>

            {activeKid ? (
              <>
                {/* 学生切换 chips */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                  <span className="flex-shrink-0 text-[11px] text-gray-400">
                    学生({students.length})
                  </span>
                  {students.map((child) => (
                    <button
                      key={child.id}
                      onClick={() => setActiveChildId(child.id)}
                      className={`flex-shrink-0 px-2.5 py-1 rounded-lg text-[12px] font-medium transition whitespace-nowrap ${
                        activeKid.id === child.id
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "bg-white text-gray-600 border border-gray-200"
                      }`}
                    >
                      {child.nickname || "孩子"}
                      {child.account && (
                        <span className="ml-0.5 opacity-80">🌸{child.account.total_points}</span>
                      )}
                    </button>
                  ))}
                </div>

                {/* 月历 */}
                <Calendar
                  child={activeKid}
                  txns={childTxns}
                  tasks={tasks}
                  onOpenDay={() => { /* 老师端暂不弹每日详情 */ }}
                />

                {/* 快速加分（学校来源，scope='school'） */}
                <DimensionQuickAdd
                  childId={activeKid.id}
                  txns={childTxns}
                  onAdd={handleDimQuickAdd}
                />

                {/* 兑换管理入口（学校奖池，老师结算扣学校分；无班级时随面板一起隐藏） */}
                <button
                  onClick={() => setShowRedeem(true)}
                  className="w-full bg-white rounded-2xl border border-gray-100 p-3 flex items-center justify-between hover:bg-pink-50 hover:border-pink-200 transition"
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                    <span>🎁</span> 兑换管理 · 学校奖池
                  </span>
                  <span className="text-xs text-gray-400">老师结算扣学校分 ›</span>
                </button>

                {/* 快速布置任务 */}
                <div className="bg-white rounded-2xl border border-gray-100 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-gray-700 text-sm">
                      📋 给 {activeClass.name} 布置任务
                    </h3>
                    <button
                      onClick={() => setShowCreateTask(true)}
                      className="bg-indigo-600 text-white px-3 py-1 rounded-lg text-xs font-medium hover:bg-indigo-700"
                    >
                      + 新任务
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    默认指派给 {activeKid.nickname || "当前学生"}，弹窗里可多选其他学生
                  </p>
                </div>
              </>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 text-center py-10">
                <div className="text-4xl mb-2">🪑</div>
                <p className="text-gray-500">班级还没有学生</p>
                <p className="text-gray-400 text-sm mt-1">
                  把上面的班级邀请码发给学生家长，即可把孩子加进班
                </p>
              </div>
            )}
          </>
        ) : (
          /* 无班级空态 */
          <div className="bg-white rounded-2xl border border-gray-100 text-center py-12">
            <div className="text-4xl mb-2">🏫</div>
            <p className="text-gray-500">还没有班级</p>
            <p className="text-gray-400 text-sm mt-1 mb-4">
              创建一个班级，或用邀请码加入其他老师的班级共管
            </p>
            <button
              onClick={() => setShowClassModal(true)}
              className="bg-indigo-600 text-white px-5 py-2 rounded-xl text-sm font-medium hover:bg-indigo-700"
            >
              ＋ 建班 / 加入班级
            </button>
          </div>
        )}
      </div>

      {/* 建班 / 加入班级弹窗 */}
      {showClassModal && (
        <div
          className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50"
          onClick={() => setShowClassModal(false)}
        >
          <div
            className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg text-gray-800">🏫 建班 / 加入班级</h3>
              <button
                onClick={() => setShowClassModal(false)}
                className="text-gray-300 hover:text-gray-500 text-xl px-1"
              >
                ✕
              </button>
            </div>

            {/* 创建新班级 */}
            <label className="block text-xs text-gray-500 mb-1.5">创建新班级</label>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={newClassName}
                onChange={(e) => setNewClassName(e.target.value)}
                placeholder="班级名称，如：三年二班"
                className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-200 text-sm"
                maxLength={20}
              />
              <button
                onClick={handleCreateClass}
                disabled={!newClassName.trim() || busy === "create"}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm flex-shrink-0 disabled:opacity-50"
              >
                {busy === "create" ? "创建中..." : "创建"}
              </button>
            </div>

            <div className="flex items-center gap-2 mb-4">
              <div className="flex-1 h-px bg-gray-100" />
              <span className="text-[10px] text-gray-300">或</span>
              <div className="flex-1 h-px bg-gray-100" />
            </div>

            {/* 凭码加入共管 */}
            <label className="block text-xs text-gray-500 mb-1.5">
              凭班级邀请码加入（成为共管老师）
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="8 位班级码"
                className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-200 text-sm tracking-widest uppercase"
                maxLength={8}
              />
              <button
                onClick={handleJoinClass}
                disabled={!joinCode.trim() || busy === "join"}
                className="px-4 py-2 rounded-lg bg-gray-700 text-white text-sm flex-shrink-0 disabled:opacity-50"
              >
                {busy === "join" ? "加入中..." : "加入"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 兑换管理弹窗（学校奖池） */}
      {showRedeem && activeClass && (
        <RewardManageModal
          scope="school"
          currentUserId={currentUserId}
          childrenList={students}
          onClose={() => setShowRedeem(false)}
          onDone={() => router.refresh()}
        />
      )}

      {/* 创建任务弹窗 */}
      {showCreateTask && activeClass && students.length > 0 && (
        <CreateTaskModal
          familyId={activeKid?.family_id || students[0].family_id}
          kids={students}
          selectedChildIds={activeKid ? [activeKid.id] : []}
          currentUserId={currentUserId}
          templates={templates}
          scope="school"
          onClose={() => setShowCreateTask(false)}
          onCreated={() => {
            setShowCreateTask(false);
            router.refresh();
          }}
        />
      )}
    </main>
  );
}
