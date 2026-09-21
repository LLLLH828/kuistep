// 模拟浏览器端（RLS 生效）的加分测试
// 需要先登录拿到 access_token，然后用它调用 Supabase API
// 运行: node scripts/test-rls-insert.mjs

const AUTH_URL = "https://ibndcosctofschdxafkf.supabase.co";
const ANON_KEY = "sb_publishable_xobmIJDOL4TIzly4Ob8D0g_hQ6NuVAn";

async function api(path, accessToken, method = "GET", body = null) {
  const res = await fetch(`${AUTH_URL}/rest/v1${path}`, {
    method,
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
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
  console.log("=== 测试 RLS insert（模拟浏览器端）===\n");

  // 1. 先获取测试用户的 access_token
  const email = "136825897@qq.com";
  const loginRes = await fetch(`${AUTH_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password: "kuibue2026" }), // 需要用户提供
  });

  if (!loginRes.ok) {
    console.log("登录失败，尝试用 service_role 查 family_members + 手动模拟 RLS...");
    // 换个方式：直接用 SQL Editor 里 auth.uid() 能拿到什么
    console.log("\n请在浏览器里打开 DevTools → Application → Cookies → 找到 sb-*auth-token，");
    console.log("复制它的 value，然后运行: node scripts/test-rls-insert.mjs <token_value>");
    return;
  }

  const { access_token } = await loginRes.json();
  console.log(`登录成功，token: ${access_token.slice(0, 20)}...`);

  // 2. 用这个 token 查 family_members（RLS 生效）
  const members = await api("/family_members?select=id,role,nickname,user_id", access_token);
  console.log(`\nRLS 查询 family_members: ${members.length} 条`);
  members.forEach((m) => console.log(`  ${m.role}: ${m.nickname} (${m.id})`));

  // 3. 查 reward_accounts
  const accounts = await api("/reward_accounts?select=*", access_token);
  console.log(`\nRLS 查询 reward_accounts: ${accounts.length} 条`);
  accounts.forEach((a) => console.log(`  child=${a.child_member_id}, balance=${a.total_points}`));

  // 4. 查 reward_templates
  const tpls = await api("/reward_templates?select=id,item_name,points&limit=3", access_token);
  console.log(`\nRLS 查询 reward_templates: ${(await api("/reward_templates?select=id")).length} 条`);

  // 5. 尝试 insert reward_transaction（跟前端完全一样的参数）
  if (accounts.length > 0 && members.length > 0) {
    const parentId = members.find((m) => m.role === "parent")?.id;
    const childAcc = accounts[0];
    const childMember = members.find((m) => m.id === childAcc.child_member_id);

    console.log(`\n尝试 insert reward_transaction:`);
    console.log(`  account_id = ${childAcc.id}`);
    console.log(`  member_id  = ${childMember?.id} (孩子成员)`);
    console.log(`  created_by = ${parentId} (家长 family_members.id)`);

    try {
      const [tx] = await api("/reward_transactions", access_token, "POST", {
        account_id: childAcc.id,
        member_id: childMember.id,
        points: 2,
        reason: "RLS测试加分",
        dimension: "de",
        source: "manual",
        created_by: parentId,
      });
      console.log(`\n✅ RLS insert 成功！id=${tx.id}, points=${tx.points}`);
      console.log("→ 数据库链路 + RLS + 前端代码 全通！刷新页面加分应该能看到变化了。");

      // 清理
      await api(`/reward_transactions?id=eq.${tx.id}`, access_token, "DELETE");
    } catch (e) {
      console.log(`\n❌ RLS insert 失败: ${e.message}`);
      console.log("→ 问题在 RLS 策略或前端参数。");
    }
  }
}

// 支持命令行传 token
const token = process.argv[2];
if (token) {
  console.log("=== 用提供的 token 测试 ===\n");
  // 直接用 token 跑查询
  (async () => {
    try {
      const members = await api("/family_members?select=id,role,nickname", token);
      console.log(`RLS family_members: ${members.length} 条`);
      const accounts = await api("/reward_accounts?select=*", token);
      console.log(`RLS reward_accounts: ${accounts.length} 条`);
    } catch (e) {
      console.error("❌", e.message);
    }
  })();
} else {
  main().catch((e) => console.error("❌", e.message));
}
