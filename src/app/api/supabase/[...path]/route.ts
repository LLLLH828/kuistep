// Supabase API 反向代理
// 国内网络直连 *.supabase.co 会被阻断（TLS 握手重置），
// 客户端改为访问本域 /api/supabase/*，由 Cloudflare 边缘转发到 Supabase。
export const runtime = "edge";

const SUPABASE_HOST = "ibndcosctofschdxafkf.supabase.co";
const STRIP_HEADERS = new Set([
  "host",
  "connection",
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "upgrade",
  "keep-alive",
]);

async function handler(req: Request) {
  const url = new URL(req.url);
  const target =
    `https://${SUPABASE_HOST}` +
    url.pathname.replace(/^\/api\/supabase/, "") +
    url.search;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!STRIP_HEADERS.has(key.toLowerCase())) headers.set(key, value);
  });

  const body = req.method === "GET" || req.method === "HEAD" ? undefined : req.body;

  const res = await fetch(target, {
    method: req.method,
    headers,
    body,
    redirect: "manual",
  });

  const resHeaders = new Headers();
  res.headers.forEach((value, key) => {
    if (!STRIP_HEADERS.has(key.toLowerCase())) resHeaders.set(key, value);
  });

  return new Response(res.body, { status: res.status, headers: resHeaders });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
export const OPTIONS = handler;
