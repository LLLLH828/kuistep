"use client";

import { useMemo } from "react";
import type { Task, RewardTransaction, Dimension } from "@/types";
import { DIMENSION_LABELS, DIMENSION_COLORS } from "@/types";

interface TaskStatsProps {
  tasks: Task[];
  txns: RewardTransaction[];
  childId?: string; // 可选：只看某个孩子的数据
}

function toDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function TaskStats({ tasks, txns, childId }: TaskStatsProps) {
  const filteredTxns = useMemo(
    () => (childId ? txns.filter((t) => t.member_id === childId) : txns),
    [txns, childId]
  );
  const filteredTasks = useMemo(
    () => (childId ? tasks.filter((t) => t.child_member_id === childId) : tasks),
    [tasks, childId]
  );

  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // —— 统计：本周任务 ——
  const weekTaskStats = useMemo(() => {
    let total = 0, confirmed = 0, pending = 0, expired = 0;
    filteredTasks.forEach((t) => {
      const due = t.due_date ? new Date(t.due_date) : null;
      // 只要 due_date 落在本周内就算（没 due_date 不算）
      if (due) {
        // 用 UTC 午夜比较避免时区偏移
        const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
        if (dueDay >= startOfWeek) {
          total++;
          if (t.status === "confirmed") confirmed++;
          else if (t.status === "pending" && dueDay < now) expired++;
          else if (t.status !== "rejected") pending++;
        }
      }
    });
    const rate = total > 0 ? Math.round((confirmed / total) * 100) : 0;
    return { total, confirmed, pending, expired, rate };
  }, [filteredTasks, startOfWeek]);

  // —— 统计：本月分数 ——
  const monthScoreStats = useMemo(() => {
    let pos = 0, neg = 0;
    filteredTxns.forEach((t) => {
      const d = new Date(t.created_at);
      if (d >= startOfMonth) {
        if (t.points > 0) pos += t.points;
        else neg += t.points;
      }
    });
    return { pos, neg, net: pos + neg };
  }, [filteredTxns, startOfMonth]);

  // —— 统计：维度分布（本月） ——
  const dimensionStats = useMemo(() => {
    const dims: Record<string, { points: number; count: number }> = {};
    (Object.keys(DIMENSION_LABELS) as Dimension[]).forEach((d) => {
      dims[d] = { points: 0, count: 0 };
    });
    filteredTxns.forEach((t) => {
      const d = new Date(t.created_at);
      if (d >= startOfMonth) {
        const key = t.dimension ?? "custom";
        if (dims[key]) {
          dims[key].points += t.points;
          dims[key].count++;
        }
      }
    });
    return Object.entries(dims)
      .map(([key, v]) => ({ dim: key as Dimension, ...v }))
      .filter((v) => v.count > 0 || v.points !== 0)
      .sort((a, b) => b.points - a.points);
  }, [filteredTxns, startOfMonth]);

  // —— 统计：每日趋势（近 7 天） ——
  const dailyTrend = useMemo(() => {
    const days: { day: string; pos: number; neg: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const dayKey = toDayKey(d);
      let pos = 0, neg = 0;
      filteredTxns.forEach((t) => {
        if (toDayKey(new Date(t.created_at)) === dayKey) {
          if (t.points > 0) pos += t.points;
          else neg += t.points;
        }
      });
      days.push({ day: `${d.getMonth() + 1}/${d.getDate()}`, pos, neg });
    }
    return days;
  }, [filteredTxns, now]);

  const maxBar = Math.max(10, ...dailyTrend.map((d) => d.pos), ...dailyTrend.map((d) => Math.abs(d.neg)));

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-4">
      <h3 className="font-semibold text-gray-700 text-sm">📊 任务统计</h3>

      {/* 顶部：本周完成率 + 本月净分（两列） */}
      <div className="grid grid-cols-2 gap-3">
        {/* 本周任务卡 */}
        <div className="bg-gradient-to-br from-indigo-50 to-white rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-sm">✅</span>
            <span className="text-xs text-gray-500">本周任务</span>
          </div>
          <div className="text-2xl font-bold text-indigo-600 tabular-nums">
            {weekTaskStats.confirmed}
            <span className="text-sm text-gray-400 font-normal">
              /{weekTaskStats.total}
            </span>
          </div>
          {weekTaskStats.total > 0 && (
            <>
              <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all"
                  style={{ width: `${weekTaskStats.rate}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-1 text-[10px] text-gray-400">
                <span>完成率 {weekTaskStats.rate}%</span>
                {weekTaskStats.expired > 0 && (
                  <span className="text-red-500">过期 {weekTaskStats.expired}</span>
                )}
              </div>
            </>
          )}
        </div>

        {/* 本月净分卡 */}
        <div className="bg-gradient-to-br from-green-50 to-white rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-sm">🌸</span>
            <span className="text-xs text-gray-500">本月得分</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span
              className={`text-2xl font-bold tabular-nums ${
                monthScoreStats.net > 0
                  ? "text-green-600"
                  : monthScoreStats.net < 0
                  ? "text-red-500"
                  : "text-gray-400"
              }`}
            >
              {monthScoreStats.net > 0 ? "+" : ""}
              {monthScoreStats.net}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-2 text-[10px]">
            <span className="text-green-600">+{monthScoreStats.pos}</span>
            <span className="text-red-500">{monthScoreStats.neg}</span>
            <span className="text-gray-400">净</span>
          </div>
        </div>
      </div>

      {/* 维度分布（本月） */}
      {dimensionStats.length > 0 && (
        <div>
          <p className="text-[11px] text-gray-400 mb-2">📈 维度分布（本月）</p>
          <div className="space-y-1.5">
            {dimensionStats.map((d) => {
              const maxPoints = Math.max(...dimensionStats.map((x) => Math.abs(x.points)), 1);
              const widthPercent = Math.max(2, Math.round((Math.abs(d.points) / maxPoints) * 100));
              return (
                <div key={d.dim} className="flex items-center gap-2">
                  <span
                    className="text-[11px] font-semibold w-5 text-center"
                    style={{ color: DIMENSION_COLORS[d.dim] }}
                  >
                    {DIMENSION_LABELS[d.dim]}
                  </span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${widthPercent}%`,
                        backgroundColor: DIMENSION_COLORS[d.dim],
                      }}
                    />
                  </div>
                  <span
                    className={`text-[11px] font-mono tabular-nums w-10 text-right ${
                      d.points > 0 ? "text-green-600" : d.points < 0 ? "text-red-500" : "text-gray-400"
                    }`}
                  >
                    {d.points > 0 ? "+" : ""}
                    {d.points}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 近 7 天趋势 */}
      <div>
        <p className="text-[11px] text-gray-400 mb-2">📅 近 7 天</p>
        <div className="flex items-end gap-1 h-16 px-1">
          {dailyTrend.map((d, i) => {
            const posH = Math.round((d.pos / maxBar) * 100);
            const negH = Math.round((Math.abs(d.neg) / maxBar) * 100);
            const isToday = i === dailyTrend.length - 1;
            const isYesterday = i === dailyTrend.length - 2;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                <div className="w-full flex flex-col items-center justify-end flex-1 gap-0.5">
                  {negH > 0 && (
                    <div
                      className="w-full max-w-[12px] bg-red-300 rounded-sm"
                      style={{ height: `${negH}%`, minHeight: negH > 0 ? "3px" : "0" }}
                    />
                  )}
                  {posH > 0 && (
                    <div
                      className="w-full max-w-[12px] bg-green-400 rounded-sm"
                      style={{ height: `${posH}%`, minHeight: posH > 0 ? "3px" : "0" }}
                    />
                  )}
                </div>
                <span
                  className={`text-[8px] ${
                    isToday ? "text-indigo-500 font-semibold" : "text-gray-300"
                  }`}
                >
                  {isToday ? "今" : isYesterday ? "昨" : d.day.split("/")[1]}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
