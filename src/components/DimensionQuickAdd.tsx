"use client";

import { useState, useMemo } from "react";
import type { Dimension, RewardTransaction } from "@/types";
import { DIMENSION_LABELS, DIMENSION_COLORS } from "@/types";

interface DimensionQuickAddProps {
  childId: string;
  txns: RewardTransaction[];
  onAdd: (dimension: Dimension, points: number, reason: string) => Promise<void>;
}

// 加分常用分值档位
const PLUS_PRESETS = [1, 2, 5, 10];
const MINUS_PRESETS = [1, 2, 5];

export default function DimensionQuickAdd({ childId, txns, onAdd }: DimensionQuickAddProps) {
  // 当前展开的维度（null = 全部收起）
  const [openDim, setOpenDim] = useState<Dimension | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 当天统计：每个维度加了几次、共几分
  const todayStats = useMemo(() => {
    const map: Record<string, { count: number; pos: number; neg: number }> = {};
    (Object.keys(DIMENSION_LABELS) as Dimension[]).forEach((d) => {
      map[d] = { count: 0, pos: 0, neg: 0 };
    });
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    txns.forEach((t) => {
      const tDate = new Date(t.created_at);
      const tKey = `${tDate.getFullYear()}-${String(tDate.getMonth() + 1).padStart(2, "0")}-${String(tDate.getDate()).padStart(2, "0")}`;
      if (tKey !== todayKey) return;
      const key = t.dimension ?? "custom";
      if (map[key]) {
        map[key].count++;
        if (t.points > 0) map[key].pos += t.points;
        else map[key].neg += t.points;
      }
    });
    return map;
  }, [txns]);

  const handlePick = async (dim: Dimension, points: number) => {
    if (submitting) return;
    setSubmitting(true);
    await onAdd(dim, points, `${DIMENSION_LABELS[dim]} ${points > 0 ? "+" : ""}${points}`);
    setSubmitting(false);
    setOpenDim(null);
  };

  const dims: Dimension[] = ["de", "zhi", "ti", "mei", "lao"];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-3 space-y-2">
      {/* 标题行 */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-gray-500 font-medium">🎨 快速加分 · 德智体美劳</span>
        <span className="text-[10px] text-gray-400">点击颜色选分值</span>
      </div>

      {/* 5 维颜色按钮横排 */}
      <div className="grid grid-cols-5 gap-2">
        {dims.map((dim) => {
          const color = DIMENSION_COLORS[dim];
          const st = todayStats[dim];
          const isOpen = openDim === dim;
          const todayNet = st.pos + st.neg;

          return (
            <div key={dim} className="space-y-1">
              <button
                onClick={() => setOpenDim(isOpen ? null : dim)}
                className={`w-full aspect-square rounded-xl flex flex-col items-center justify-center transition-all active:scale-95 ${
                  isOpen ? "ring-2 ring-offset-1" : ""
                }`}
                style={{
                  backgroundColor: `${color}20`,
                  color: color,
                  ...(isOpen ? { boxShadow: `0 0 0 2px ${color}` } : {}),
                }}
                title={DIMENSION_LABELS[dim]}
              >
                <span className="text-lg font-bold leading-none">{DIMENSION_LABELS[dim]}</span>
                <span className="text-[9px] mt-0.5 opacity-70">
                  {todayNet !== 0 ? (todayNet > 0 ? `+${todayNet}` : `${todayNet}`) : st.count > 0 ? `${st.count}次` : ""}
                </span>
              </button>

              {/* 分值选择面板（展开态） */}
              {isOpen && (
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setOpenDim(null)}
                >
                  <div
                    className="absolute left-2 right-2 bottom-2 sm:left-1/2 sm:-translate-x-1/2 sm:max-w-sm bg-white rounded-2xl border border-gray-200 shadow-2xl p-4 z-50 animate-[fadeIn_0.15s_ease-out]"
                    style={{ bottom: "80px" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        <span className="font-semibold text-gray-800">
                          {DIMENSION_LABELS[dim]}方向
                        </span>
                        <span className="text-xs text-gray-400">点击分值快速加分</span>
                      </div>
                      <button
                        onClick={() => setOpenDim(null)}
                        className="text-gray-300 text-lg"
                      >
                        ✕
                      </button>
                    </div>

                    {/* 加分档位 */}
                    <div className="mb-3">
                      <p className="text-[10px] text-gray-400 mb-1.5">加分</p>
                      <div className="flex gap-2 flex-wrap">
                        {PLUS_PRESETS.map((p) => (
                          <button
                            key={`+${p}`}
                            disabled={submitting}
                            onClick={() => handlePick(dim, p)}
                            className="px-3 py-2 rounded-lg text-sm font-semibold bg-green-50 text-green-700 hover:bg-green-100 transition disabled:opacity-50 active:scale-95"
                          >
                            +{p}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 减分档位 */}
                    <div>
                      <p className="text-[10px] text-gray-400 mb-1.5">减分</p>
                      <div className="flex gap-2 flex-wrap">
                        {MINUS_PRESETS.map((p) => (
                          <button
                            key={`-${p}`}
                            disabled={submitting}
                            onClick={() => handlePick(dim, -p)}
                            className="px-3 py-2 rounded-lg text-sm font-semibold bg-red-50 text-red-600 hover:bg-red-100 transition disabled:opacity-50 active:scale-95"
                          >
                            -{p}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 今日统计 */}
                    {st.count > 0 && (
                      <div className="mt-3 pt-2 border-t border-gray-100 text-[10px] text-gray-400">
                        今日 {DIMENSION_LABELS[dim]}方向：{st.count}次 {st.pos > 0 ? `+${st.pos}` : ""}{st.neg !== 0 ? ` ${st.neg}` : ""}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 提示文字 */}
      <p className="text-[10px] text-gray-400 text-center pt-1">
        需要更细的项目？进 ⚙ 奖罚项管理
      </p>
    </div>
  );
}
