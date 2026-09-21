// 修复脚本：为已存在的 auth 用户补建家庭数据
// 因为 handle_new_user 触发器只在新注册时触发，重跑 schema.sql 会删除旧数据
// 运行: node scripts/fix-existing-user.mjs

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
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

async function main() {
  console.log("=== 为已存在的 auth 用户补建家庭数据 ===\n");

  // 1. 取 auth users
  const authRes = await fetch(`${AUTH_URL}/auth/v1/admin/users`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  const { users } = await authRes.json();
  console.log(`找到 ${users.length} 个 auth 用户`);

  for (const u of users) {
    const nickname = u.user_metadata?.nickname || u.email.split("@")[0];
    const familyName = u.user_metadata?.family_name || `${nickname}的家`;

    // 检查是否已有 family（用 invite_code 或 name 匹配）
    const existingFamily = await api(`/families?name=eq.${encodeURIComponent(familyName)}&select=id`).catch(() => []);
    if (existingFamily.length > 0) {
      console.log(`  ✓ ${u.email} 的家庭已存在，跳过`);
      continue;
    }

    // 2. 创建 family
    const [family] = await api("/families", "POST", {
      name: familyName,
      invite_code: `FAM${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    });
    console.log(`  ✓ 创建家庭: ${family.name} (${family.id})`);

    // 3. 创建 parent 成员
    const [parent] = await api("/family_members", "POST", {
      family_id: family.id,
      user_id: u.id,
      role: "parent",
      nickname,
      is_primary: true,
    });
    console.log(`  ✓ 创建家长成员: ${parent.nickname} (${parent.id})`);

    // 4. 创建 15 条默认奖励模板
    const templates = [
      { dimension: "de", item_name: "主动帮助他人", points: 2, is_decrease: false, sort_order: 1 },
      { dimension: "de", item_name: "礼貌待人", points: 1, is_decrease: false, sort_order: 2 },
      { dimension: "de", item_name: "撒谎/没礼貌", points: -2, is_decrease: true, sort_order: 3 },
      { dimension: "zhi", item_name: "作业全对", points: 3, is_decrease: false, sort_order: 1 },
      { dimension: "zhi", item_name: "主动提问", points: 2, is_decrease: false, sort_order: 2 },
      { dimension: "zhi", item_name: "作业拖沓", points: -2, is_decrease: true, sort_order: 3 },
      { dimension: "ti", item_name: "坚持运动", points: 2, is_decrease: false, sort_order: 1 },
      { dimension: "ti", item_name: "按时作息", points: 1, is_decrease: false, sort_order: 2 },
      { dimension: "ti", item_name: "久坐不动", points: -1, is_decrease: true, sort_order: 3 },
      { dimension: "mei", item_name: "展示才艺", points: 2, is_decrease: false, sort_order: 1 },
      { dimension: "mei", item_name: "整理房间", points: 1, is_decrease: false, sort_order: 2 },
      { dimension: "mei", item_name: "乱涂乱画", points: -1, is_decrease: true, sort_order: 3 },
      { dimension: "lao", item_name: "主动做家务", points: 2, is_decrease: false, sort_order: 1 },
      { dimension: "lao", item_name: "自己整理书包", points: 1, is_decrease: false, sort_order: 2 },
      { dimension: "lao", item_name: "丢三落四", points: -1, is_decrease: true, sort_order: 3 },
    ];
    for (const t of templates) {
      await api("/reward_templates", "POST", { family_id: family.id, ...t });
    }
    console.log(`  ✓ 创建 ${templates.length} 条奖励模板`);

    console.log();
  }

  console.log("=== 完成 ===");
}

main().catch((e) => {
  console.error("❌ 出错:", e.message);
  process.exit(1);
});
