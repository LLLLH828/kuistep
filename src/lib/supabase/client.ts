import { createBrowserClient } from "@supabase/ssr";
import { getPublicConfig } from "./config";

// 浏览器端 client - 配置缺失时返回 null，由调用方处理
let _client: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (_client) return _client;

  const { url, anonKey } = getPublicConfig();
  if (!url || !anonKey) {
    // 开发期返回一个占位对象，让页面能渲染出"请配置"提示
    return new Proxy({} as ReturnType<typeof createBrowserClient>, {
      get: () => {
        throw new Error(
          "[跬步] Supabase 未配置：请在 .env.local 中设置 NEXT_PUBLIC_SUPABASE_URL 和 NEXT_PUBLIC_SUPABASE_ANON_KEY"
        );
      },
    });
  }

  _client = createBrowserClient(url, anonKey);
  return _client;
}
