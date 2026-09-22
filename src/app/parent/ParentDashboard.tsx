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
  kids: (FamilyMember & { account: RewardAccount | null })[];
  tasks: Task[];
  transactions: RewardTransaction[];
  templates: RewardTemplate[];
  currentUserId: string;
  userNickname: string;
}

export default function ParentDashboard({
  familyId,
  kids,
  tasks: initialTasks,
  transactions: initialTxns,
  templates,
  currentUserId,
  userNickname,
}: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [activeChildId, setActiveChildId] = useState<string | null>(
    kids[0]?.id || null
  );
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showAddChild, setShowAddChild] = useState(false);
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
            onAddChild={() => setShowAddChild(true)}
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

      {/* 每日明细弹窗 */}
      {dayDetail && activeChild && (
        <DayDetailModal
          dayKey={dayDetail}
          child={activeChild}
          txns={childTxns}
          templates={templates}
          currentUserId={currentUserId}
          onClose={() => setDayDetail(null)}
          router={router}
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
  onAddChild,
  onEditTemplates,
  onOpenTasks,
  tasksActive,
}: {
  onAddChild: () => void;
  onEditTemplates: () => void;
  onOpenTasks: () => void;
  tasksActive: boolean;
}) {
  const [open, setOpen] = useState(false);

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
              onClick={() => { setOpen(false); onOpenTasks(); }}
              className={`w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 ${tasksActive ? "text-indigo-600" : ""}`}
            >
              <span>📋</span> 任务管理 {tasksActive && "✓"}
            </button>
          </div>
        </>
      )}
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

/* ---------- DayDetailModal ---------- */

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
  router,
}: {
  dayKey: string;
  child: FamilyMember & { account: RewardAccount | null };
  txns: RewardTransaction[];
  templates: RewardTemplate[];
  currentUserId: string;
  onClose: () => void;
  router: any;
}) {
  const supabase = createClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPoints, setEditPoints] = useState(0);
  const [editReason, setEditReason] = useState("");
  const [showAdd, setShowAdd] = useState(false);

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
