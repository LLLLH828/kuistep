// Cloudflare Pages 部署：API 路由必须跑在 edge runtime
export const runtime = "edge";

import { NextResponse } from "next/server";
import { validateConfig } from "@/lib/supabase/config";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const config = validateConfig();

  if (!config.ok) {
    return NextResponse.json({
      ok: false,
      error: "Supabase 配置缺失",
      missing: config.missing,
      setup: "请在 .env.local 中配置 NEXT_PUBLIC_SUPABASE_URL 和 NEXT_PUBLIC_SUPABASE_ANON_KEY",
    });
  }

  try {
    const admin = createAdminClient();
    // 测试查询：看 families 表是否存在
    const { data, error } = await admin
      .from("families")
      .select("id")
      .limit(1);

    if (error && error.message.includes("does not exist")) {
      return NextResponse.json({
        ok: false,
        error: "数据库表尚未创建",
        setup: "请在 Supabase Dashboard → SQL Editor 执行 supabase/schema.sql",
      });
    }

    if (error) {
      return NextResponse.json({ ok: false, error: error.message });
    }

    return NextResponse.json({
      ok: true,
      message: "跬步 Supabase 连接正常",
      sampleFamilyCount: data?.length ?? 0,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message });
  }
}
