// 修正版：created_by 传 family_members.id，不是 auth user_id
const AUTH_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ibndcosctofschdxafkf.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) {
  console.error("❌ 请先设置环境变量 SUPABASE_SERVICE_ROLE_KEY（从 .env.local 读取，勿硬编码）");
  process.exit(1);
}

async function api(path, method = "GET", body = null) {
  const res = await fetch(`${AUTH_URL}/rest/v1${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  console.log("=== 修正测试：created_by 用 family_members.id ===\n");

  const accounts = await api("/reward_accounts?select=id,child_member_id,total_points&limit=1");
  const acc = accounts[0];
  console.log(`账户: ${acc.id}, child=${acc.child_member_id}, 余额=${acc.total_points}`);

  // 取 parent 的 family_members.id（这才是 created_by 外键需要的）
  const parents = await api("/family_members?select=id,user_id&role=eq.parent&limit=1");
  const parent_fm_id = parents[0].id;  // ← family_members.id，不是 user_id！
  console.log(`家长 family_members.id: ${parent_fm_id}`);

  // 插入
  const [tx] = await api("/reward_transactions", "POST", {
    account_id: acc.id,
    member_id: acc.child_member_id,
    points: 2,
    reason: "主动帮助他人",
    dimension: "de",
    source: "manual",
    created_by: parent_fm_id,  // ← 修正
  });
  console.log(`✓ 插入流水成功: ${tx.id}, points=${tx.points}`);

  const accAfter = (await api(`/reward_accounts?select=total_points&id=eq.${acc.id}`))[0];
  console.log(`✓ 触发器更新后余额: ${accAfter.total_points} (期望 2)`);

  // 清理
  await api(`/reward_transactions?id=eq.${tx.id}`, "DELETE");
  await api(`/reward_accounts?id=eq.${acc.id}`, "PATCH", { total_points: 0, lifetime_points: 0 });
  console.log("\n✓ 清理完成");

  if (accAfter.total_points === 2) {
    console.log("\n✅ 数据库链路完全通畅！前端应该也能加分。");
    console.log("如果前端仍失败，问题在 RLS 策略或浏览器端 cookie/session。");
  }
}

main().catch((e) => console.error("❌", e.message));
