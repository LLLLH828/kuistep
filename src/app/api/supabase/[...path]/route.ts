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
  const target =
    `https://${SUPABASE_HOST}` +
    url.pathname.replace(/^\/api\/supabase/, "") +
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
