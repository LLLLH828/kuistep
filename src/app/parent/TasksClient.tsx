"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type {
  FamilyMember,
  RewardAccount,
  Task,
  RewardTemplate,
} from "@/types";
import TasksTab from "./TasksTab";
import CreateTaskModal from "./CreateTaskModal";

export default function TasksClient({
  familyId,
  kids,
  initialTasks,
  templates,
  currentUserId,
}: {
  familyId: string;
  kids: (FamilyMember & { account: RewardAccount | null })[];
  initialTasks: Task[];
  templates: RewardTemplate[];
  currentUserId: string;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [tasks, setTasks] = useState(initialTasks);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [activeChildId, setActiveChildId] = useState<string | null>(
    kids[0]?.id || null
  );

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

  const pendingCount = tasks.filter(
    (t) => t.status === "pending" && new Date(t.due_date || "") >= new Date()
  ).length;

  return (
    <main className="min-h-screen bg-gray-50 pb-8">
      {/* 顶栏 */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-30">
        <div className="max-w-lg mx-auto px-3 py-2 flex items-center gap-2">
          <button
            onClick={() => router.push("/parent")}
            className="flex-shrink-0 text-sm text-gray-500 hover:text-indigo-600 flex items-center gap-1"
          >
            ‹ 返回
          </button>
          <div className="flex-1 min-w-0 text-center">
            <span className="font-bold text-gray-800 text-sm">📋 任务管理</span>
            {pendingCount > 0 && (
              <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                {pendingCount} 待确认
              </span>
            )}
          </div>
          <div className="w-14 flex-shrink-0" />
        </div>
      </header>

      <div className="max-w-lg mx-auto px-3 py-3">
        <div className="bg-white rounded-2xl border border-gray-100 p-3">
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
      </div>

      {showCreateTask && kids.length > 0 && (
        <CreateTaskModal
          familyId={familyId}
          kids={kids}
          selectedChildIds={activeChildId ? [activeChildId] : kids[0] ? [kids[0].id] : []}
          currentUserId={currentUserId}
          templates={templates}
          scope="family"
          onClose={() => setShowCreateTask(false)}
          onCreated={() => {
            setShowCreateTask(false);
            router.refresh();
          }}
        />
      )}
    </main>
  );
}
