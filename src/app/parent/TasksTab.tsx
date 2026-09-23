"use client";

import { useState, useMemo } from "react";
import type {
  FamilyMember,
  RewardAccount,
  Task,
  RewardTemplate,
} from "@/types";
import { DIMENSION_LABELS } from "@/types";

export type TaskFilter = "all" | "pending" | "confirmed" | "expired";

export const STATUS_LABELS: Record<string, { text: string; className: string }> = {
  pending: { text: "待完成", className: "bg-amber-100 text-amber-700" },
  submitted: { text: "已提交", className: "bg-blue-100 text-blue-700" },
  confirmed: { text: "已完成", className: "bg-green-100 text-green-700" },
  rejected: { text: "已退回", className: "bg-red-100 text-red-700" },
};

export const RECURRENCE_LABELS: Record<string, string> = {
  once: "一次性", daily: "每日", weekly: "每周", monthly: "每月",
};

export function isTaskExpired(t: Task): boolean {
  if (t.status === "confirmed" || t.status === "submitted") return false;
  if (!t.due_date) return false;
  return new Date(t.due_date) < new Date();
}

export default function TasksTab({
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
    <div className="space-y-3">
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
