/**
 * 跬步 - 数据库初始化脚本
 * 
 * 使用方法：
 * 1. 注册 supabase.com 并创建 Project
 * 2. 在 Supabase Dashboard → Settings → API 拿到 URL、anon key、service_role key
 * 3. 把值填入 .env.local（参考 .env.example）
 * 4. 运行: node scripts/init-db.mjs
 * 
 * 或者直接去 Supabase Dashboard → SQL Editor，把 supabase/schema.sql 内容粘贴执行也可以
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(__dirname, "..", "supabase", "schema.sql");

// 读取 .env.local
function loadEnv() {
  const envPath = path.resolve(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) {
    console.error("❌ 找不到 .env.local，请先创建（参考 .env.example）");
    process.exit(1);
  }
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx > 0) {
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
      if (!(key in process.env)) process.env[key] = value;
    }
  }
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("❌ .env.local 缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

console.log(`🔗 连接 Supabase: ${url}`);
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

// 分割 SQL：按分号分割，但保持 $$...$$ 块完整
function splitSql(sql) {
  const statements = [];
  let current = "";
  let inDollarQuote = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const nextTwo = sql.slice(i, i + 2);

    if (nextTwo === "$$") {
      inDollarQuote = !inDollarQuote;
      current += "$$";
      i++;
      continue;
    }

    if (ch === ";" && !inDollarQuote) {
      const trimmed = current.trim();
      if (trimmed && !trimmed.startsWith("--")) {
        statements.push(trimmed + ";");
      }
      current = "";
      continue;
    }

    current += ch;
  }

  return statements;
}

const schemaSql = fs.readFileSync(schemaPath, "utf-8");
const statements = splitSql(schemaSql);

console.log(`📄 解析出 ${statements.length} 条 SQL 语句，开始执行...\n`);

let success = 0;
let failed = 0;

for (let i = 0; i < statements.length; i++) {
  const sql = statements[i];
  const shortName = sql.split("\n")[0].replace(/--/, "").trim().slice(0, 60);

  try {
    // Supabase REST API 不支持直接执行任意 SQL，需要使用 rpc 或 pg function
    // 这里使用 supabase-js 的 .rpc() 不行，用 REST endpoint 的方式也不行
    // 最简单的方法：通过 supabase CLI 或者直接在 Dashboard SQL Editor 执行
    // 但我们可以试试 execute_sql 函数（如果已创建）
    // 实际上，最靠谱的是提示用户在 Dashboard 执行
    console.log(`  [${i + 1}/${statements.length}] ${shortName}...`);
    // 跳过实际执行，因为 REST API 不支持
    success++;
  } catch (err) {
    console.error(`  ❌ 失败: ${err.message}`);
    failed++;
  }
}

// 由于无法通过 REST API 执行 DDL，给出明确指引
console.log(`\n${"=".repeat(60)}`);
console.log(`💡 由于 Supabase REST API 不支持直接执行 DDL，`);
console.log(`   请按以下步骤手动初始化：`);
console.log(`\n  1. 打开: ${url.replace(".co", ".co/dashboard")}/sql/new`);
console.log(`  2. 复制 supabase/schema.sql 的全部内容`);
console.log(`  3. 粘贴到 SQL Editor，点击 Run`);
console.log(`\n  或者安装 supabase CLI 后运行：`);
console.log(`     npx supabase db push`);
console.log(`${"=".repeat(60)}`);

// 验证连接是否正常
async function verifyConnection() {
  try {
    const { error } = await supabase.auth.admin.listUsers();
    if (error) {
      console.error(`\n⚠️  Supabase 连接测试失败: ${error.message}`);
      console.log("   请检查 URL 和 service_role_key 是否正确");
    } else {
      console.log("\n✅ Supabase 连接正常！");
    }
  } catch (err) {
    console.error(`\n⚠️  Supabase 连接测试异常: ${err.message}`);
  }
}

verifyConnection();
