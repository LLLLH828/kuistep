import { type NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

// 需要登录才能访问的路由
const PROTECTED_ROUTES = ["/parent", "/kid", "/teacher"];

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
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

  // 角色只有 parent/child 两种；老师是可叠加的开关（user_metadata.is_teacher）
  const role = (user?.user_metadata?.role as string) || "parent";
  const isTeacher = user?.user_metadata?.is_teacher === true;

  // 已登录访问登录页 → 按角色跳转（老师默认进家庭端，从设置里进老师端）
  if (pathname === "/login" && user) {
    const url = request.nextUrl.clone();
    url.pathname = role === "child" ? "/kid" : "/parent";
    return NextResponse.redirect(url);
  }

  if (user) {
    // 孩子不能进 /parent
    if (pathname.startsWith("/parent") && role === "child") {
      const url = request.nextUrl.clone();
      url.pathname = "/kid";
      return NextResponse.redirect(url);
    }
    // 家长/老师不能进 /kid
    if (pathname.startsWith("/kid") && role !== "child") {
      const url = request.nextUrl.clone();
      url.pathname = "/parent";
      return NextResponse.redirect(url);
    }
    // /teacher 需要 is_teacher 开关（登录后可在设置里开通）
    if (pathname.startsWith("/teacher") && !isTeacher) {
      const url = request.nextUrl.clone();
      url.pathname = "/parent";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.json|.*\\.svg).*)"],
};
