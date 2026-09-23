"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// 未开通老师身份的用户访问 /teacher 时的引导：一键把 user_metadata.is_teacher 置为 true
export default function EnableTeacherButton() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enable = async () => {
    setLoading(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser({
      data: { is_teacher: true },
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.refresh();
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={enable}
        disabled={loading}
        className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-sm font-medium shadow hover:bg-indigo-700 disabled:opacity-50"
      >
        {loading ? "开通中..." : "开通老师身份"}
      </button>
      {error && <p className="text-red-500 text-xs">{error}</p>}
    </div>
  );
}
