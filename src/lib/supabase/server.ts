import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getPublicConfig, SUPABASE_DIRECT_HOST } from "./config";

/**
 * 服务端网络层：把反代地址改写为 Supabase 直连。
 *
 * 为什么这么做：
 * - 浏览器（国内网络）必须走 /api/supabase 反代，NEXT_PUBLIC_SUPABASE_URL
 *   在部署环境就是反代地址；
 * - 但服务端跑在 Cloudflare 边缘上，直连 Supabase 畅通无阻。若沿用反代地址，
 *   服务端会「自引用 fetch 自身域名」，这一跳行为不稳定（排查记录见
 *   project_memory：外部重放完全正常、worker 内部自 fetch 拿不到数据）；
 * - createServerClient 的 URL 参数决定 cookie 名（sb-<host首段>-auth-token），
 *   必须与浏览器端、middleware 保持一致，所以 URL 不动，只改写 fetch 目标。
 */
function directFetch(input: RequestInfo | URL, init?: RequestInit) {
  const raw =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  const marker = "/api/supabase/";
  const i = raw.indexOf(marker);
  if (i === -1) return fetch(raw, init);
  const direct = `https://${SUPABASE_DIRECT_HOST}${raw.slice(i + marker.length - 1)}`;
  return fetch(direct, init);
}

// 服务端 client - 配置缺失时返回 null，由调用方处理
export function createClient() {
  const { url, anonKey } = getPublicConfig();
  if (!url || !anonKey) {
    // 返回占位对象，让上层 checkConfig() 能给出友好提示
    return null as unknown as ReturnType<typeof createServerClient>;
  }

  const cookieStore = cookies();
  return createServerClient(url, anonKey, {
    global: { fetch: directFetch },
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        cookieStore.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        cookieStore.set({ name, value: "", ...options });
      },
    },
  });
}
