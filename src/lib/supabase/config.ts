// Supabase 配置 - 单一真相来源
// 注意：浏览器端的环境变量是编译时内联的，Next.js 只支持静态字面量访问
// process.env.NEXT_PUBLIC_XXX，绝对不能用 process.env[name] 动态取值！

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  serviceRoleKey?: string;
}

/**
 * Supabase 直连主机（单一真相来源，反代路由与服务端共用）。
 * 国内网络直连会被阻断——但这只影响浏览器；Cloudflare 边缘直连畅通。
 * 因此服务端请求一律改写为直连，仅浏览器走 /api/supabase 反代。
 */
export const SUPABASE_DIRECT_HOST = "ibndcosctofschdxafkf.supabase.co";

/** 浏览器端/服务端通用配置（公开变量）- 必须静态访问以便客户端内联 */
export function getPublicConfig(): SupabaseConfig {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  };
}

/** 服务端专用配置（含私密变量，仅服务端调用，运行时动态读取没问题） */
export function getServerConfig(): SupabaseConfig {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

/** 检查配置是否完整 */
export function validateConfig(): { ok: boolean; missing: string[] } {
  const { url, anonKey } = getPublicConfig();
  const missing: string[] = [];
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!anonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return { ok: missing.length === 0, missing };
}

/** 启动时快速验证，缺失则打印警告（不 throw，让开发体验流畅） */
export function checkConfig(): void {
  const { ok, missing } = validateConfig();
  if (!ok && process.env.NODE_ENV !== "production") {
    console.warn(
      `[跬步] ⚠️  Supabase 配置未完成: 缺少 ${missing.join(", ")}。` +
      `请在 .env.local 中填入真实值，然后重启 dev server。`
    );
  }
}
