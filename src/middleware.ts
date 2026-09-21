import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// 需要登录才能访问的路由
const PROTECTED_ROUTES = ["/parent", "/kid"];

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // 用 @supabase/ssr 的 createServerClient 处理 cookie 交换，
  // 并通过 getUser() 真实校验会话（会自动刷新过期 token）
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // 用 getSession() 只解析本地 cookie 的 JWT，不发网络请求（快）。
  // 权威校验由 /parent、/kid 等服务端组件里的 getUser() 兜底。
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  const { pathname } = request.nextUrl;

  // 未登录访问受保护路由 → 跳转登录页
  if (PROTECTED_ROUTES.some((r) => pathname.startsWith(r)) && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // 已登录访问登录页 → 直接进家长端
  if (pathname === "/login" && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/parent";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.json|.*\\.svg).*)"],
};
