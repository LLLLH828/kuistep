"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { DIMENSION_LABELS } from "@/types";
import type { Dimension, TaskMode, RewardTemplate, FamilyMember } from "@/types";

interface Props {
  familyId: string;
  kids: FamilyMember[];
  selectedChildIds: string[];
  currentUserId: string;
  templates: RewardTemplate[];
  onClose: () => void;
  onCreated: () => void;
}

type Recurrence = "once" | "daily" | "weekly" | "monthly";

const RECURRENCE_LABELS: Record<Recurrence, string> = {
  once: "一次性",
  daily: "每日",
  weekly: "每周",
  monthly: "每月",
};

export default function CreateTaskModal({
  familyId,
  kids,
  selectedChildIds: initialSelected,
  currentUserId,
  templates,
  onClose,
  onCreated,
}: Props) {
  const supabase = createClient();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dimension, setDimension] = useState<Dimension>("zhi");
  const [points, setPoints] = useState(2);
  const [mode, setMode] = useState<TaskMode>("required");
  const [multiplier, setMultiplier] = useState(2);
  const [dueDate, setDueDate] = useState("");
  const [recurrence, setRecurrence] = useState<Recurrence>("once");
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedChildIds, setSelectedChildIds] = useState<string[]>(initialSelected);

  // 选中模板时自动带入分值和维度
  useEffect(() => {
    if (!templateId) return;
    const tpl = templates.find((t) => t.id === templateId);
    if (tpl) {
      setTitle((prev) => prev || tpl.item_name);
      setDimension(tpl.dimension);
      setPoints(tpl.points);
    }
  }, [templateId, templates]);

  // 只展示加分模板（任务完成=加分，扣分用表现线）
  const addTemplates = templates.filter((t) => !t.is_decrease);

  const toggleChild = (id: string) => {
    setSelectedChildIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const handleSubmit = async () => {
    if (!title.trim() || selectedChildIds.length === 0) return;
    setLoading(true);

    // 批量构造 insert payload
    // family_id 取每个孩子自己所属的家庭（班级里的孩子可能来自不同家庭）
    const records = selectedChildIds.map((childId) => {
      const kid = kids.find((k) => k.id === childId);
      return {
        family_id: kid?.family_id || familyId,
        child_member_id: childId,
        title: title.trim(),
        description: description.trim() || null,
        dimension,
        points_reward: points,
        mode,
        points_multiplier: mode === "challenge" ? multiplier : 1.0,
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
        recurrence,
        template_id: templateId,
        created_by: currentUserId,
      };
    });

    const { error } = await supabase.from("tasks").insert(records);

    setLoading(false);
    if (!error) {
      onCreated();
    } else {
      alert(`创建失败：${error.message}`);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-xl">新任务</h3>
            <button onClick={onClose} className="text-gray-400 text-2xl">
              ✕
            </button>
          </div>

          <div className="space-y-4">
            {/* 指派孩子（多选） */}
            <div>
              <label className="block text-sm text-gray-600 mb-1.5">
                指派给孩子 * {selectedChildIds.length > 0 && (
                  <span className="text-indigo-500">已选 {selectedChildIds.length}</span>
                )}
              </label>
              <div className="flex gap-1.5 flex-wrap">
                {kids.map((k) => {
                  const selected = selectedChildIds.includes(k.id);
                  return (
                    <button
                      key={k.id}
                      type="button"
                      onClick={() => toggleChild(k.id)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition border ${
                        selected
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-gray-50 text-gray-600 border-gray-200 hover:border-indigo-300"
                      }`}
                    >
                      {k.nickname || "孩子"}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 任务标题 */}
            <div>
              <label className="block text-sm text-gray-600 mb-1">任务 *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="如：听写 Unit 3 单词"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 outline-none"
                autoFocus
              />
            </div>

            {/* 关联模板（可选，选了自动带入分值和维度） */}
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                关联加分项（可选）
              </label>
              <select
                value={templateId || ""}
                onChange={(e) => setTemplateId(e.target.value || null)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 outline-none bg-white"
              >
                <option value="">手动设置分值</option>
                {addTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.item_name} [{t.category}] +{t.points}
                  </option>
                ))}
              </select>
            </div>

            {/* 重复规则 */}
            <div>
              <label className="block text-sm text-gray-600 mb-2">重复规则</label>
              <div className="flex gap-2 flex-wrap">
                {(Object.keys(RECURRENCE_LABELS) as Recurrence[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRecurrence(r)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                      recurrence === r
                        ? "bg-indigo-600 text-white"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {RECURRENCE_LABELS[r]}
                  </button>
                ))}
              </div>
            </div>

            {/* 描述 */}
            <div>
              <label className="block text-sm text-gray-600 mb-1">备注</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="选填"
                rows={2}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 outline-none resize-none"
              />
            </div>

            {/* 维度 */}
            <div>
              <label className="block text-sm text-gray-600 mb-2">归属维度</label>
              <div className="flex gap-2 flex-wrap">
                {(Object.keys(DIMENSION_LABELS) as Dimension[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDimension(d)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                      dimension === d
                        ? "bg-indigo-600 text-white"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {DIMENSION_LABELS[d]}
                  </button>
                ))}
              </div>
            </div>

            {/* 模式 */}
            <div>
              <label className="block text-sm text-gray-600 mb-2">模式</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode("required")}
                  className={`flex-1 py-3 rounded-xl text-sm font-medium transition ${
                    mode === "required"
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  必须完成
                </button>
                <button
                  type="button"
                  onClick={() => setMode("challenge")}
                  className={`flex-1 py-3 rounded-xl text-sm font-medium transition ${
                    mode === "challenge"
                      ? "bg-amber-500 text-white"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  可选挑战
                </button>
              </div>
            </div>

            {/* 积分 — 溢出修复：小屏纵向排列 */}
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="flex-1 min-w-0">
                <label className="block text-sm text-gray-600 mb-1">基础积分</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPoints((p) => Math.max(1, p - 1))}
                    className="w-10 h-10 flex-shrink-0 rounded-lg bg-gray-100 text-xl"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    value={points}
                    onChange={(e) => setPoints(Math.max(1, parseInt(e.target.value) || 1))}
                    className="flex-1 min-w-0 text-center py-2 rounded-lg border border-gray-200"
                  />
                  <button
                    type="button"
                    onClick={() => setPoints((p) => p + 1)}
                    className="w-10 h-10 flex-shrink-0 rounded-lg bg-gray-100 text-xl"
                  >
                    +
                  </button>
                </div>
              </div>
              {mode === "challenge" && (
                <div className="flex-1 min-w-0">
                  <label className="block text-sm text-gray-600 mb-1">倍率</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setMultiplier((m) => Math.max(1, Math.round((m - 0.5) * 10) / 10))
                      }
                      className="w-10 h-10 flex-shrink-0 rounded-lg bg-gray-100 text-xl"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      step="0.5"
                      value={multiplier}
                      onChange={(e) =>
                        setMultiplier(Math.max(1, parseFloat(e.target.value) || 1))
                      }
                      className="flex-1 min-w-0 text-center py-2 rounded-lg border border-gray-200"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setMultiplier((m) => Math.round((m + 0.5) * 10) / 10)
                      }
                      className="w-10 h-10 flex-shrink-0 rounded-lg bg-gray-100 text-xl"
                    >
                      +
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 截止日期 */}
            <div>
              <label className="block text-sm text-gray-600 mb-1">截止日期（可选）</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 outline-none"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!title.trim() || loading || selectedChildIds.length === 0}
            className="w-full mt-6 bg-indigo-600 text-white py-4 rounded-2xl font-semibold text-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading
              ? "创建中..."
              : selectedChildIds.length > 1
                ? `为 ${selectedChildIds.length} 个孩子创建 · 每人 +${points}🌸`
                : `创建 · 预计 +${points}🌸`}
          </button>
        </div>
      </div>
    </div>
  );
}
