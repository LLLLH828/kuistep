// Supabase API 反向代理
// 国内网络直连 *.supabase.co 会被阻断（TLS 握手重置），
// 客户端改为访问本域 /api/supabase/*，由 Cloudflare 边缘转发到 Supabase。
//
// 两个关键点（踩坑记录）：
// 1. 只透传白名单请求头——盲目透传 cf-* / x-forwarded-* / cdn-loop 等
//    边缘注入的头会干扰上游网关；
// 2. next-on-pages 的托管路由会把子路径以 ?path=<子路径> 重复附加到 query，
//    原样转发会让 PostgREST 把它当过滤条件解析（PGRST100），必须剥离。
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

function buildForwardSearch(url: URL, subPath: string) {
  const sp = new URLSearchParams(url.search);
  const appended = sp.get("path");
  if (appended !== null && appended === subPath.replace(/^\//, "")) {
    sp.delete("path");
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

async function handler(req: Request) {
  const url = new URL(req.url);
  const subPath = url.pathname.replace(/^\/api\/supabase/, "");
  const target =
    `https://${SUPABASE_HOST}` + subPath + buildForwardSearch(url, subPath);

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
