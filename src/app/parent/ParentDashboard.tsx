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
import CreateTaskModal from "./CreateTaskModal";

interface Props {
  familyId: string;
  kids: (FamilyMember & { account: RewardAccount | null })[];
  tasks: Task[];
  transactions: RewardTransaction[];
  templates: RewardTemplate[];
  currentUserId: string;
  userNickname: string;
  ssrTiming?: string;
  ssrTotalMs?: number;
}

type TabKey = "reward" | "ai" | "tasks";

export default function ParentDashboard({
  familyId,
  kids,
  tasks: initialTasks,
  transactions: initialTxns,
  templates,
  currentUserId,
  userNickname,
  ssrTiming,
  ssrTotalMs,
}: Props) {
  const router = useRouter();
  const supabase = createClient();

  // SSR 耗时日志（浏览器 Console 可看到）
  useEffect(() => {
    if (ssrTiming) console.log(`[SSR-timing] ${ssrTiming}`);
  }, [ssrTiming]);

  const [tab, setTab] = useState<TabKey>("reward");
  const [activeChildId, setActiveChildId] = useState<string | null>(
    kids[0]?.id || null
  );
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showAddChild, setShowAddChild] = useState(false);
  const [showTemplateEdit, setShowTemplateEdit] = useState(false);
  const [tasks, setTasks] = useState(initialTasks);
  const [txns, setTxns] = useState(initialTxns);
  // 点开的日期明细（YYYY-MM-DD），null=关闭
  const [dayDetail, setDayDetail] = useState<string | null>(null);

  // router.refresh() 后服务端会传新 props，但 useState 不会自动同步，需要 useEffect
  useEffect(() => setTasks(initialTasks), [initialTasks]);
  useEffect(() => setTxns(initialTxns), [initialTxns]);

  const activeChild = kids.find((c) => c.id === activeChildId);

  // 从 reward_templates 动态生成快速操作按钮
  const quickActions = useMemo(() => {
    return templates
      .filter((t) => t.is_active)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((t) => ({
        id: t.id,
        label: t.item_name,
        points: t.points,
        dimension: t.dimension,
        color: getDimensionBtnColor(t.dimension, t.is_decrease),
        isDecrease: t.is_decrease,
      }));
  }, [templates]);

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

  const handleQuickAddPoints = async (
    childId: string,
    templateId: string
  ) => {
    const child = kids.find((c) => c.id === childId);
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) {
      alert("找不到奖励项模板");
      return;
    }
    if (!child?.account) {
      alert(`孩子没有小红花账户（account 为空），无法加分。\n这通常是 on_child_member_created 触发器没创建 account。\nchildId=${childId}`);
      return;
    }

    const { error } = await supabase.from("reward_transactions").insert({
      account_id: child.account.id,
      member_id: childId,
      points: tpl.points,
      reason: tpl.item_name,
      dimension: tpl.dimension,
      source: "manual",
      created_by: currentUserId,
    });

    if (error) {
      alert(`加分失败：${error.message}\ncode=${error.code}`);
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

  return (
    <main className="min-h-screen bg-gray-50 pb-20">
      {/* 顶部导航 */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🌸</span>
            <span className="font-bold text-indigo-600">跬步</span>
          </div>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              router.push("/login");
            }}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            退出
          </button>
        </div>
      </header>

      <div className="max-w-lg mx-auto">
        {tab === "reward" && (
          <RewardTab
            kids={kids}
            activeChildId={activeChildId}
            setActiveChildId={setActiveChildId}
            showAddChild={showAddChild}
            setShowAddChild={setShowAddChild}
            quickActions={quickActions}
            onQuickAdd={handleQuickAddPoints}
            onOpenDay={setDayDetail}
            txns={txns}
            tasks={tasks}
            activeChild={activeChild}
            showCreateTask={showCreateTask}
            setShowCreateTask={setShowCreateTask}
            onConfirmTask={handleConfirmTask}
            onDeleteTask={handleDeleteTask}
            userNickname={userNickname}
            onOpenTemplateEdit={() => setShowTemplateEdit(true)}
            templates={templates}
          />
        )}

        {tab === "ai" && (
          <div className="px-4 py-20 text-center">
            <div className="text-6xl mb-4">🤖</div>
            <h2 className="text-xl font-bold text-gray-700 mb-2">AI 辅助</h2>
            <p className="text-gray-400 text-sm">规划中：听写、作业解析、错题本…</p>
          </div>
        )}

        {tab === "tasks" && (
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
        )}
      </div>

      {/* 底部 Tab 导航 */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-20">
        <div className="max-w-lg mx-auto flex">
          <TabBtn label="及时奖励" icon="🌸" active={tab === "reward"} onClick={() => setTab("reward")} />
          <TabBtn label="AI 辅助" icon="🤖" active={tab === "ai"} onClick={() => setTab("ai")} />
          <TabBtn label="任务跟进" icon="📋" active={tab === "tasks"} onClick={() => setTab("tasks")} />
        </div>
      </nav>

      {/* 创建任务弹窗 */}
      {showCreateTask && activeChild && (
        <CreateTaskModal
          familyId={familyId}
          childId={activeChild.id}
          currentUserId={currentUserId}
          templates={templates}
          onClose={() => setShowCreateTask(false)}
          onCreated={() => {
            setShowCreateTask(false);
            router.refresh();
          }}
        />
      )}

      {/* 添加孩子弹窗 */}
      {showAddChild && (
        <AddChildModal
          familyId={familyId}
          onClose={() => setShowAddChild(false)}
          onAdd={(name) => {
            handleAddChild(name);
            setShowAddChild(false);
          }}
        />
      )}

      {/* 每日明细弹窗（查看/编辑/删除/新增） */}
      {dayDetail && activeChild && (
        <DayDetailModal
          dayKey={dayDetail}
          child={activeChild}
          txns={txns}
          templates={templates}
          currentUserId={currentUserId}
          onClose={() => setDayDetail(null)}
        />
      )}

      {/* 奖罚项编辑弹窗（CRUD reward_templates） */}
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

/* ---------- Tab 按钮 ---------- */

function TabBtn({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-3 flex flex-col items-center gap-0.5 text-xs transition-colors ${
        active ? "text-indigo-600" : "text-gray-400"
      }`}
    >
      <span className="text-lg">{icon}</span>
      <span className={active ? "font-semibold" : ""}>{label}</span>
    </button>
  );
}

/* ---------- 及时奖励 Tab ---------- */

function RewardTab({
  kids,
  activeChildId,
  setActiveChildId,
  showAddChild,
  setShowAddChild,
  quickActions,
  onQuickAdd,
  onOpenDay,
  txns,
  tasks,
  activeChild,
  showCreateTask,
  setShowCreateTask,
  onConfirmTask,
  onDeleteTask,
  userNickname,
  onOpenTemplateEdit,
  templates,
}: {
  kids: (FamilyMember & { account: RewardAccount | null })[];
  activeChildId: string | null;
  setActiveChildId: (id: string | null) => void;
  showAddChild: boolean;
  setShowAddChild: (v: boolean) => void;
  quickActions: {
    id: string;
    label: string;
    points: number;
    dimension: Dimension;
    color: string;
    isDecrease: boolean;
  }[];
  onQuickAdd: (childId: string, templateId: string) => void;
  onOpenDay: (dayKey: string) => void;
  txns: RewardTransaction[];
  tasks: Task[];
  activeChild: (FamilyMember & { account: RewardAccount | null }) | undefined;
  showCreateTask: boolean;
  setShowCreateTask: (v: boolean) => void;
  onConfirmTask: (t: Task) => void;
  onDeleteTask: (t: Task) => void;
  userNickname: string;
  onOpenTemplateEdit: () => void;
  templates: RewardTemplate[];
}) {
  const [subTab, setSubTab] = useState<"reward" | "tasks">("tasks");

  // 按当前活跃孩子过滤流水
  const childTxns = useMemo(
    () => txns.filter((t) => t.member_id === activeChildId),
    [txns, activeChildId]
  );

  return (
    <div className="px-4 py-4 space-y-4">
      {/* 顶部：家庭名 + 孩子切换 + 管理入口（同一行） */}
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0 text-sm text-gray-500">
          👨‍👩‍👧 {userNickname}的家庭
        </div>
        {kids.length > 0 ? (
          <div className="flex-1 min-w-0 flex gap-2 overflow-x-auto pb-1 snap-x">
            {kids.map((child) => (
              <button
                key={child.id}
                onClick={() => setActiveChildId(child.id)}
                className={`flex-shrink-0 snap-start px-4 py-2 rounded-xl text-sm font-medium transition ${
                  activeChildId === child.id
                    ? "bg-indigo-600 text-white shadow"
                    : "bg-white text-gray-700 border border-gray-200"
                }`}
              >
                {child.nickname || "孩子"}
                {child.account && (
                  <span className="ml-1 text-xs opacity-80">
                    🌸{child.account.total_points}
                  </span>
                )}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex-1 text-center text-gray-400 text-sm py-2">暂无孩子</div>
        )}
        {/* 管理菜单 */}
        <SettingsMenu
          onAddChild={() => setShowAddChild(true)}
          onEditTemplates={onOpenTemplateEdit}
        />
      </div>

      {/* 子 Tab 切换：奖励 / 任务 */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        <button
          onClick={() => setSubTab("reward")}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
            subTab === "reward"
              ? "bg-white text-indigo-600 shadow"
              : "text-gray-500"
          }`}
        >
          🌸 奖励记录
        </button>
        <button
          onClick={() => setSubTab("tasks")}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
            subTab === "tasks"
              ? "bg-white text-indigo-600 shadow"
              : "text-gray-500"
          }`}
        >
          📋 任务管理
        </button>
      </div>

      {/* ===== 奖励子 Tab ===== */}
      {subTab === "reward" && (
        <>
          {/* 日历（月/周/日/年视图 + 任务聚合） */}
          {activeChild && (
            <Calendar child={activeChild} txns={childTxns} tasks={tasks} onOpenDay={onOpenDay} />
          )}

          {/* 快速操作（横向滑动） */}
          {activeChild && quickActions.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-700 text-sm">
                  快速操作 · {activeChild.nickname}
                </h3>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 snap-x">
                {quickActions.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => onQuickAdd(activeChild.id, a.id)}
                    className={`flex-shrink-0 snap-start ${a.color} px-3 py-2 rounded-lg text-sm whitespace-nowrap transition hover:scale-105 active:scale-95`}
                  >
                    {a.label} {a.points > 0 ? "+" : ""}{a.points}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 最近流水 */}
          <section>
            <h2 className="font-bold text-lg text-gray-800 mb-3">📊 最近</h2>
        <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
          {txns.length === 0 && (
            <p className="text-gray-400 text-sm text-center py-4">
              暂无记录
            </p>
          )}
          {txns.slice(0, 20).map((tx) => (
            <div
              key={tx.id}
              className="flex items-center justify-between text-sm py-2.5 px-3"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    tx.points > 0 ? "bg-green-500" : "bg-red-500"
                  }`}
                />
                <span className="text-gray-700">{tx.reason}</span>
                {tx.dimension && (
                  <span className="text-xs text-gray-400">
                    [{DIMENSION_LABELS[tx.dimension]}]
                  </span>
                )}
              </div>
              <span
                className={`font-mono font-semibold ${
                  tx.points > 0 ? "text-green-600" : "text-red-500"
                }`}
              >
                {tx.points > 0 ? "+" : ""}
                {tx.points}
              </span>
            </div>
          ))}
        </div>
          </section>
        </>
      )}

      {/* ===== 任务子 Tab ===== */}
      {subTab === "tasks" && (
        <TasksTab
          kids={kids}
          tasks={tasks}
          templates={templates}
          onCreateTask={() => setShowCreateTask(true)}
          activeChildId={activeChildId}
          setActiveChildId={setActiveChildId}
          onConfirmTask={onConfirmTask}
          onDeleteTask={onDeleteTask}
        />
      )}
    </div>
  );
}

/* ---------- 管理菜单 ---------- */

function SettingsMenu({
  onAddChild,
  onEditTemplates,
}: {
  onAddChild: () => void;
  onEditTemplates: () => void;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex-shrink-0 w-9 h-9 rounded-xl bg-white border border-gray-200 text-gray-500 hover:text-indigo-500 hover:border-indigo-300 flex items-center justify-center transition"
        title="管理"
      >
        ⚙
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-xl border border-gray-100 shadow-lg z-50 overflow-hidden text-sm">
            <button
              onClick={() => { setOpen(false); onAddChild(); }}
              className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2"
            >
              <span>👶</span> 添加孩子
            </button>
            <button
              onClick={() => { setOpen(false); onEditTemplates(); }}
              className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2"
            >
              <span>🌸</span> 奖罚项管理
            </button>
            <button
              onClick={() => {
                setOpen(false);
                const supabase = createClient();
                supabase.auth.signOut().then(() => router.push("/login"));
              }}
              className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 text-red-500"
            >
              <span>↪</span> 退出登录
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- 辅助 ---------- */

function getDimensionBtnColor(dim: Dimension, isDecrease: boolean): string {
  if (isDecrease) return "bg-red-50 text-red-700 hover:bg-red-100";
  const map: Record<Dimension, string> = {
    de: "bg-amber-50 text-amber-700 hover:bg-amber-100",
    zhi: "bg-blue-50 text-blue-700 hover:bg-blue-100",
    ti: "bg-green-50 text-green-700 hover:bg-green-100",
    mei: "bg-purple-50 text-purple-700 hover:bg-purple-100",
    lao: "bg-orange-50 text-orange-700 hover:bg-orange-100",
    custom: "bg-gray-50 text-gray-700 hover:bg-gray-100",
  };
  return map[dim];
}

/* ---------- TaskCard ---------- */

function TaskCard({
  task,
  onConfirm,
  onDelete,
}: {
  task: Task;
  onConfirm: () => void;
  onDelete: () => void;
}) {
  const statusMap = {
    pending: { label: "待完成", color: "bg-gray-100 text-gray-600" },
    submitted: { label: "待确认", color: "bg-amber-100 text-amber-700" },
    confirmed: { label: "已完成", color: "bg-green-100 text-green-700" },
    rejected: { label: "已退回", color: "bg-red-100 text-red-700" },
  };
  const s = statusMap[task.status];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 flex items-center gap-3 px-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-800 truncate">
            {task.title}
          </span>
          <span className={`px-2 py-0.5 rounded text-xs ${s.color}`}>
            {s.label}
          </span>
        </div>
        <div className="text-xs text-gray-400 mt-1 flex gap-3">
          <span>🌸+{task.points_reward * (task.mode === "challenge" ? task.points_multiplier : 1)}</span>
          <span>{task.mode === "challenge" ? "挑战" : "必须"}</span>
          {task.due_date && (
            <span>📅 {new Date(task.due_date).toLocaleDateString()}</span>
          )}
        </div>
      </div>
      <div className="flex gap-1">
        {task.status === "submitted" && (
          <button
            onClick={onConfirm}
            className="bg-green-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium"
          >
            确认
          </button>
        )}
        <button
          onClick={onDelete}
          className="text-gray-300 hover:text-red-500 px-2"
          title="删除"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

/* ---------- AddChildModal ---------- */

function AddChildModal({
  onClose,
  onAdd,
}: {
  familyId: string;
  onClose: () => void;
  onAdd: (name: string) => void;
}) {
  const [name, setName] = useState("");

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl p-6 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-bold text-lg mb-4">添加孩子</h3>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="小名/昵称"
          className="w-full px-4 py-3 rounded-xl border border-gray-200 mb-4"
          autoFocus
        />
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-xl border border-gray-200 text-gray-600"
          >
            取消
          </button>
          <button
            onClick={() => name.trim() && onAdd(name.trim())}
            className="flex-1 py-2 rounded-xl bg-indigo-600 text-white"
          >
            添加
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- 每日明细弹窗 ---------- */

function toDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function DayDetailModal({
  dayKey,
  child,
  txns,
  templates,
  currentUserId,
  onClose,
}: {
  dayKey: string;
  child: FamilyMember & { account: RewardAccount | null };
  txns: RewardTransaction[];
  templates: RewardTemplate[];
  currentUserId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPoints, setEditPoints] = useState(0);
  const [editReason, setEditReason] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  // 当天流水（本地时区过滤）
  const dayTxns = useMemo(
    () => txns.filter((t) => toDayKey(new Date(t.created_at)) === dayKey),
    [txns, dayKey]
  );
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
      alert(`保存失败：${error.message}\n请确认已执行 migration_003_day_edit.sql`);
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
      alert(`删除失败：${error.message}\n请确认已执行 migration_003_day_edit.sql`);
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
    // 指定记录时间=当天正午（本地时区），避免跨时区日期错位
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
        {/* 标题 */}
        <div className="flex items-center justify-between mb-4">
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

        {/* 当天流水列表 */}
        {dayTxns.length === 0 && (
          <p className="text-gray-400 text-sm text-center py-6">
            这天还没有记录
          </p>
        )}
        <div className="space-y-2 mb-4">
          {dayTxns.map((t) => (
            <div key={t.id} className="bg-gray-50 rounded-xl px-3 py-2.5">
              {editingId === t.id ? (
                /* 编辑态 */
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
                    <button
                      onClick={() => saveEdit(t.id)}
                      className="flex-1 py-1.5 rounded-lg bg-indigo-600 text-white text-sm"
                    >
                      保存
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="flex-1 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-sm"
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                /* 展示态 */
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${t.points > 0 ? "bg-green-500" : "bg-red-500"}`} />
                    <span className="text-sm text-gray-700 truncate">{t.reason}</span>
                    {t.dimension && (
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        [{DIMENSION_LABELS[t.dimension]}]
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                    <span className={`font-mono font-semibold text-sm ${t.points > 0 ? "text-green-600" : "text-red-500"}`}>
                      {t.points > 0 ? "+" : ""}{t.points}
                    </span>
                    <button
                      onClick={() => startEdit(t)}
                      className="text-gray-300 hover:text-indigo-500 px-1.5 text-sm"
                      title="编辑"
                    >
                      ✎
                    </button>
                    <button
                      onClick={() => removeTxn(t.id)}
                      className="text-gray-300 hover:text-red-500 px-1.5 text-sm"
                      title="删除"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* 新增记录 */}
        {showAdd ? (
          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs text-gray-400 mb-2">点击模板快速添加：</p>
            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
              {templates
                .filter((t) => t.is_active)
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((t) => (
                  <button
                    key={t.id}
                    onClick={() => addFromTemplate(t.id)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs whitespace-nowrap ${
                      t.is_decrease
                        ? "bg-red-50 text-red-700 hover:bg-red-100"
                        : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                    }`}
                  >
                    {t.item_name} {t.points > 0 ? "+" : ""}{t.points}
                  </button>
                ))}
            </div>
            <button
              onClick={() => setShowAdd(false)}
              className="w-full mt-3 py-2 rounded-xl border border-gray-200 text-gray-500 text-sm"
            >
              收起
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowAdd(true)}
            className="w-full py-2.5 rounded-xl border border-dashed border-indigo-300 text-indigo-600 text-sm hover:bg-indigo-50"
          >
            ＋ 新增记录（记到这天）
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- 奖罚项编辑弹窗 ---------- */

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

  // 按 category 分组
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
    // 如果改成减分项，points 强制取负值
    const finalPoints = editIsDecrease ? -Math.abs(editPoints) : Math.abs(editPoints);
    const { error } = await supabase
      .from("reward_templates")
      .update({
        item_name: editName,
        points: finalPoints,
        category: editCategory,
        dimension: editDimension,
        is_decrease: editIsDecrease,
      })
      .eq("id", id);
    if (error) {
      alert(`保存失败：${error.message}`);
      return;
    }
    setEditingId(null);
    setLocalTemplates((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, item_name: editName, points: finalPoints, category: editCategory, dimension: editDimension, is_decrease: editIsDecrease }
          : t
      )
    );
    onSaved();
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    const { error } = await supabase
      .from("reward_templates")
      .update({ is_active: isActive })
      .eq("id", id);
    if (error) {
      alert(`更新失败：${error.message}`);
      return;
    }
    setLocalTemplates((prev) =>
      prev.map((t) => (t.id === id ? { ...t, is_active: isActive } : t))
    );
    onSaved();
  };

  const removeTpl = async (id: string) => {
    if (!confirm("删除这个奖罚项？已有的流水记录不受影响。")) return;
    const { error } = await supabase.from("reward_templates").delete().eq("id", id);
    if (error) {
      alert(`删除失败：${error.message}`);
      return;
    }
    setLocalTemplates((prev) => prev.filter((t) => t.id !== id));
    onSaved();
  };

  const addTpl = async () => {
    if (!newName.trim()) return;
    const finalPoints = newIsDecrease ? -Math.abs(newPoints) : Math.abs(newPoints);
    const { data, error } = await supabase
      .from("reward_templates")
      .insert({
        family_id: familyId,
        item_name: newName.trim(),
        points: finalPoints,
        category: newCategory,
        dimension: newDimension,
        is_decrease: newIsDecrease,
        sort_order: (localTemplates.length + 1) * 10,
      })
      .select();
    if (error) {
      alert(`新增失败：${error.message}`);
      return;
    }
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
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm"
            placeholder="名称"
          />
          <div className="flex gap-2 items-center">
            <input
              type="number"
              value={editPoints}
              onChange={(e) => setEditPoints(Math.abs(parseInt(e.target.value, 10) || 0))}
              className="w-20 px-3 py-1.5 rounded-lg border border-gray-200 text-sm"
            />
            <select
              value={editIsDecrease ? "dec" : "inc"}
              onChange={(e) => setEditIsDecrease(e.target.value === "dec")}
              className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white"
            >
              <option value="inc">加分</option>
              <option value="dec">减分</option>
            </select>
            <select
              value={editCategory}
              onChange={(e) => setEditCategory(e.target.value)}
              className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white"
            >
              {CATEGORY_LABELS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              value={editDimension}
              onChange={(e) => setEditDimension(e.target.value as Dimension)}
              className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white"
            >
              {(Object.keys(DIMENSION_LABELS) as Dimension[]).map((d) => (
                <option key={d} value={d}>{DIMENSION_LABELS[d]}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => saveEdit(t.id)}
              className="flex-1 py-1.5 rounded-lg bg-indigo-600 text-white text-sm"
            >
              保存
            </button>
            <button
              onClick={() => setEditingId(null)}
              className="flex-1 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-sm"
            >
              取消
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${t.is_decrease ? "bg-red-500" : "bg-green-500"}`} />
            <span className={`text-sm truncate ${t.is_active ? "text-gray-700" : "text-gray-300 line-through"}`}>
              {t.item_name}
            </span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className={`font-mono font-semibold text-sm ${t.is_decrease ? "text-red-500" : "text-green-600"}`}>
              {t.is_decrease ? "" : "+"}{t.points}
            </span>
            <button
              onClick={() => toggleActive(t.id, !t.is_active)}
              className={`px-1.5 text-xs ${t.is_active ? "text-gray-400 hover:text-amber-500" : "text-amber-500"}`}
              title={t.is_active ? "停用" : "启用"}
            >
              {t.is_active ? "✓" : "○"}
            </button>
            <button
              onClick={() => startEdit(t)}
              className="text-gray-300 hover:text-indigo-500 px-1.5 text-sm"
              title="编辑"
            >
              ✎
            </button>
            <button
              onClick={() => removeTpl(t.id)}
              className="text-gray-300 hover:text-red-500 px-1.5 text-sm"
              title="删除"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl p-5 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题 */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg text-gray-800">⚙ 奖罚项设置</h3>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500 text-xl px-1">
            ✕
          </button>
        </div>
        <p className="text-xs text-gray-400 mb-3">
          设好后一般不动，加减分按模板点选即可；随时可编辑、停用或新增。
        </p>

        {/* 新增表单 */}
        {showAddForm ? (
          <div className="bg-indigo-50 rounded-xl p-3 mb-4 space-y-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="名称，如：主动做家务"
              className="w-full px-3 py-1.5 rounded-lg border border-indigo-200 text-sm bg-white"
            />
            <div className="flex gap-2 items-center flex-wrap">
              <input
                type="number"
                value={newPoints}
                onChange={(e) => setNewPoints(Math.abs(parseInt(e.target.value, 10) || 0))}
                className="w-20 px-3 py-1.5 rounded-lg border border-gray-200 text-sm"
              />
              <select
                value={newIsDecrease ? "dec" : "inc"}
                onChange={(e) => setNewIsDecrease(e.target.value === "dec")}
                className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white"
              >
                <option value="inc">加分</option>
                <option value="dec">减分</option>
              </select>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white"
              >
                {CATEGORY_LABELS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <select
                value={newDimension}
                onChange={(e) => setNewDimension(e.target.value as Dimension)}
                className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white"
              >
                {(Object.keys(DIMENSION_LABELS) as Dimension[]).map((d) => (
                  <option key={d} value={d}>{DIMENSION_LABELS[d]}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={addTpl}
                disabled={!newName.trim()}
                className="flex-1 py-1.5 rounded-lg bg-indigo-600 text-white text-sm disabled:opacity-50"
              >
                添加
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="flex-1 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-sm"
              >
                取消
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full py-2 rounded-xl border border-dashed border-indigo-300 text-indigo-600 text-sm hover:bg-indigo-50 mb-4"
          >
            ＋ 新增奖罚项
          </button>
        )}

        {/* 分类列表 */}
        <div className="space-y-5">
          {CATEGORY_LABELS.map((cat) => {
            const items = grouped[cat] || [];
            const addCount = items.filter((t) => !t.is_decrease).length;
            const decCount = items.filter((t) => t.is_decrease).length;
            if (items.length === 0) return null;
            return (
              <div key={cat}>
                <div className="flex items-center gap-2 mb-2">
                  <h4 className="font-semibold text-sm text-gray-700">{cat}</h4>
                  <span className="text-xs text-gray-400">
                    +{addCount} / -{decCount}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {items
                    .sort((a, b) => (a.is_decrease === b.is_decrease ? a.sort_order - b.sort_order : a.is_decrease ? 1 : -1))
                    .map((t) => renderTplRow(t))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------- 任务管理 Tab ---------- */

type TaskFilter = "all" | "pending" | "confirmed" | "expired";

const STATUS_LABELS: Record<string, { text: string; className: string }> = {
  pending: { text: "待完成", className: "bg-amber-100 text-amber-700" },
  submitted: { text: "已提交", className: "bg-blue-100 text-blue-700" },
  confirmed: { text: "已完成", className: "bg-green-100 text-green-700" },
  rejected: { text: "已退回", className: "bg-red-100 text-red-700" },
};

const RECURRENCE_LABELS: Record<string, string> = {
  once: "一次性",
  daily: "每日",
  weekly: "每周",
  monthly: "每月",
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

  const renderTaskCard = (t: Task) => {
    const expired = isTaskExpired(t);
    const tpl = (t as any).template_id
      ? templates.find((tp) => tp.id === (t as any).template_id)
      : null;
    const pointsEarned = Math.round(t.points_reward * t.points_multiplier);
    const recurrence = (t as any).recurrence as string | undefined;

    return (
      <div
        key={t.id}
        className={`bg-white rounded-xl border ${expired ? "border-red-200" : "border-gray-100"} p-3`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  expired
                    ? "bg-red-100 text-red-700"
                    : STATUS_LABELS[t.status].className
                }`}
              >
                {expired ? "已过期" : STATUS_LABELS[t.status].text}
              </span>
              {t.mode === "challenge" && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">
                  挑战 {t.points_multiplier}x
                </span>
              )}
              {recurrence && recurrence !== "once" && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">
                  {RECURRENCE_LABELS[recurrence] || recurrence}
                </span>
              )}
              {tpl && (
                <span className="text-xs text-gray-400">🔗 {tpl.category}</span>
              )}
            </div>
            <h4 className="font-semibold text-gray-800 text-sm truncate">{t.title}</h4>
            {t.description && (
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{t.description}</p>
            )}
            <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
              <span>
                {DIMENSION_LABELS[t.dimension]} · 预计 +{pointsEarned}🌸
              </span>
              {t.due_date && (
                <span className={expired ? "text-red-500 font-medium" : ""}>
                  截止 {new Date(t.due_date).toLocaleDateString("zh-CN")}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1 flex-shrink-0">
            {t.status === "pending" && !expired && (
              <button
                onClick={() => onConfirmTask(t)}
                className="text-xs px-2.5 py-1.5 rounded-lg bg-green-500 text-white hover:bg-green-600"
              >
                ✓ 确认
              </button>
            )}
            <button
              onClick={() => onDeleteTask(t)}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
            >
              删除
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="px-4 py-4 space-y-4">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-lg text-gray-800">📋 任务管理</h2>
        <button
          onClick={onCreateTask}
          className="bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-indigo-700"
        >
          + 新任务
        </button>
      </div>

      {/* 状态筛选 */}
      <div className="flex gap-2 overflow-x-auto pb-1">
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
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                filter === f.key
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-gray-600 border border-gray-200"
              }`}
            >
              {f.label}
              <span className="ml-1 opacity-70">({count})</span>
            </button>
          );
        })}
      </div>

      {/* 孩子切换 */}
      {kids.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {kids.map((k) => (
            <button
              key={k.id}
              onClick={() => setActiveChildId(k.id)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                activeChildId === k.id
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-gray-600 border border-gray-200"
              }`}
            >
              {k.nickname}
              <span className="ml-1 opacity-70">
                ({(grouped[k.id] || []).length})
              </span>
            </button>
          ))}
        </div>
      )}

      {/* 任务列表 */}
      {kids.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <div className="text-4xl mb-2">👨‍👩‍👧</div>
          <p className="text-sm">先添加孩子，再创建任务</p>
        </div>
      ) : (
        kids
          .filter((k) => !activeChildId || k.id === activeChildId)
          .map((k) => {
            const childTasks = grouped[k.id] || [];
            return (
              <div key={k.id}>
                {kids.length > 1 && (
                  <h3 className="font-semibold text-gray-700 text-sm mb-2">
                    🧒 {k.nickname}
                  </h3>
                )}
                {childTasks.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-sm bg-white rounded-xl border border-gray-100">
                    暂无任务
                  </div>
                ) : (
                  <div className="space-y-2">{childTasks.map(renderTaskCard)}</div>
                )}
              </div>
            );
          })
      )}
    </div>
  );
}
