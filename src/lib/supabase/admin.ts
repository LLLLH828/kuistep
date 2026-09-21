import { createClient } from "@supabase/supabase-js";
import { getServerConfig } from "./config";

// service role 客户端，仅在服务端路由中使用
export function createAdminClient() {
  const { url, serviceRoleKey } = getServerConfig();
  if (!url || !serviceRoleKey) {
    // 返回一个无效 client，让调用方自己检查
    return null as unknown as ReturnType<typeof createClient>;
  }
  return createClient(url, serviceRoleKey);
}
