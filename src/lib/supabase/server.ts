import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getPublicConfig } from "./config";

// 服务端 client - 配置缺失时返回 null，由调用方处理
export function createClient() {
  const { url, anonKey } = getPublicConfig();
  if (!url || !anonKey) {
    // 返回占位对象，让上层 checkConfig() 能给出友好提示
    return null as unknown as ReturnType<typeof createServerClient>;
  }

  const cookieStore = cookies();
  return createServerClient(url, anonKey, {
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
