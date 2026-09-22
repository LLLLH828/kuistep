"use client";

import { useState, useMemo } from "react";
import type { Task, RewardTransaction } from "@/types";

interface MiniCalendarProps {
  txns: RewardTransaction[];
  tasks: Task[];
  onOpenDay?: (dayKey: string) => void;
}

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

function toDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * 孩子端简化月历：
 *  - 热力背景（绿=正分，红=负分，琥珀=有任务）
 *  - 连续完成 streak 标记（🔥）
 *  - 点击某天回调 onOpenDay
 */
export default function MiniCalendar({ txns, tasks, onOpenDay }: MiniCalendarProps) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const dailyMap = useMemo(() => {
    const map: Record<string, { net: number; hasTask: boolean; allConfirmed: boolean }> = {};
    txns.forEach((t) => {
      const day = toDayKey(new Date(t.created_at));
      if (!map[day]) map[day] = { net: 0, hasTask: false, allConfirmed: false };
      map[day].net += t.points;
    });
    const taskDays: Record<string, Task[]> = {};
    tasks.forEach((t) => {
      if (!t.due_date) return;
      const day = toDayKey(new Date(t.due_date));
      if (!taskDays[day]) taskDays[day] = [];
      taskDays[day].push(t);
      if (!map[day]) map[day] = { net: 0, hasTask: false, allConfirmed: false };
      map[day].hasTask = true;
    });
    Object.entries(taskDays).forEach(([day, arr]) => {
      map[day].allConfirmed = arr.every((t) => t.status === "confirmed");
    });
    return map;
  }, [txns, tasks]);

  // 计算 streak（连续天数，每天有正分或完成任务）
  const streak = useMemo(() => {
    let count = 0;
    const checkDate = new Date();
    // 从今天往前数
    while (true) {
      const key = toDayKey(checkDate);
      const d = dailyMap[key];
      if (d && (d.net > 0 || d.allConfirmed || d.hasTask)) {
        count++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }
    return count;
  }, [dailyMap]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const today = new Date();

  return (
    <div className="bg-white/80 rounded-2xl border border-purple-100 p-4">
      {/* 头部 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <span className="text-base">📅</span>
          <span className="text-sm font-bold text-purple-700">我的日历</span>
          {streak >= 2 && (
            <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full font-semibold">
              🔥 {streak}天
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCursor(new Date(year, month - 1, 1))}
            className="w-7 h-7 rounded-lg bg-purple-50 text-purple-500 flex items-center justify-center text-sm"
          >‹</button>
          <span className="text-sm font-semibold text-purple-600 w-20 text-center">
            {month + 1}月
          </span>
          <button
            onClick={() => setCursor(new Date(year, month + 1, 1))}
            className="w-7 h-7 rounded-lg bg-purple-50 text-purple-500 flex items-center justify-center text-sm"
          >›</button>
        </div>
      </div>

      {/* 星期标签 */}
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {WEEKDAY_LABELS.map((w) => (
          <div key={w} className="text-center text-[10px] text-purple-300 py-0.5">{w}</div>
        ))}
      </div>

      {/* 日期格子 */}
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((date, i) => {
          if (!date) return <div key={i} className="aspect-square" />;
          const dayKey = toDayKey(date);
          const data = dailyMap[dayKey];
          const isToday =
            date.getDate() === today.getDate() &&
            date.getMonth() === today.getMonth() &&
            date.getFullYear() === today.getFullYear();

          let bg = "bg-purple-50/40";
          let textColor = "text-purple-300";
          let emoji: string | null = null;
          if (data) {
            if (data.net > 0) {
              bg = data.net >= 5 ? "bg-green-200" : "bg-green-100";
              textColor = "text-green-700";
              emoji = "🌸";
            } else if (data.net < 0) {
              bg = "bg-red-100";
              textColor = "text-red-500";
            } else if (data.allConfirmed) {
              bg = "bg-green-100";
              textColor = "text-green-600";
              emoji = "✓";
            } else if (data.hasTask) {
              bg = "bg-amber-100";
              textColor = "text-amber-700";
            }
          }

          return (
            <button
              key={i}
              onClick={() => onOpenDay?.(dayKey)}
              className={`aspect-square rounded-lg ${bg} ${
                isToday ? "ring-2 ring-purple-400" : ""
              } flex flex-col items-center justify-center text-[11px] font-medium ${textColor} transition active:scale-95`}
            >
              {emoji ? (
                <span className="text-sm leading-none">{emoji}</span>
              ) : (
                <span>{date.getDate()}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
