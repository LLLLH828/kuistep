"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LogoutButton() {
  const router = useRouter();

  return (
    <button
      onClick={async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        router.replace("/login");
      }}
      className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium active:scale-95 transition"
    >
      退出并重新登录
    </button>
  );
}
