"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { UserRole } from "@/types";

type Mode = "login" | "register";

const ROLE_OPTIONS: { value: UserRole; label: string; emoji: string; desc: string }[] = [
  { value: "parent", label: "家长", emoji: "👨‍👩‍👧", desc: "自动创建家庭 + 五维模板；勾选老师后可创建班级" },
  { value: "child", label: "孩子", emoji: "🧒", desc: "用家庭邀请码加入" },
];

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [familyName, setFamilyName] = useState("");  // 仅家长注册用
  const [nickname, setNickname] = useState("");
  const [role, setRole] = useState<UserRole>("parent");
  const [isTeacher, setIsTeacher] = useState(false);  // 老师开关（叠加在家长身份上）
  const [inviteCode, setInviteCode] = useState("");  // 家庭邀请码（孩子必填；家长填了则以家长身份加入该家庭）
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const supabase = createClient();

  // 根据 role 决定注册成功后跳去哪里（老师也先进家庭端，从设置进老师端）
  const getRedirectPath = (r: UserRole): string => {
    if (r === "child") return "/kid";
    return "/parent";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        // 登录成功，根据 JWT 里的 user_metadata.role 跳转
        const { data: { session } } = await supabase.auth.getSession();
        const userRole = (session?.user?.user_metadata?.role as UserRole) || "parent";
        router.push(getRedirectPath(userRole));
      } else {
        // 注册前校验
        if (role === "child" && !inviteCode.trim()) {
          throw new Error("孩子注册必须填写家庭邀请码");
        }

        const signupData: Record<string, any> = {
          nickname,
          role,
        };

        if (role === "parent") {
          // 家长填了家庭邀请码 = 加入已有家庭，不创建新家庭 → 忽略 family_name
          if (!inviteCode.trim()) {
            signupData.family_name = familyName.trim() || `${nickname}的家`;
          }
          if (isTeacher) {
            signupData.is_teacher = true;  // 注册即开通老师身份
          }
        }

        // 家庭邀请码：孩子必填；家长选填（填了则以家长身份加入该家庭，而不是创建新家庭）
        if (inviteCode.trim()) {
          signupData.invite_code = inviteCode.trim().toUpperCase();
        }

        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: signupData },
        });
        if (error) throw error;

        // 注册后跳转
        router.push(getRedirectPath(role));
      }
    } catch (err: any) {
      setError(err.message || "操作失败");
    } finally {
      setLoading(false);
    }
  };

  const showInviteField = mode === "register";
  const isChild = role === "child";

  return (
    <main className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl p-8">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🌸</div>
          <h1 className="text-2xl font-bold text-indigo-600">跬步</h1>
          <p className="text-gray-400 text-xs tracking-widest mb-1">KUǏ BÙ</p>
          <p className="text-gray-500 text-sm mt-1">
            {mode === "login" ? "千里之行始于跬步" : "开启您的跬步千里之旅"}
          </p>
        </div>

        <div className="flex bg-gray-100 rounded-xl p-1 mb-6">
          <button
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === "login" ? "bg-white shadow text-indigo-600" : "text-gray-500"
            }`}
            onClick={() => setMode("login")}
          >
            登录
          </button>
          <button
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === "register" ? "bg-white shadow text-indigo-600" : "text-gray-500"
            }`}
            onClick={() => setMode("register")}
          >
            注册
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 身份选择（仅注册时） */}
          {mode === "register" && (
            <div>
              <label className="block text-sm text-gray-600 mb-1.5">身份 *</label>
              <div className="grid grid-cols-2 gap-2">
                {ROLE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setRole(opt.value)}
                    className={`p-2.5 rounded-xl text-center transition border ${
                      role === opt.value
                        ? "bg-indigo-50 border-indigo-400 text-indigo-700"
                        : "bg-gray-50 border-gray-200 text-gray-500 hover:border-indigo-200"
                    }`}
                  >
                    <div className="text-xl mb-0.5">{opt.emoji}</div>
                    <div className="text-xs font-medium">{opt.label}</div>
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-gray-400 mt-1.5 text-center">
                {ROLE_OPTIONS.find((o) => o.value === role)?.desc}
              </p>
            </div>
          )}

          {/* 老师开关（家长身份可叠加老师身份） */}
          {mode === "register" && role === "parent" && (
            <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
              <input
                type="checkbox"
                checked={isTeacher}
                onChange={(e) => setIsTeacher(e.target.checked)}
                className="rounded"
              />
              我也是老师（开通后可创建班级、布置任务）
            </label>
          )}

          {/* 家庭名称（仅家长注册新家庭时显示；填了家庭邀请码=加入已有家庭，跳过） */}
          {mode === "register" && role === "parent" && !inviteCode.trim() && (
            <div>
              <label className="block text-sm text-gray-600 mb-1">家庭名称</label>
              <input
                type="text"
                value={familyName}
                onChange={(e) => setFamilyName(e.target.value)}
                placeholder={`默认：${nickname || "你"}的家`}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition"
                maxLength={12}
              />
              <p className="text-[11px] text-gray-400 mt-1">在「成员管理」里可以随时修改</p>
            </div>
          )}

          {/* 昵称（仅注册时） */}
          {mode === "register" && (
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                {role === "parent" ? "称呼" : "小名"}
              </label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder={role === "parent" ? "孩子怎么叫你？" : "请输入昵称"}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition"
                required
              />
            </div>
          )}

          {/* 家庭邀请码（孩子必填；家长选填，填了则以家长身份加入该家庭） */}
          {showInviteField && (
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                家庭邀请码 {isChild ? "*" : "（可选）"}
              </label>
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="6 位大写码，如 K8X2M3"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition tracking-widest uppercase"
                required={isChild}
                maxLength={6}
              />
              <p className="text-[11px] text-gray-400 mt-1">
                {isChild
                  ? "向家长索要这个码"
                  : "填了则以家长身份加入该家庭（老师进家庭用）；留空自动创建新家庭"}
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm text-gray-600 mb-1">邮箱</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 6 位"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition"
              required
              minLength={6}
            />
          </div>

          {error && (
            <div className="text-red-500 text-sm bg-red-50 rounded-lg px-3 py-2">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold shadow-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "处理中..." : mode === "login" ? "登录" : `注册 · ${ROLE_OPTIONS.find(o => o.value === role)?.label || "开始"}${role === "parent" && isTeacher ? " + 老师" : ""}`}
          </button>
        </form>

        {mode === "register" && role === "parent" && !inviteCode.trim() && (
          <p className="text-xs text-gray-400 text-center mt-4">
            注册即创建你的家庭，并初始化德智体美劳五维模板
          </p>
        )}
      </div>
    </main>
  );
}
