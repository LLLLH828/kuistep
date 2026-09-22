"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { FamilyMember, RewardAccount, Task, RewardTransaction } from "@/types";
import { DIMENSION_LABELS } from "@/types";
import MiniCalendar from "@/components/MiniCalendar";

interface Props {
  childMember: FamilyMember;
  account: RewardAccount;
  tasks: Task[];           // 未完成任务（active）
  allTasks: Task[];        // 全部任务（含 confirmed，给日历用）
  txns: RewardTransaction[];
}

function toDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function KidHome({ childMember, account, tasks: initialTasks, allTasks, txns }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [tasks, setTasks] = useState(initialTasks);
  const [showCongrats, setShowCongrats] = useState(false);
  const [justEarned, setJustEarned] = useState(0);

  // —— 今日统计 ——
  const todayStats = useMemo(() => {
    const todayKey = toDayKey(new Date());
    let todayPos = 0, todayNeg = 0;
    txns.forEach((t) => {
      if (toDayKey(new Date(t.created_at)) === todayKey) {
        if (t.points > 0) todayPos += t.points;
        else todayNeg += t.points;
      }
    });
    // 今日任务（含已完成的）
    const todayAllTasks = allTasks.filter((t) => t.due_date && toDayKey(new Date(t.due_date)) === todayKey);
    const todayConfirmed = todayAllTasks.filter((t) => t.status === "confirmed").length;
    return {
      net: todayPos + todayNeg,
      pos: todayPos,
      neg: todayNeg,
      taskTotal: todayAllTasks.length,
      taskDone: todayConfirmed,
    };
  }, [txns, allTasks]);

  // —— streak（连续完成天数） ——
  const streak = useMemo(() => {
    let count = 0;
    const checkDate = new Date();
    while (true) {
      const key = toDayKey(checkDate);
      const dayTxns = txns.filter((t) => toDayKey(new Date(t.created_at)) === key);
      const dayPos = dayTxns.reduce((s, t) => s + (t.points > 0 ? t.points : 0), 0);
      const dayTasks = allTasks.filter(
        (t) => t.due_date && toDayKey(new Date(t.due_date)) === key
      );
      const allDone = dayTasks.length > 0 && dayTasks.every((t) => t.status === "confirmed");
      const hasPositive = dayPos > 0 || (dayTasks.length === 0 && dayTxns.length > 0 && dayPos === 0);
      if (dayPos > 0 || allDone || hasPositive) {
        count++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }
    return count;
  }, [txns, allTasks]);

  const handleComplete = async (task: Task) => {
    const { error } = await supabase
      .from("tasks")
      .update({ status: "submitted" })
      .eq("id", task.id);
    if (!error) {
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: "submitted" as const } : t))
      );
    }
  };

  const handleQuickComplete = async (task: Task) => {
    const earned = task.points_reward * (task.mode === "challenge" ? task.points_multiplier : 1);
    const { error } = await supabase
      .from("tasks")
      .update({ status: "confirmed" })
      .eq("id", task.id);
    if (!error) {
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
      setJustEarned(Math.round(earned));
      setShowCongrats(true);
      setTimeout(() => {
        setShowCongrats(false);
        router.refresh();
      }, 1500);
    }
  };

  const completionRate = todayStats.taskTotal > 0
    ? Math.round((todayStats.taskDone / todayStats.taskTotal) * 100)
    : 0;

  return (
    <main className="min-h-screen bg-gradient-to-b from-purple-100 via-white to-indigo-50 pb-28">
      {/* 恭喜动画 */}
      {showCongrats && (
        <div className="fixed inset-0 bg-white/80 flex items-center justify-center z-50 pointer-events-none">
          <div className="text-center flower-pop">
            <div className="text-8xl mb-4">🌸</div>
            <div className="text-3xl font-bold text-purple-600">
              +{justEarned} 小红花！
            </div>
            <div className="text-gray-500 mt-2">做得好！</div>
          </div>
        </div>
      )}

      {/* 顶部 - 小红花账户 */}
      <header className="pt-8 pb-4 px-6 text-center">
        <div className="text-sm text-purple-500 mb-2">你好，{childMember.nickname}！</div>
        <div className="relative inline-block">
          <div className="text-8xl">🌸</div>
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-purple-600 text-white text-2xl font-bold px-4 py-1 rounded-full shadow-lg">
            {account.total_points}
          </div>
        </div>
        <div className="text-xs text-gray-400 mt-4">
          累计 {account.lifetime_points} 朵
          {streak >= 3 && (
            <span className="ml-2 text-orange-500 font-semibold">🔥 {streak} 天连续</span>
          )}
        </div>
      </header>

      <div className="max-w-md mx-auto px-4 space-y-4">
        {/* 今日进度卡 */}
        <section>
          <div className="bg-gradient-to-r from-purple-500 to-indigo-500 rounded-2xl p-4 text-white shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-xs opacity-80">今日进度</div>
                <div className="text-3xl font-bold tabular-nums mt-0.5">
                  🌸 +{todayStats.pos}
                  {todayStats.neg < 0 && (
                    <span className="text-red-200 text-xl ml-1">{todayStats.neg}</span>
                  )}
                </div>
              </div>
              {streak >= 3 && (
                <div className="text-center bg-white/20 rounded-xl px-3 py-2">
                  <div className="text-2xl">🔥</div>
                  <div className="text-[11px] font-semibold">{streak}天</div>
                </div>
              )}
            </div>

            {/* 任务完成进度 */}
            {todayStats.taskTotal > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs opacity-90">
                  <span>📋 今日任务</span>
                  <span>{todayStats.taskDone}/{todayStats.taskTotal} · {completionRate}%</span>
                </div>
                <div className="h-2 bg-white/30 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white rounded-full transition-all"
                    style={{ width: `${completionRate}%` }}
                  />
                </div>
              </div>
            )}

            {todayStats.taskTotal === 0 && todayStats.pos === 0 && (
              <div className="text-xs opacity-80">今天还没有记录，加油呀！ 💪</div>
            )}
          </div>
        </section>

        {/* 小日历 */}
        <section>
          <MiniCalendar txns={txns} tasks={allTasks} />
        </section>

        {/* 今日任务 */}
        <section>
          <h2 className="text-lg font-bold text-gray-700 mb-3 flex items-center gap-2">
            <span>📋 今日任务</span>
            {tasks.length > 0 && (
              <span className="text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full">
                {tasks.length}个待做
              </span>
            )}
          </h2>

          <div className="space-y-3">
            {tasks.length === 0 && (
              <div className="card text-center py-12">
                <div className="text-5xl mb-3">🎉</div>
                <p className="text-gray-500">暂时没有任务，去玩一会儿吧！</p>
              </div>
            )}
            {tasks.map((task) => (
              <KidTaskCard
                key={task.id}
                task={task}
                onComplete={() => handleComplete(task)}
                onQuickComplete={() => handleQuickComplete(task)}
              />
            ))}
          </div>
        </section>

        {/* 兑换商城入口 */}
        <section className="mt-4 mb-4">
          <h2 className="text-lg font-bold text-gray-700 mb-3">🎁 心愿商城</h2>
          <div className="bg-white rounded-2xl border border-purple-100 text-center py-6">
            <div className="text-4xl mb-2">🎁</div>
            <p className="text-gray-500 text-sm">
              攒够小红花可以兑换你想要的东西哦~
            </p>
            <button className="mt-3 bg-purple-100 text-purple-600 px-6 py-2 rounded-full text-sm font-medium">
              去看看（敬请期待）
            </button>
          </div>
        </section>
      </div>

      {/* 底部导航 */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 py-2">
        <div className="max-w-md mx-auto flex justify-around text-center text-xs text-gray-400">
          <button className="flex flex-col items-center text-purple-600">
            <span className="text-xl">🏠</span>
            <span>首页</span>
          </button>
          <button className="flex flex-col items-center">
            <span className="text-xl">📚</span>
            <span>学习</span>
          </button>
          <button className="flex flex-col items-center">
            <span className="text-xl">🎁</span>
            <span>商城</span>
          </button>
        </div>
      </nav>
    </main>
  );
}

function KidTaskCard({
  task,
  onComplete,
  onQuickComplete,
}: {
  task: Task;
  onComplete: () => void;
  onQuickComplete: () => void;
}) {
  const earnedPoints = Math.round(
    task.points_reward * (task.mode === "challenge" ? task.points_multiplier : 1)
  );

  const statusMap = {
    pending: { text: "点我完成", btn: "bg-purple-500", disabled: false },
    submitted: { text: "等待爸爸妈妈确认", btn: "bg-amber-400", disabled: true },
    confirmed: { text: "已完成 ✓", btn: "bg-green-400", disabled: true },
    rejected: { text: "需要修改", btn: "bg-red-400", disabled: false },
  };
  const s = statusMap[task.status];

  return (
    <div className="bg-white rounded-2xl border-l-4 border-purple-300 p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="font-semibold text-gray-800">{task.title}</div>
          {task.description && (
            <div className="text-xs text-gray-400 mt-1">{task.description}</div>
          )}
          <div className="text-xs text-gray-400 mt-2 flex gap-2">
            <span className="bg-gray-100 px-2 py-0.5 rounded">
              {DIMENSION_LABELS[task.dimension]}
            </span>
            <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded">
              +{earnedPoints}🌸
            </span>
            {task.mode === "challenge" && (
              <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                挑战
              </span>
            )}
            {task.due_date && (
              <span className="text-gray-400">
                📅 {new Date(task.due_date).toLocaleDateString("zh-CN")}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onQuickComplete}
          disabled={s.disabled}
          className={`${s.btn} text-white px-4 py-2 rounded-xl text-sm font-bold shadow active:scale-95 transition-transform disabled:opacity-60`}
        >
          {s.text}
        </button>
      </div>
    </div>
  );
}
