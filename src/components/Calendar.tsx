"use client";

import { useState, useMemo } from "react";
import type {
  FamilyMember,
  RewardAccount,
  Task,
  RewardTransaction,
  Dimension,
} from "@/types";

type ViewMode = "year" | "month" | "week" | "day";

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];
const MONTH_LABELS = [
  "1月", "2月", "3月", "4月", "5月", "6月",
  "7月", "8月", "9月", "10月", "11月", "12月",
];

// 任务状态的显示样式
const TASK_STATUS_STYLES: Record<string, { dot: string; text: string; label: string }> = {
  pending:     { dot: "bg-amber-400", text: "text-amber-700",  label: "待做" },
  submitted:   { dot: "bg-blue-400",  text: "text-blue-700",   label: "已提交" },
  confirmed:   { dot: "bg-green-500", text: "text-green-700",  label: "完成" },
  rejected:    { dot: "bg-red-400",   text: "text-red-700",    label: "未通过" },
};

// 维度对应的小圆点颜色（用于月历格子里标记不同奖罚的主维度）
function dimDotColor(dim?: Dimension): string {
  if (!dim) return "bg-gray-400";
  const map: Record<Dimension, string> = {
    de: "bg-amber-400",
    zhi: "bg-blue-400",
    ti: "bg-green-500",
    mei: "bg-purple-400",
    lao: "bg-orange-400",
    custom: "bg-gray-400",
  };
  return map[dim];
}

function toDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface CalendarProps {
  child: FamilyMember & { account: RewardAccount | null };
  txns: RewardTransaction[];
  tasks: Task[];
  onOpenDay: (dayKey: string) => void;
}

export default function Calendar({ child, txns, tasks, onOpenDay }: CalendarProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const total = child.account?.total_points ?? 0;

  // —— 核心数据：按日期聚合奖罚流水 + 任务 ——
  const dailyMap = useMemo(() => {
    const map: Record<string, {
      net: number;
      pos: number;
      neg: number;
      posCount: number;
      negCount: number;
      dims: Set<Dimension>;       // 出现过的维度（用于彩色小点）
      tasks: Task[];               // 当天到期的任务
    }> = {};

    // 聚合奖罚流水
    txns.forEach((t) => {
      const day = toDayKey(new Date(t.created_at));
      if (!map[day]) map[day] = { net: 0, pos: 0, neg: 0, posCount: 0, negCount: 0, dims: new Set(), tasks: [] };
      map[day].net += t.points;
      if (t.points > 0) { map[day].pos += t.points; map[day].posCount++; }
      if (t.points < 0) { map[day].neg += t.points; map[day].negCount++; }
      if (t.dimension) map[day].dims.add(t.dimension);
    });

    // 聚合任务（按 due_date 归属）
    tasks.forEach((t) => {
      if (!t.due_date) return;
      const day = toDayKey(new Date(t.due_date));
      if (!map[day]) map[day] = { net: 0, pos: 0, neg: 0, posCount: 0, negCount: 0, dims: new Set(), tasks: [] };
      map[day].tasks.push(t);
    });

    return map;
  }, [txns, tasks]);

  // 当月统计（正负分 + 任务数 + 完成率）
  const monthStats = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    let pos = 0, neg = 0;
    let taskTotal = 0, taskConfirmed = 0, taskPending = 0;
    Object.entries(dailyMap).forEach(([day, v]) => {
      const d = new Date(day);
      if (d.getFullYear() !== year || d.getMonth() !== month) return;
      if (v.net > 0) pos += v.net;
      if (v.net < 0) neg += v.net;
      v.tasks.forEach((t) => {
        taskTotal++;
        if (t.status === "confirmed") taskConfirmed++;
        else if (t.status !== "rejected") taskPending++; // pending/submitted 算待完成
      });
    });
    return { pos, neg, taskTotal, taskConfirmed, taskPending };
  }, [dailyMap, cursor]);

  const today = new Date();

  // =================== 视图切换 ===================
  const viewHeader = (
    <div className="flex items-center justify-between mb-3">
      {/* 左：累计分数 */}
      <div>
        <div className="flex items-center gap-1.5">
          <span className="text-2xl">🌸</span>
          <span className="text-3xl font-bold text-indigo-600 tabular-nums">{total}</span>
        </div>
        <p className="text-[10px] text-gray-400 mt-0.5">
          {child.nickname} · 累计 {child.account?.lifetime_points ?? 0}
        </p>
      </div>

      {/* 中：上/下箭头 */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            if (viewMode === "year") setCursor(new Date(cursor.getFullYear() - 1, 0, 1));
            else if (viewMode === "month") setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
            else if (viewMode === "week") setCursor(new Date(cursor.getTime() - 7 * 24 * 3600 * 1000));
            else /* day */ setCursor(new Date(cursor.getTime() - 24 * 3600 * 1000));
          }}
          className="w-7 h-7 rounded-lg border border-gray-200 text-gray-500 flex items-center justify-center hover:bg-gray-50"
        >‹</button>
        <span className="text-sm font-semibold text-gray-700 w-28 text-center">
          {viewMode === "year" ? `${cursor.getFullYear()}年`
           : viewMode === "month" ? `${cursor.getFullYear()}年${cursor.getMonth() + 1}月`
           : viewMode === "week" ? formatWeekLabel(cursor)
           : formatDayLabel(cursor)}
        </span>
        <button
          onClick={() => {
            if (viewMode === "year") setCursor(new Date(cursor.getFullYear() + 1, 0, 1));
            else if (viewMode === "month") setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));
            else if (viewMode === "week") setCursor(new Date(cursor.getTime() + 7 * 24 * 3600 * 1000));
            else /* day */ setCursor(new Date(cursor.getTime() + 24 * 3600 * 1000));
          }}
          className="w-7 h-7 rounded-lg border border-gray-200 text-gray-500 flex items-center justify-center hover:bg-gray-50"
        >›</button>
      </div>

      {/* 右：视图切换 */}
      <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5 text-[11px]">
        {(["year", "month", "week", "day"] as ViewMode[]).map((vm) => (
          <button
            key={vm}
            onClick={() => setViewMode(vm)}
            className={`px-2 py-1 rounded transition ${viewMode === vm ? "bg-white text-indigo-600 shadow" : "text-gray-400"}`}
          >
            {vm === "year" ? "年" : vm === "month" ? "月" : vm === "week" ? "周" : "日"}
          </button>
        ))}
      </div>
    </div>
  );

  // =================== 统计条（月/周/日视图显示，四张小卡片） ===================
  const statsBar = viewMode !== "year" ? (
    <div className="grid grid-cols-4 gap-1.5 mb-3">
      <StatCard
        label="净分"
        value={monthStats.pos + monthStats.neg === 0 ? "—" : (monthStats.pos + monthStats.neg > 0 ? `+${monthStats.pos + monthStats.neg}` : String(monthStats.pos + monthStats.neg))}
        tone={monthStats.pos + monthStats.neg > 0 ? "green" : monthStats.pos + monthStats.neg < 0 ? "red" : "gray"}
      />
      <StatCard label="加分" value={monthStats.pos > 0 ? `+${monthStats.pos}` : "—"} tone={monthStats.pos > 0 ? "green" : "gray"} />
      <StatCard label="减分" value={monthStats.neg < 0 ? String(monthStats.neg) : "—"} tone={monthStats.neg < 0 ? "red" : "gray"} />
      <StatCard
        label="任务"
        value={monthStats.taskTotal > 0 ? `${monthStats.taskConfirmed}/${monthStats.taskTotal}` : "—"}
        tone={monthStats.taskTotal === 0 ? "gray" : monthStats.taskPending > 0 ? "amber" : "green"}
        sub={monthStats.taskPending > 0 ? `${monthStats.taskPending}待做` : undefined}
      />
    </div>
  ) : null;

  // =================== 月视图 ===================
  const monthView = () => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstDay = new Date(year, month, 1);
    const startWeekday = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

    return (
      <>
        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAY_LABELS.map((w) => (
            <div key={w} className="text-center text-[10px] text-gray-400 py-0.5">{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((date, i) => {
            if (!date) return <div key={i} className="aspect-square" />;
            const dayKey = toDayKey(date);
            const data = dailyMap[dayKey];
            const isToday =
              date.getDate() === today.getDate() &&
              date.getMonth() === today.getMonth() &&
              date.getFullYear() === today.getFullYear();

            // 热力背景 + 分数颜色
            let bg = "bg-gray-50";
            let numColor = "text-gray-400";
            if (data) {
              if (data.net > 0) {
                numColor = "text-green-700";
                const abs = Math.min(Math.abs(data.net), 10);
                bg = abs < 3 ? "bg-green-100" : abs < 6 ? "bg-green-200" : "bg-green-300";
              } else if (data.net < 0) {
                numColor = "text-red-600";
                bg = "bg-red-100";
              } else if (data.tasks.length > 0) {
                bg = "bg-amber-50";
              }
            }

            const taskCount = data?.tasks.length ?? 0;
            const confirmedCount = data
              ? data.tasks.filter((t) => t.status === "confirmed").length
              : 0;
            const allDone = taskCount > 0 && confirmedCount === taskCount;

            return (
              <button
                key={i}
                onClick={() => onOpenDay(dayKey)}
                className={`aspect-square rounded-lg ${bg} ${isToday ? "ring-2 ring-indigo-500 ring-offset-1" : ""} flex flex-col items-center justify-center relative cursor-pointer transition hover:ring-1 hover:ring-indigo-300 active:scale-95`}
              >
                {/* 日期数字（左上角） */}
                <span className={`absolute top-0.5 left-1 text-[9px] font-semibold leading-none ${numColor}`}>
                  {date.getDate()}
                </span>

                {/* 中央分数（加粗放大） */}
                {data && data.net !== 0 && (
                  <span className={`text-[13px] font-extrabold leading-none ${numColor}`}>
                    {data.net > 0 ? "+" : ""}{data.net}
                  </span>
                )}
                {(!data || data.net === 0) && taskCount > 0 && (
                  <span className="text-[11px] leading-none">📋</span>
                )}

                {/* 任务完成进度 pill（底部居中） */}
                {taskCount > 0 && (
                  <span
                    className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 px-1 rounded-full text-[7px] font-bold leading-[11px] text-white ${allDone ? "bg-green-500" : "bg-amber-400"}`}
                  >
                    {confirmedCount}/{taskCount}
                  </span>
                )}

                {/* 维度小点（左下角，最多 2 个） */}
                {data && data.dims.size > 0 && (
                  <span className="absolute bottom-0.5 left-1 flex gap-px">
                    {Array.from(data.dims).slice(0, 2).map((d, di) => (
                      <span key={di} className={`w-1 h-1 rounded-full ${dimDotColor(d)}`} />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </>
    );
  };

  // =================== 周视图 ===================
  const [weekMode, setWeekMode] = useState<"points" | "tasks">("points");
  const weekView = () => {
    // 找到 cursor 所在周的周日
    const startOfWeek = new Date(cursor);
    startOfWeek.setDate(cursor.getDate() - cursor.getDay());
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      return d;
    });

    return (
      <div className="space-y-2">
        {/* 切换条 */}
        <div className="flex bg-gray-100 rounded-lg p-0.5 text-[11px]">
          <button
            onClick={() => setWeekMode("points")}
            className={`flex-1 py-1 rounded-md font-medium transition ${
              weekMode === "points" ? "bg-white shadow text-indigo-600" : "text-gray-500"
            }`}
          >
            🌸 积分
          </button>
          <button
            onClick={() => setWeekMode("tasks")}
            className={`flex-1 py-1 rounded-md font-medium transition ${
              weekMode === "tasks" ? "bg-white shadow text-indigo-600" : "text-gray-500"
            }`}
          >
            📋 任务
          </button>
        </div>

        {days.map((d) => {
          const dayKey = toDayKey(d);
          const data = dailyMap[dayKey];
          const isToday = toDayKey(d) === toDayKey(today);

          return (
            <div
              key={dayKey}
              onClick={() => onOpenDay(dayKey)}
              className={`rounded-lg border p-2 cursor-pointer transition ${
                isToday ? "border-indigo-400 bg-indigo-50/30" : "border-gray-100 bg-white hover:bg-gray-50"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-semibold ${isToday ? "text-indigo-600" : "text-gray-700"}`}>
                  {WEEKDAY_LABELS[d.getDay()]}
                </span>
                <span className="text-[10px] text-gray-400">{d.getMonth() + 1}月{d.getDate()}日</span>
                {data && data.net !== 0 && (
                  <span className={`text-[11px] font-bold ${data.net > 0 ? "text-green-600" : "text-red-500"}`}>
                    {data.net > 0 ? "+" : ""}{data.net}
                  </span>
                )}
              </div>

              {weekMode === "points" ? (
                // 积分模式：只显示奖罚流水
                <>
                  {data && data.posCount + data.negCount > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {(txns.filter(t => toDayKey(new Date(t.created_at)) === dayKey)).slice(0, 5).map((t) => (
                        <span
                          key={t.id}
                          className={`text-[10px] px-1 py-0.5 rounded ${
                            t.points > 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
                          }`}
                          title={`${t.reason} ${t.points > 0 ? "+" : ""}${t.points}`}
                        >
                          {t.reason.slice(0, 6)}{t.reason.length > 6 ? "…" : ""} {t.points > 0 ? "+" : ""}{t.points}
                        </span>
                      ))}
                    </div>
                  )}
                  {(!data || data.posCount + data.negCount === 0) && (
                    <p className="text-[10px] text-gray-300">—</p>
                  )}
                </>
              ) : (
                // 任务模式：只显示任务
                <>
                  {data && data.tasks.length > 0 ? (
                    <div className="space-y-0.5">
                      {data.tasks.map((t) => {
                        const st = TASK_STATUS_STYLES[t.status] || TASK_STATUS_STYLES.pending;
                        return (
                          <div key={t.id} className="flex items-center gap-1.5 text-[10px]">
                            <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                            <span className="text-gray-600 truncate flex-1">
                              {t.status === "confirmed" ? "✓ " : ""}{t.title}
                            </span>
                            <span className="text-gray-400">{st.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-[10px] text-gray-300">—</p>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // =================== 日视图 ===================
  const dayView = () => {
    const dayKey = toDayKey(cursor);
    const data = dailyMap[dayKey];
    const dayTxns = txns.filter((t) => toDayKey(new Date(t.created_at)) === dayKey);
    const dayTasks = data?.tasks ?? [];

    return (
      <div className="space-y-2">
        {/* 当日统计 */}
        <div className="flex gap-3 text-xs mb-2">
          <span className="text-green-600">当日 +{data?.pos ?? 0}</span>
          {(data?.neg ?? 0) !== 0 && <span className="text-red-500">{data?.neg ?? 0}</span>}
          {(data?.net ?? 0) !== 0 && (
            <span className={`font-bold ${data!.net > 0 ? "text-green-700" : "text-red-600"}`}>
              净 {data!.net > 0 ? "+" : ""}{data!.net}
            </span>
          )}
        </div>

        {/* 任务 */}
        {dayTasks.length > 0 && (
          <div className="space-y-1">
            <p className="text-[11px] text-gray-400 font-medium">📋 任务</p>
            {dayTasks.map((t) => {
              const st = TASK_STATUS_STYLES[t.status] || TASK_STATUS_STYLES.pending;
              return (
                <div key={t.id} className={`flex items-center gap-2 p-2 rounded-lg border ${
                  t.status === "confirmed" ? "border-green-200 bg-green-50/40"
                  : t.status === "rejected" ? "border-red-200 bg-red-50/40"
                  : "border-gray-100 bg-white"
                }`}>
                  <span className={`w-2 h-2 rounded-full ${st.dot}`} />
                  <span className={`text-xs flex-1 ${t.status === "confirmed" ? "line-through text-gray-400" : "text-gray-700"}`}>
                    {t.title}
                  </span>
                  <span className={`text-[10px] ${st.text}`}>{st.label}</span>
                  <span className="text-[10px] text-indigo-500">+{t.points_reward}{t.mode === "challenge" ? `×${t.points_multiplier}` : ""}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* 流水 */}
        {dayTxns.length > 0 && (
          <div className="space-y-1">
            <p className="text-[11px] text-gray-400 font-medium">🌸 奖罚</p>
            {dayTxns.map((t) => (
              <div key={t.id} className={`flex items-center gap-2 p-2 rounded-lg border ${
                t.points > 0 ? "border-green-200 bg-green-50/40" : "border-red-200 bg-red-50/40"
              }`}>
                <span className={`w-2 h-2 rounded-full ${t.points > 0 ? "bg-green-500" : "bg-red-500"}`} />
                <span className="text-xs flex-1 text-gray-700">{t.reason}</span>
                <span className={`text-[11px] font-bold ${t.points > 0 ? "text-green-600" : "text-red-500"}`}>
                  {t.points > 0 ? "+" : ""}{t.points}
                </span>
              </div>
            ))}
          </div>
        )}

        {!dayTasks.length && !dayTxns.length && (
          <p className="text-[11px] text-gray-300 text-center py-6">当日无记录</p>
        )}
      </div>
    );
  };

  // =================== 年视图 ===================
  const yearView = () => {
    const year = cursor.getFullYear();
    return (
      <div className="grid grid-cols-3 gap-2">
        {MONTH_LABELS.map((label, mi) => {
          const firstDay = new Date(year, mi, 1);
          const startWeekday = firstDay.getDay();
          const daysInMonth = new Date(year, mi + 1, 0).getDate();
          const cells: (Date | null)[] = [];
          for (let i = 0; i < startWeekday; i++) cells.push(null);
          for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, mi, d));

          let monthPos = 0, monthNeg = 0;
          let monthTasks = 0, monthConfirmed = 0;
          Object.entries(dailyMap).forEach(([day, v]) => {
            const d = new Date(day);
            if (d.getFullYear() === year && d.getMonth() === mi) {
              if (v.net > 0) monthPos += v.net;
              if (v.net < 0) monthNeg += v.net;
              v.tasks.forEach((t) => {
                monthTasks++;
                if (t.status === "confirmed") monthConfirmed++;
              });
            }
          });

          return (
            <button
              key={mi}
              onClick={() => { setCursor(new Date(year, mi, 1)); setViewMode("month"); }}
              className="p-2 rounded-lg border border-gray-100 bg-white hover:bg-indigo-50 transition text-left"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-semibold text-gray-700">{label}</span>
                <span className="text-[9px] text-gray-400">
                  {monthPos + monthNeg !== 0 ? `${monthPos + monthNeg > 0 ? "+" : ""}${monthPos + monthNeg}` : ""}
                  {monthTasks > 0 ? ` · 任务 ${monthConfirmed}/${monthTasks}` : ""}
                </span>
              </div>
              <div className="grid grid-cols-7 gap-px">
                {cells.slice(0, 28).map((date, i) => {
                  if (!date) return <div key={i} className="aspect-square" />;
                  const dayKey = toDayKey(date);
                  const data = dailyMap[dayKey];
                  let bg = "bg-gray-50";
                  if (data) {
                    if (data.net > 0) bg = "bg-green-200";
                    else if (data.net < 0) bg = "bg-red-100";
                    else if (data.tasks.length > 0) bg = "bg-amber-100";
                  }
                  return <div key={i} className={`aspect-square rounded-sm ${bg}`} />;
                })}
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      {viewHeader}
      {statsBar}
      {viewMode === "year" ? yearView()
        : viewMode === "month" ? monthView()
        : viewMode === "week" ? weekView()
        : dayView()}

      {/* 图例（仅月视图显示） */}
      {viewMode === "month" && (
        <div className="flex items-center justify-end gap-2.5 mt-2 text-[9px] text-gray-400 flex-wrap">
          <span className="flex items-center gap-1">
            <span className="px-1 rounded-full bg-amber-400 text-white text-[7px] font-bold leading-[11px]">1/3</span>任务进行
          </span>
          <span className="flex items-center gap-1">
            <span className="px-1 rounded-full bg-green-500 text-white text-[7px] font-bold leading-[11px]">2/2</span>全完成
          </span>
          <span className="w-px h-3 bg-gray-200" />
          <span>分数：少</span>
          <span className="w-3 h-3 rounded bg-green-100" />
          <span className="w-3 h-3 rounded bg-green-200" />
          <span className="w-3 h-3 rounded bg-green-300" />
          <span>多</span>
        </div>
      )}
    </div>
  );
}

// =================== 统计小卡片 ===================
function StatCard({ label, value, tone, sub }: {
  label: string;
  value: string;
  tone: "green" | "red" | "amber" | "gray";
  sub?: string;
}) {
  const toneClass = {
    green: "text-green-600",
    red: "text-red-500",
    amber: "text-amber-600",
    gray: "text-gray-600",
  }[tone];
  return (
    <div className="bg-gray-50 rounded-lg border border-gray-100 py-1.5 px-1 text-center">
      <p className="text-[9px] text-gray-400 leading-none mb-1">{label}</p>
      <p className={`text-[13px] font-extrabold leading-none tabular-nums ${toneClass}`}>{value}</p>
      {sub ? (
        <p className="text-[8px] text-amber-500 mt-0.5 leading-none">{sub}</p>
      ) : (
        <p className="text-[8px] mt-0.5 leading-none invisible">·</p>
      )}
    </div>
  );
}

// =================== 辅助 ===================
function formatWeekLabel(cursor: Date): string {
  const start = new Date(cursor);
  start.setDate(cursor.getDate() - cursor.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const sameMonth = start.getMonth() === end.getMonth();
  if (sameMonth) return `${start.getMonth() + 1}月${start.getDate()}日–${end.getDate()}日`;
  return `${start.getMonth() + 1}月${start.getDate()}–${end.getMonth() + 1}月${end.getDate()}`;
}
function formatDayLabel(cursor: Date): string {
  return `${cursor.getMonth() + 1}月${cursor.getDate()}日 周${WEEKDAY_LABELS[cursor.getDay()]}`;
}
