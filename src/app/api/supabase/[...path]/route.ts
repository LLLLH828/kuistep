// Supabase API 反向代理
// 国内网络直连 *.supabase.co 会被阻断（TLS 握手重置），
// 客户端改为访问本域 /api/supabase/*，由 Cloudflare 边缘转发到 Supabase。
// 注意：只透传白名单请求头——盲目透传 cf-* / x-forwarded-* / cdn-loop 等
// 边缘注入的头会干扰 Supabase 网关，导致 REST 路径被错误解析。
export const runtime = "edge";

const SUPABASE_HOST = "ibndcosctofschdxafkf.supabase.co";

const PASS_REQUEST_HEADERS = new Set([
  "apikey",
  "authorization",
  "content-type",
  "accept",
  "accept-profile",
  "content-profile",
  "prefer",
  "range",
  "user-agent",
  "x-client-info",
  "x-supabase-api-version",
  "if-none-match",
]);

const PASS_RESPONSE_HEADERS = new Set([
  "content-type",
  "content-range",
  "etag",
  "retry-after",
  "location",
]);

function buildHeaders(reqHeaders: Headers, whitelist: Set<string>) {
  const headers = new Headers();
  reqHeaders.forEach((value, key) => {
    if (whitelist.has(key.toLowerCase()) && value) headers.set(key, value);
  });
  return headers;
}

async function handler(req: Request) {
  const url = new URL(req.url);
  const subPath = url.pathname.replace(/^\/api\/supabase/, "");

  // 临时诊断端点：/api/supabase/__diag?key=xxx
  if (subPath === "/__diag") {
    return diag(req, url.searchParams.get("key") || "");
  }

  const target =
    `https://${SUPABASE_HOST}` +
    subPath +
    url.search;

  const res = await fetch(target, {
    method: req.method,
    headers: buildHeaders(req.headers, PASS_REQUEST_HEADERS),
    body: req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
    redirect: "manual",
  });

  return new Response(res.body, {
    status: res.status,
    headers: buildHeaders(res.headers, PASS_RESPONSE_HEADERS),
  });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
export const OPTIONS = handler;

// 临时诊断端点：/api/supabase/__diag?key=xxx
// 观察 Supabase 网关对不同请求形态的真实响应，定位 REST 路径被解析成 query 的原因
async function diag(_req: Request, key: string) {
  if (!key) return new Response("missing key", { status: 400 });
  const authHeaders = { apikey: key, Authorization: `Bearer ${key}` };
  const H = `https://${SUPABASE_HOST}`;
  const results: Record<string, unknown> = {};

  const cases: Array<[string, string, RequestInit]> = [
    ["rest_manual", `${H}/rest/v1/families`, { redirect: "manual" }],
    ["rest_follow", `${H}/rest/v1/families`, { redirect: "follow" }],
    ["rest_query", `${H}/rest/v1/families?select=id`, { redirect: "manual" }],
    ["rest_root", `${H}/rest/v1/`, { redirect: "manual" }],
    ["rest_noslash", `${H}/rest/v1`, { redirect: "manual" }],
    ["auth_get", `${H}/auth/v1/settings`, { redirect: "manual" }],
  ];

  for (const [name, target, init] of cases) {
    try {
      const res = await fetch(target, { ...init, headers: authHeaders });
      const text = await res.text();
      results[name] = {
        requested: target,
        finalUrl: res.url,
        status: res.status,
        location: res.headers.get("location"),
        body: text.slice(0, 220),
      };
    } catch (e) {
      results[name] = { requested: target, error: String(e) };
    }
  }

  return new Response(JSON.stringify(results, null, 2), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
