"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type {
  FamilyMember,
  RewardAccount,
  Task,
  RewardTransaction,
  RewardTemplate,
  Dimension,
} from "@/types";
import { DIMENSION_LABELS } from "@/types";
import Calendar from "@/components/Calendar";
import DimensionQuickAdd from "@/components/DimensionQuickAdd";
import CreateTaskModal from "./CreateTaskModal";

interface Props {
  familyId: string;
  inviteCode: string;
  allMembers: FamilyMember[];  // 全家成员（parent + child）
  kids: (FamilyMember & { account: RewardAccount | null })[];
  tasks: Task[];
  transactions: RewardTransaction[];
  templates: RewardTemplate[];
  currentUserId: string;
  userNickname: string;
  isTeacher: boolean;  // user_metadata.is_teacher 开关
}

export default function ParentDashboard({
  familyId,
  inviteCode,
  allMembers,
  kids,
  tasks: initialTasks,
  transactions: initialTxns,
  templates,
  currentUserId,
  userNickname,
  isTeacher,
}: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [activeChildId, setActiveChildId] = useState<string | null>(
    kids[0]?.id || null
  );
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showMemberManage, setShowMemberManage] = useState(false);
  const [showTemplateEdit, setShowTemplateEdit] = useState(false);
  const [showTaskPanel, setShowTaskPanel] = useState(false);
  const [tasks, setTasks] = useState(initialTasks);
  const [txns, setTxns] = useState(initialTxns);
  const [dayDetail, setDayDetail] = useState<string | null>(null);

  useEffect(() => setTasks(initialTasks), [initialTasks]);
  useEffect(() => setTxns(initialTxns), [initialTxns]);

  const activeChild = kids.find((c) => c.id === activeChildId);

  const handleConfirmTask = async (task: Task) => {
    const { error } = await supabase
      .from("tasks")
      .update({ status: "confirmed", confirmed_by: currentUserId })
      .eq("id", task.id);
    if (!error) {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id ? { ...t, status: "confirmed" as const } : t
        )
      );
      router.refresh();
    }
  };

  const handleDeleteTask = async (task: Task) => {
    if (!confirm("确定删除这个任务？")) return;
    const { error } = await supabase.from("tasks").delete().eq("id", task.id);
    if (!error) {
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
    }
  };

  // 5 维直接加分（不经过模板）
  const handleDimQuickAdd = async (
    dim: Dimension,
    points: number,
    reason: string
  ) => {
    const child = kids.find((c) => c.id === activeChildId);
    if (!child?.account) {
      alert("孩子没有小红花账户");
      return;
    }
    const { error } = await supabase.from("reward_transactions").insert({
      account_id: child.account.id,
      member_id: child.id,
      points,
      reason,
      dimension: dim,
      source: "quick",
      created_by: currentUserId,
    });
    if (error) {
      alert(`加分失败：${error.message}`);
      return;
    }
    router.refresh();
  };

  const handleAddChild = async (nickname: string) => {
    const { data: newMember, error } = await supabase
      .from("family_members")
      .insert({
        family_id: familyId,
        user_id: null,
        role: "child",
        nickname,
      })
      .select()
      .single();

    if (newMember) {
      router.refresh();
    }
  };

  // 按当前活跃孩子过滤流水
  const childTxns = useMemo(
    () => txns.filter((t) => t.member_id === activeChildId),
    [txns, activeChildId]
  );

  return (
    <main className="min-h-screen bg-gray-50 pb-8">
      {/* ===== 顶部 Header（一行搞定） ===== */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-30">
        <div className="max-w-lg mx-auto px-3 py-2 flex items-center gap-2">
          {/* 左：程序名 */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-xl">🌸</span>
            <span className="font-bold text-indigo-600 text-sm">跬步</span>
          </div>

          <div className="w-px h-4 bg-gray-200 flex-shrink-0" />

          {/* 中：家庭名 + 孩子切换（可横滑） */}
          <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto pb-0.5 snap-x">
            <span className="flex-shrink-0 text-[11px] text-gray-400 mr-0.5">
              {userNickname}家
            </span>
            {kids.map((child) => (
              <button
                key={child.id}
                onClick={() => setActiveChildId(child.id)}
                className={`flex-shrink-0 snap-start px-2.5 py-1 rounded-lg text-[12px] font-medium transition whitespace-nowrap ${
                  activeChildId === child.id
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "bg-gray-50 text-gray-600 border border-gray-200"
                }`}
              >
                {child.nickname || "孩子"}
                {child.account && (
                  <span className="ml-0.5 opacity-80">🌸{child.account.total_points}</span>
                )}
              </button>
            ))}
          </div>

          {/* 右：设置 + 退出 */}
          <SettingsMenu
            isTeacher={isTeacher}
            onOpenMembers={() => setShowMemberManage(true)}
            onEditTemplates={() => setShowTemplateEdit(true)}
            onOpenTasks={() => setShowTaskPanel((v) => !v)}
            tasksActive={showTaskPanel}
          />
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              router.push("/login");
            }}
            className="text-[12px] text-gray-400 hover:text-gray-600 flex-shrink-0"
          >
            退出
          </button>
        </div>
      </header>

      {/* ===== 主区域 ===== */}
      <div className="max-w-lg mx-auto px-3 py-3 space-y-3">
        {activeChild ? (
          <>
            {/* 月度报表 - 月历 */}
            <Calendar
              child={activeChild}
              txns={childTxns}
              tasks={tasks}
              onOpenDay={setDayDetail}
            />

            {/* 5 维快速加分 */}
            <DimensionQuickAdd
              childId={activeChild.id}
              txns={childTxns}
              onAdd={handleDimQuickAdd}
            />

            {/* 任务管理面板（从⚙菜单切换显示） */}
            {showTaskPanel && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-gray-700 text-sm flex items-center gap-1.5">
                    <span>📋</span> 任务管理
                  </h3>
                  <button
                    onClick={() => setShowTaskPanel(false)}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    收起
                  </button>
                </div>
                <TasksTab
                  kids={kids}
                  tasks={tasks}
                  templates={templates}
                  onCreateTask={() => setShowCreateTask(true)}
                  activeChildId={activeChildId}
                  setActiveChildId={setActiveChildId}
                  onConfirmTask={handleConfirmTask}
                  onDeleteTask={handleDeleteTask}
                />
              </div>
            )}
          </>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 text-center py-12">
            <div className="text-4xl mb-2">👨‍👩‍👧</div>
            <p className="text-gray-500">还没有孩子，请点 ⚙ 添加</p>
          </div>
        )}
      </div>

      {/* 创建任务弹窗 */}
      {showCreateTask && kids.length > 0 && (
        <CreateTaskModal
          familyId={familyId}
          kids={kids}
          selectedChildIds={activeChild ? [activeChild.id] : [kids[0].id]}
          currentUserId={currentUserId}
          templates={templates}
          onClose={() => setShowCreateTask(false)}
          onCreated={() => {
            setShowCreateTask(false);
            router.refresh();
          }}
        />
      )}

      {/* 成员管理弹窗 */}
      {showMemberManage && (
        <MemberManageModal
          familyId={familyId}
          inviteCode={inviteCode}
          members={allMembers}
          currentUserId={currentUserId}
          onClose={() => setShowMemberManage(false)}
          onSaved={() => router.refresh()}
        />
      )}

      {/* 每日明细弹窗 */}
      {dayDetail && activeChild && (
        <DayDetailModal
          dayKey={dayDetail}
          child={activeChild}
          txns={childTxns}
          tasks={tasks}
          templates={templates}
          currentUserId={currentUserId}
          onClose={() => setDayDetail(null)}
          router={router}
          onConfirmTask={handleConfirmTask}
        />
      )}

      {/* 奖罚项编辑弹窗 */}
      {showTemplateEdit && (
        <TemplateEditModal
          familyId={familyId}
          templates={templates}
          onClose={() => setShowTemplateEdit(false)}
          onSaved={() => router.refresh()}
        />
      )}
    </main>
  );
}

/* ---------- 设置菜单 ---------- */

function SettingsMenu({
  isTeacher,
  onOpenMembers,
  onEditTemplates,
  onOpenTasks,
  tasksActive,
}: {
  isTeacher: boolean;
  onOpenMembers: () => void;
  onEditTemplates: () => void;
  onOpenTasks: () => void;
  tasksActive: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  // 开通老师身份：user_metadata.is_teacher = true（老师是可叠加的开关，不影响家长身份）
  const enableTeacher = async () => {
    setOpen(false);
    setEnabling(true);
    const { error } = await supabase.auth.updateUser({ data: { is_teacher: true } });
    setEnabling(false);
    if (error) {
      alert(`开通失败：${error.message}`);
      return;
    }
    router.refresh();
  };

  return (
    <div className="relative flex-shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-8 h-8 rounded-lg bg-gray-50 border border-gray-200 text-gray-500 hover:text-indigo-500 hover:border-indigo-300 flex items-center justify-center transition text-sm"
        title="设置"
      >
        ⚙
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-xl border border-gray-100 shadow-lg z-50 overflow-hidden text-sm">
            <button
              onClick={() => { setOpen(false); onOpenMembers(); }}
              className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2"
            >
              <span>👥</span> 成员管理
            </button>
            <button
              onClick={() => { setOpen(false); onEditTemplates(); }}
              className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2"
            >
              <span>🌸</span> 奖罚项管理
            </button>
            <button
              onClick={() => { setOpen(false); onOpenTasks(); }}
              className={`w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 ${tasksActive ? "text-indigo-600" : ""}`}
            >
              <span>📋</span> 任务管理 {tasksActive && "✓"}
            </button>
            {isTeacher ? (
              <button
                onClick={() => { setOpen(false); router.push("/teacher"); }}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 text-indigo-600"
              >
                <span>👩‍🏫</span> 老师端
              </button>
            ) : (
              <button
                onClick={enableTeacher}
                disabled={enabling}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50"
              >
                <span>👩‍🏫</span> {enabling ? "开通中..." : "开通老师身份"}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- MemberManageModal ---------- */
import { ROLE_LABELS } from "@/types";

function MemberManageModal({
  familyId,
  inviteCode,
  members,
  currentUserId,
  onClose,
  onSaved,
}: {
  familyId: string;
  inviteCode: string;
  members: FamilyMember[];
  currentUserId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = createClient();
  const [nickname, setNickname] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);

  // 加入班级
  const [classCode, setClassCode] = useState("");
  const [selectedChildIds, setSelectedChildIds] = useState<string[]>([]);
  const [joinedClasses, setJoinedClasses] = useState<
    { linkId: string; classId: string; className: string; childId: string; childName: string }[]
  >([]);

  const parents = members.filter((m) => m.role === "parent");
  const children = members.filter((m) => m.role === "child");

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const addOfflineChild = async () => {
    if (!nickname.trim()) return;
    setLoading("add");
    const { error } = await supabase.from("family_members").insert({
      family_id: familyId,
      role: "child",
      nickname: nickname.trim(),
      user_id: null,
    });
    setLoading(null);
    if (error) alert(`添加失败：${error.message}`);
    else {
      setNickname("");
      onSaved();
    }
  };

  const removeMember = async (memberId: string, nickname: string) => {
    if (!confirm(`确定移除 "${nickname}"？`)) return;
    setLoading(memberId);
    const { error } = await supabase.from("family_members").delete().eq("id", memberId);
    setLoading(null);
    if (error) alert(`删除失败：${error.message}`);
    else onSaved();
  };

  // 查孩子们已加入的班级
  const fetchJoinedClasses = async () => {
    if (children.length === 0) {
      setJoinedClasses([]);
      return;
    }
    const childIds = children.map((c) => c.id);
    const { data: links } = await supabase
      .from("class_students")
      .select(`id, class_id, child_member_id`)
      .in("child_member_id", childIds);

    if (!links || links.length === 0) {
      setJoinedClasses([]);
      return;
    }
    const classIds = [...new Set((links as any[]).map((l) => l.class_id))];
    const { data: classRows } = await supabase
      .from("classes")
      .select(`id, name`)
      .in("id", classIds);
    const nameMap = new Map((classRows || []).map((c: any) => [c.id, c.name]));
    setJoinedClasses(
      (links as any[]).map((l) => ({
        linkId: l.id,
        classId: l.class_id,
        className: nameMap.get(l.class_id) || "未知班级",
        childId: l.child_member_id,
        childName: children.find((c) => c.id === l.child_member_id)?.nickname || "孩子",
      }))
    );
  };

  useEffect(() => {
    fetchJoinedClasses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members.length]);

  // 多选孩子
  const toggleChildForClass = (childId: string) => {
    setSelectedChildIds((prev) =>
      prev.includes(childId) ? prev.filter((id) => id !== childId) : [...prev, childId]
    );
  };

  // 输入班级邀请码，把孩子加入班级（走 RPC：校验码 + 孩子归属）
  const joinClass = async () => {
    if (!classCode.trim() || selectedChildIds.length === 0) return;
    setLoading("class");
    const { data, error } = await supabase.rpc("join_class_as_parent", {
      p_code: classCode.trim(),
      p_child_member_ids: selectedChildIds,
    });
    setLoading(null);
    if (error) {
      alert(`加入失败：${error.message}`);
      return;
    }
    if (data === "CLASS_NOT_FOUND") {
      alert("无效的班级邀请码");
      return;
    }
    if (data === "CHILD_INVALID") {
      alert("有孩子不属于当前家庭，无法加入");
      return;
    }
    if (data === "NO_FAMILY") {
      alert("找不到你的家庭信息");
      return;
    }
    setClassCode("");
    setSelectedChildIds([]);
    alert(`已加入班级「${data}」`);
    fetchJoinedClasses();
  };

  // 退出班级
  const leaveClass = async (linkId: string, className: string) => {
    if (!confirm(`确定退出班级「${className}」？`)) return;
    setLoading(linkId);
    const { error } = await supabase.from("class_students").delete().eq("id", linkId);
    setLoading(null);
    if (error) alert(`退出失败：${error.message}`);
    else fetchJoinedClasses();
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg text-gray-800">👥 成员管理</h3>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500 text-xl px-1">✕</button>
        </div>

        {/* 段1：邀请码 */}
        <div className="bg-indigo-50 rounded-xl p-4 mb-4">
          <div className="text-xs text-indigo-500 font-medium mb-1">家庭邀请码</div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-2xl font-bold text-indigo-700 tracking-widest font-mono">
              {inviteCode}
            </span>
            <button
              onClick={copyCode}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700"
            >
              {copied ? "已复制" : "复制"}
            </button>
          </div>
          <p className="text-[11px] text-indigo-400 mt-2">
            把这个码给孩子或老师，他们注册时填入即可加入你的家庭
          </p>
        </div>

        {/* 段2：成员列表 */}
        <div className="space-y-3 mb-4">
          <div>
            <div className="text-xs text-gray-400 font-medium mb-2">
              家长 ({parents.length})
            </div>
            <div className="space-y-1.5">
              {parents.map((m) => (
                <MemberRow key={m.id} member={m} currentUserId={currentUserId} onRemove={(id) => removeMember(id, m.nickname || "成员")} loading={loading} />
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs text-gray-400 font-medium mb-2">
              孩子 ({children.length})
            </div>
            <div className="space-y-1.5">
              {children.length === 0 && (
                <div className="text-xs text-gray-300 text-center py-3 border border-dashed rounded-lg">
                  还没有孩子
                </div>
              )}
              {children.map((m) => (
                <MemberRow key={m.id} member={m} currentUserId={currentUserId} onRemove={(id) => removeMember(id, m.nickname || "成员")} loading={loading} />
              ))}
            </div>
          </div>
        </div>

        {/* 段3：添加离线孩子 */}
        <div className="border-t border-gray-100 pt-4 mb-4">
          <div className="text-xs text-gray-500 mb-2">
            给还没有账号的孩子先占个位置
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="小名，如：朵朵"
              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm"
              maxLength={10}
            />
            <button
              onClick={addOfflineChild}
              disabled={!nickname.trim() || loading === "add"}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm disabled:opacity-50"
            >
              + 添加
            </button>
          </div>
        </div>

        {/* 段4：加入班级 */}
        <div className="border-t border-gray-100 pt-4">
          <div className="text-xs text-gray-500 mb-2">
            加入班级（孩子通过班级关联老师，可加入多个班级）
          </div>
          <input
            type="text"
            value={classCode}
            onChange={(e) => setClassCode(e.target.value.toUpperCase())}
            placeholder="班级邀请码（8位）"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm tracking-widest uppercase mb-2"
            maxLength={8}
          />
          {children.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {children.map((c) => {
                const selected = selectedChildIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => toggleChildForClass(c.id)}
                    className={`px-2 py-1 rounded-lg text-[11px] font-medium transition border ${
                      selected
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-gray-50 text-gray-600 border-gray-200 hover:border-indigo-300"
                    }`}
                  >
                    {c.nickname || "孩子"}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-[11px] text-gray-400 mb-2">先添加孩子再加入班级</p>
          )}
          <button
            onClick={joinClass}
            disabled={!classCode.trim() || selectedChildIds.length === 0 || loading === "class"}
            className="w-full py-2 rounded-lg bg-indigo-500 text-white text-xs disabled:opacity-50"
          >
            {loading === "class" ? "加入中..." : `加入班级 · ${selectedChildIds.length} 个孩子`}
          </button>

          {/* 已加入的班级 */}
          {joinedClasses.length > 0 && (
            <div className="mt-3 space-y-1">
              <div className="text-[11px] text-gray-400">已加入的班级</div>
              {joinedClasses.map((j) => (
                <div
                  key={j.linkId}
                  className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-1.5 text-xs"
                >
                  <span className="text-gray-600 min-w-0 truncate">
                    <span className="font-medium">{j.childName}</span> · {j.className}
                  </span>
                  <button
                    onClick={() => leaveClass(j.linkId, j.className)}
                    disabled={loading === j.linkId}
                    className="text-gray-300 hover:text-red-500 ml-2 flex-shrink-0"
                    title="退出班级"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MemberRow({
  member,
  currentUserId,
  onRemove,
  loading,
}: {
  member: FamilyMember;
  currentUserId: string;
  onRemove: (id: string) => void;
  loading: string | null;
}) {
  const isSelf = member.user_id === currentUserId;
  const hasAccount = member.user_id !== null;
  return (
    <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-medium text-gray-700 truncate">
          {member.nickname || "未命名"}
        </span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${member.role === "parent" ? "bg-indigo-100 text-indigo-600" : "bg-green-100 text-green-600"}`}>
          {ROLE_LABELS[member.role]}
        </span>
        {member.is_primary && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-600">主</span>
        )}
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${hasAccount ? "bg-blue-50 text-blue-500" : "bg-gray-100 text-gray-400"}`}>
          {hasAccount ? "已登录" : "离线"}
        </span>
        {isSelf && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">我</span>
        )}
      </div>
      {!isSelf && (
        <button
          onClick={() => onRemove(member.id)}
          disabled={loading === member.id}
          className="text-gray-300 hover:text-red-500 text-xs"
          title="移除"
        >
          ✕
        </button>
      )}
    </div>
  );
}

/* ---------- DayDetailModal ---------- */

function toDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function DayDetailModal({
  dayKey,
  child,
  txns,
  tasks,
  templates,
  currentUserId,
  onClose,
  router,
  onConfirmTask,
}: {
  dayKey: string;
  child: FamilyMember & { account: RewardAccount | null };
  txns: RewardTransaction[];
  tasks: Task[];
  templates: RewardTemplate[];
  currentUserId: string;
  onClose: () => void;
  router: any;
  onConfirmTask: (t: Task) => void;
}) {
  const supabase = createClient();
  const [tab, setTab] = useState<"points" | "tasks">("points");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPoints, setEditPoints] = useState(0);
  const [editReason, setEditReason] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const dayTxns = useMemo(
    () => txns.filter((t) => toDayKey(new Date(t.created_at)) === dayKey),
    [txns, dayKey]
  );
  // 当天due的任务
  const dayTasks = useMemo(() => {
    const d = new Date(dayKey);
    return tasks.filter((t) => {
      if (t.child_member_id !== child.id) return false;
      if (!t.due_date) return false;
      const due = new Date(t.due_date);
      return due.getFullYear() === d.getFullYear() && due.getMonth() === d.getMonth() && due.getDate() === d.getDate();
    });
  }, [tasks, dayKey, child.id]);

  const net = dayTxns.reduce((s, t) => s + t.points, 0);
  const dateLabel = `${parseInt(dayKey.slice(5, 7), 10)}月${parseInt(dayKey.slice(8, 10), 10)}日`;

  const startEdit = (t: RewardTransaction) => {
    setEditingId(t.id);
    setEditPoints(t.points);
    setEditReason(t.reason);
  };

  const saveEdit = async (id: string) => {
    const { error } = await supabase
      .from("reward_transactions")
      .update({ points: editPoints, reason: editReason || "记录" })
      .eq("id", id);
    if (error) {
      alert(`保存失败：${error.message}`);
      return;
    }
    setEditingId(null);
    router.refresh();
  };

  const removeTxn = async (id: string) => {
    if (!confirm("删除这条记录？总分余额会自动扣回。")) return;
    const { error } = await supabase
      .from("reward_transactions")
      .delete()
      .eq("id", id);
    if (error) {
      alert(`删除失败：${error.message}`);
      return;
    }
    router.refresh();
  };

  const addFromTemplate = async (tplId: string) => {
    const tpl = templates.find((t) => t.id === tplId);
    if (!tpl || !child.account) {
      alert("孩子账户缺失，无法新增");
      return;
    }
    const { error } = await supabase.from("reward_transactions").insert({
      account_id: child.account.id,
      member_id: child.id,
      points: tpl.points,
      reason: tpl.item_name,
      dimension: tpl.dimension,
      source: "manual",
      created_by: currentUserId,
      created_at: `${dayKey}T12:00:00+08:00`,
    });
    if (error) {
      alert(`新增失败：${error.message}`);
      return;
    }
    setShowAdd(false);
    router.refresh();
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-bold text-lg text-gray-800">
              {dateLabel} · {child.nickname}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              当天净分
              <span className={`ml-1 font-bold ${net > 0 ? "text-green-600" : net < 0 ? "text-red-500" : "text-gray-400"}`}>
                {net > 0 ? "+" : ""}{net}
              </span>
            </p>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500 text-xl px-1">
            ✕
          </button>
        </div>

        {/* Tab 切换 */}
        <div className="flex bg-gray-100 rounded-lg p-0.5 mb-4 text-xs">
          <button
            onClick={() => setTab("points")}
            className={`flex-1 py-1.5 rounded-md font-medium transition ${
              tab === "points" ? "bg-white shadow text-indigo-600" : "text-gray-500"
            }`}
          >
            🌸 积分 ({dayTxns.length})
          </button>
          <button
            onClick={() => setTab("tasks")}
            className={`flex-1 py-1.5 rounded-md font-medium transition ${
              tab === "tasks" ? "bg-white shadow text-indigo-600" : "text-gray-500"
            }`}
          >
            📋 任务 ({dayTasks.length})
          </button>
        </div>

        {tab === "points" ? (
          <>
            {dayTxns.length === 0 && (
              <p className="text-gray-400 text-sm text-center py-6">这天还没有记录</p>
            )}
            <div className="space-y-2 mb-4">
              {dayTxns.map((t) => (
                <div key={t.id} className="bg-gray-50 rounded-xl px-3 py-2.5">
                  {editingId === t.id ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editReason}
                        onChange={(e) => setEditReason(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm"
                        placeholder="原因"
                      />
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={editPoints}
                          onChange={(e) => setEditPoints(parseInt(e.target.value, 10) || 0)}
                          className="w-24 px-3 py-1.5 rounded-lg border border-gray-200 text-sm"
                        />
                        <span className="text-xs text-gray-400">正=加分 负=减分</span>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => saveEdit(t.id)} className="flex-1 py-1.5 rounded-lg bg-indigo-600 text-white text-sm">保存</button>
                        <button onClick={() => setEditingId(null)} className="flex-1 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-sm">取消</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${t.points > 0 ? "bg-green-500" : "bg-red-500"}`} />
                        <span className="text-sm text-gray-700 truncate">{t.reason}</span>
                        {t.dimension && (
                          <span className="text-xs text-gray-400 flex-shrink-0">[{DIMENSION_LABELS[t.dimension]}]</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                        <span className={`font-mono font-semibold text-sm ${t.points > 0 ? "text-green-600" : "text-red-500"}`}>
                          {t.points > 0 ? "+" : ""}{t.points}
                        </span>
                        <button onClick={() => startEdit(t)} className="text-gray-300 hover:text-indigo-500 px-1.5 text-sm">✎</button>
                        <button onClick={() => removeTxn(t.id)} className="text-gray-300 hover:text-red-500 px-1.5 text-sm">✕</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {showAdd ? (
              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs text-gray-400 mb-2">点击模板快速添加：</p>
                <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
                  {templates.filter((t) => t.is_active).sort((a, b) => a.sort_order - b.sort_order).map((t) => (
                    <button
                      key={t.id}
                      onClick={() => addFromTemplate(t.id)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs whitespace-nowrap ${
                        t.is_decrease ? "bg-red-50 text-red-700 hover:bg-red-100" : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                      }`}
                    >
                      {t.item_name} {t.points > 0 ? "+" : ""}{t.points}
                    </button>
                  ))}
                </div>
                <button onClick={() => setShowAdd(false)} className="w-full mt-3 py-2 rounded-xl border border-gray-200 text-gray-500 text-sm">收起</button>
              </div>
            ) : (
              <button
                onClick={() => setShowAdd(true)}
                className="w-full py-2.5 rounded-xl border border-dashed border-indigo-300 text-indigo-600 text-sm hover:bg-indigo-50"
              >
                ＋ 新增记录（记到这天）
              </button>
            )}
          </>
        ) : (
          /* 任务 tab */
          <>
            {dayTasks.length === 0 && (
              <p className="text-gray-400 text-sm text-center py-6">这天没有任务</p>
            )}
            <div className="space-y-2">
              {dayTasks.map((t) => {
                const st = STATUS_LABELS[t.status] || STATUS_LABELS.pending;
                const pointsEarned = Math.round(t.points_reward * t.points_multiplier);
                return (
                  <div
                    key={t.id}
                    className={`bg-gray-50 rounded-xl px-3 py-2.5 border ${
                      t.status === "confirmed" ? "border-green-200 bg-green-50/40" : "border-gray-100"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${st.className}`}>
                            {st.text}
                          </span>
                          {t.mode === "challenge" && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600">
                              挑战
                            </span>
                          )}
                          <span className="text-[10px] text-indigo-500">
                            {pointsEarned}🌸
                          </span>
                        </div>
                        <div className="text-sm text-gray-700 truncate">
                          {t.status === "confirmed" ? "✓ " : ""}
                          {t.title}
                        </div>
                        <div className="text-[10px] text-gray-400 mt-0.5">
                          {DIMENSION_LABELS[t.dimension]} · +{t.points_reward}
                          {t.mode === "challenge" && `×${t.points_multiplier}`}
                        </div>
                      </div>
                      {t.status === "pending" && (
                        <button
                          onClick={() => {
                            onConfirmTask(t);
                            router.refresh();
                          }}
                          className="text-[11px] px-2 py-1 rounded bg-green-500 text-white flex-shrink-0"
                        >
                          ✓ 确认
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- TemplateEditModal ---------- */

const CATEGORY_LABELS = ["学习习惯", "学习科目", "学习成绩", "生活习惯", "性格培养"];

function TemplateEditModal({
  familyId,
  templates,
  onClose,
  onSaved,
}: {
  familyId: string;
  templates: RewardTemplate[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = createClient();
  const [localTemplates, setLocalTemplates] = useState<RewardTemplate[]>(templates);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPoints, setEditPoints] = useState(2);
  const [editCategory, setEditCategory] = useState(CATEGORY_LABELS[0]);
  const [editDimension, setEditDimension] = useState<Dimension>("zhi");
  const [editIsDecrease, setEditIsDecrease] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPoints, setNewPoints] = useState(2);
  const [newCategory, setNewCategory] = useState(CATEGORY_LABELS[0]);
  const [newDimension, setNewDimension] = useState<Dimension>("zhi");
  const [newIsDecrease, setNewIsDecrease] = useState(false);

  const grouped = useMemo(() => {
    const g: Record<string, RewardTemplate[]> = {};
    localTemplates.forEach((t) => {
      const cat = t.category || "其他";
      if (!g[cat]) g[cat] = [];
      g[cat].push(t);
    });
    return g;
  }, [localTemplates]);

  const startEdit = (t: RewardTemplate) => {
    setEditingId(t.id);
    setEditName(t.item_name);
    setEditPoints(t.points);
    setEditCategory(t.category || "其他");
    setEditDimension(t.dimension);
    setEditIsDecrease(t.is_decrease);
  };

  const saveEdit = async (id: string) => {
    const finalPoints = editIsDecrease ? -Math.abs(editPoints) : Math.abs(editPoints);
    const { error } = await supabase
      .from("reward_templates")
      .update({ item_name: editName, points: finalPoints, category: editCategory, dimension: editDimension, is_decrease: editIsDecrease })
      .eq("id", id);
    if (error) { alert(`保存失败：${error.message}`); return; }
    setEditingId(null);
    setLocalTemplates((prev) => prev.map((t) =>
      t.id === id ? { ...t, item_name: editName, points: finalPoints, category: editCategory, dimension: editDimension, is_decrease: editIsDecrease } : t
    ));
    onSaved();
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    const { error } = await supabase.from("reward_templates").update({ is_active: isActive }).eq("id", id);
    if (error) { alert(`更新失败：${error.message}`); return; }
    setLocalTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, is_active: isActive } : t)));
    onSaved();
  };

  const removeTpl = async (id: string) => {
    if (!confirm("删除这个奖罚项？")) return;
    const { error } = await supabase.from("reward_templates").delete().eq("id", id);
    if (error) { alert(`删除失败：${error.message}`); return; }
    setLocalTemplates((prev) => prev.filter((t) => t.id !== id));
    onSaved();
  };

  const addTpl = async () => {
    if (!newName.trim()) return;
    const finalPoints = newIsDecrease ? -Math.abs(newPoints) : Math.abs(newPoints);
    const { data, error } = await supabase.from("reward_templates").insert({
      family_id: familyId,
      item_name: newName.trim(),
      points: finalPoints,
      category: newCategory,
      dimension: newDimension,
      is_decrease: newIsDecrease,
      sort_order: (localTemplates.length + 1) * 10,
    }).select();
    if (error) { alert(`新增失败：${error.message}`); return; }
    if (data) setLocalTemplates((prev) => [...prev, data[0]]);
    setShowAddForm(false);
    setNewName("");
    setNewPoints(2);
    onSaved();
  };

  const renderTplRow = (t: RewardTemplate) => (
    <div key={t.id} className="bg-gray-50 rounded-xl px-3 py-2">
      {editingId === t.id ? (
        <div className="space-y-2">
          <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm" placeholder="名称" />
          <div className="flex gap-2 items-center flex-wrap">
            <input type="number" value={editPoints} onChange={(e) => setEditPoints(Math.abs(parseInt(e.target.value, 10) || 0))} className="w-20 px-3 py-1.5 rounded-lg border border-gray-200 text-sm" />
            <select value={editIsDecrease ? "dec" : "inc"} onChange={(e) => setEditIsDecrease(e.target.value === "dec")} className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white">
              <option value="inc">加分</option><option value="dec">减分</option>
            </select>
            <select value={editCategory} onChange={(e) => setEditCategory(e.target.value)} className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white">
              {CATEGORY_LABELS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={editDimension} onChange={(e) => setEditDimension(e.target.value as Dimension)} className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white">
              {(Object.keys(DIMENSION_LABELS) as Dimension[]).map((d) => <option key={d} value={d}>{DIMENSION_LABELS[d]}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={() => saveEdit(t.id)} className="flex-1 py-1.5 rounded-lg bg-indigo-600 text-white text-sm">保存</button>
            <button onClick={() => setEditingId(null)} className="flex-1 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-sm">取消</button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${t.is_decrease ? "bg-red-500" : "bg-green-500"}`} />
            <span className={`text-sm truncate ${t.is_active ? "text-gray-700" : "text-gray-300 line-through"}`}>{t.item_name}</span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className={`font-mono font-semibold text-sm ${t.is_decrease ? "text-red-500" : "text-green-600"}`}>{t.is_decrease ? "" : "+"}{t.points}</span>
            <button onClick={() => toggleActive(t.id, !t.is_active)} className={`px-1.5 text-xs ${t.is_active ? "text-gray-400 hover:text-amber-500" : "text-amber-500"}`} title={t.is_active ? "停用" : "启用"}>{t.is_active ? "✓" : "○"}</button>
            <button onClick={() => startEdit(t)} className="text-gray-300 hover:text-indigo-500 px-1.5 text-sm" title="编辑">✎</button>
            <button onClick={() => removeTpl(t.id)} className="text-gray-300 hover:text-red-500 px-1.5 text-sm" title="删除">✕</button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg text-gray-800">⚙ 奖罚项设置</h3>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500 text-xl px-1">✕</button>
        </div>
        <p className="text-xs text-gray-400 mb-3">更细的奖罚项目（比 5 维快速加分更具体）。</p>

        {showAddForm ? (
          <div className="bg-indigo-50 rounded-xl p-3 mb-4 space-y-2">
            <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="名称，如：主动做家务" className="w-full px-3 py-1.5 rounded-lg border border-indigo-200 text-sm bg-white" />
            <div className="flex gap-2 items-center flex-wrap">
              <input type="number" value={newPoints} onChange={(e) => setNewPoints(Math.abs(parseInt(e.target.value, 10) || 0))} className="w-20 px-3 py-1.5 rounded-lg border border-gray-200 text-sm" />
              <select value={newIsDecrease ? "dec" : "inc"} onChange={(e) => setNewIsDecrease(e.target.value === "dec")} className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white">
                <option value="inc">加分</option><option value="dec">减分</option>
              </select>
              <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white">
                {CATEGORY_LABELS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={newDimension} onChange={(e) => setNewDimension(e.target.value as Dimension)} className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white">
                {(Object.keys(DIMENSION_LABELS) as Dimension[]).map((d) => <option key={d} value={d}>{DIMENSION_LABELS[d]}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={addTpl} disabled={!newName.trim()} className="flex-1 py-1.5 rounded-lg bg-indigo-600 text-white text-sm disabled:opacity-50">添加</button>
              <button onClick={() => setShowAddForm(false)} className="flex-1 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-sm">取消</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowAddForm(true)} className="w-full py-2 rounded-xl border border-dashed border-indigo-300 text-indigo-600 text-sm hover:bg-indigo-50 mb-4">
            ＋ 新增奖罚项
          </button>
        )}

        <div className="space-y-5">
          {CATEGORY_LABELS.map((cat) => {
            const items = grouped[cat] || [];
            if (items.length === 0) return null;
            const addCount = items.filter((t) => !t.is_decrease).length;
            const decCount = items.filter((t) => t.is_decrease).length;
            return (
              <div key={cat}>
                <div className="flex items-center gap-2 mb-2">
                  <h4 className="font-semibold text-sm text-gray-700">{cat}</h4>
                  <span className="text-xs text-gray-400">+{addCount} / -{decCount}</span>
                </div>
                <div className="space-y-1.5">
                  {items.sort((a, b) => (a.is_decrease === b.is_decrease ? a.sort_order - b.sort_order : a.is_decrease ? 1 : -1)).map((t) => renderTplRow(t))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------- TasksTab ---------- */

type TaskFilter = "all" | "pending" | "confirmed" | "expired";

const STATUS_LABELS: Record<string, { text: string; className: string }> = {
  pending: { text: "待完成", className: "bg-amber-100 text-amber-700" },
  submitted: { text: "已提交", className: "bg-blue-100 text-blue-700" },
  confirmed: { text: "已完成", className: "bg-green-100 text-green-700" },
  rejected: { text: "已退回", className: "bg-red-100 text-red-700" },
};

const RECURRENCE_LABELS: Record<string, string> = {
  once: "一次性", daily: "每日", weekly: "每周", monthly: "每月",
};

function isTaskExpired(t: Task): boolean {
  if (t.status === "confirmed" || t.status === "submitted") return false;
  if (!t.due_date) return false;
  return new Date(t.due_date) < new Date();
}

function TasksTab({
  kids,
  tasks,
  templates,
  onCreateTask,
  activeChildId,
  setActiveChildId,
  onConfirmTask,
  onDeleteTask,
}: {
  kids: (FamilyMember & { account: RewardAccount | null })[];
  tasks: Task[];
  templates: RewardTemplate[];
  onCreateTask: () => void;
  activeChildId: string | null;
  setActiveChildId: (id: string | null) => void;
  onConfirmTask: (t: Task) => void;
  onDeleteTask: (t: Task) => void;
}) {
  const [filter, setFilter] = useState<TaskFilter>("all");

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filter === "all") return true;
      if (filter === "pending") return t.status === "pending" && !isTaskExpired(t);
      if (filter === "confirmed") return t.status === "confirmed";
      if (filter === "expired") return isTaskExpired(t);
      return true;
    });
  }, [tasks, filter]);

  const grouped = useMemo(() => {
    const g: Record<string, Task[]> = {};
    kids.forEach((k) => (g[k.id] = []));
    filteredTasks.forEach((t) => {
      if (!g[t.child_member_id]) g[t.child_member_id] = [];
      g[t.child_member_id].push(t);
    });
    Object.values(g).forEach((arr) =>
      arr.sort((a, b) => {
        const aExp = isTaskExpired(a) ? 0 : 1;
        const bExp = isTaskExpired(b) ? 0 : 1;
        if (aExp !== bExp) return aExp - bExp;
        if (a.status === "confirmed" && b.status !== "confirmed") return 1;
        if (b.status === "confirmed" && a.status !== "confirmed") return -1;
        const ad = a.due_date ? new Date(a.due_date).getTime() : Infinity;
        const bd = b.due_date ? new Date(b.due_date).getTime() : Infinity;
        return ad - bd;
      })
    );
    return g;
  }, [filteredTasks, kids]);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-gray-800 text-sm">📋 任务管理</h2>
        <button
          onClick={onCreateTask}
          className="bg-indigo-600 text-white px-3 py-1 rounded-lg text-xs font-medium hover:bg-indigo-700"
        >
          + 新任务
        </button>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {([
          { key: "all", label: "全部" },
          { key: "pending", label: "待完成" },
          { key: "confirmed", label: "已完成" },
          { key: "expired", label: "已过期" },
        ] as { key: TaskFilter; label: string }[]).map((f) => {
          const count = tasks.filter((t) => {
            if (f.key === "pending") return t.status === "pending" && !isTaskExpired(t);
            if (f.key === "confirmed") return t.status === "confirmed";
            if (f.key === "expired") return isTaskExpired(t);
            return true;
          }).length;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex-shrink-0 px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                filter === f.key ? "bg-indigo-600 text-white" : "bg-gray-50 text-gray-600 border border-gray-200"
              }`}
            >
              {f.label} ({count})
            </button>
          );
        })}
      </div>

      {kids.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {kids.map((k) => (
            <button
              key={k.id}
              onClick={() => setActiveChildId(k.id)}
              className={`flex-shrink-0 px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                activeChildId === k.id ? "bg-indigo-600 text-white" : "bg-gray-50 text-gray-600 border border-gray-200"
              }`}
            >
              {k.nickname} ({(grouped[k.id] || []).length})
            </button>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {(grouped[activeChildId || ""] || []).length === 0 ? (
          <div className="text-center py-6 text-gray-400 text-xs">暂无任务</div>
        ) : (
          (grouped[activeChildId || ""] || []).map((t) => {
            const expired = isTaskExpired(t);
            const pointsEarned = Math.round(t.points_reward * t.points_multiplier);
            return (
              <div key={t.id} className={`rounded-xl border ${expired ? "border-red-200 bg-red-50/30" : "border-gray-100"} p-2.5`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${expired ? "bg-red-100 text-red-700" : STATUS_LABELS[t.status].className}`}>
                        {expired ? "已过期" : STATUS_LABELS[t.status].text}
                      </span>
                      {t.mode === "challenge" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600">挑战 {t.points_multiplier}x</span>
                      )}
                    </div>
                    <h4 className="font-semibold text-gray-800 text-sm truncate">{t.title}</h4>
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-400">
                      <span>{DIMENSION_LABELS[t.dimension]} · +{pointsEarned}🌸</span>
                      {t.due_date && (
                        <span className={expired ? "text-red-500 font-medium" : ""}>
                          截止 {new Date(t.due_date).toLocaleDateString("zh-CN")}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    {t.status === "pending" && !expired && (
                      <button onClick={() => onConfirmTask(t)} className="text-[11px] px-2 py-1 rounded bg-green-500 text-white">✓确认</button>
                    )}
                    <button onClick={() => onDeleteTask(t)} className="text-[11px] px-2 py-1 rounded border border-gray-200 text-gray-500">删除</button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
