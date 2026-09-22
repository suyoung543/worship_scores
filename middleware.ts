import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionCookieValue } from "@/lib/auth";

export async function middleware(request: NextRequest) {
  const cookieValue = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const member = await verifySessionCookieValue(cookieValue);

  if (!member) {
    const loginUrl = new URL("/login", request.url);
    if (request.nextUrl.pathname !== "/") {
      loginUrl.searchParams.set("next", request.nextUrl.pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // /login, 정적 파일, next 내부 경로를 제외한 모든 경로를 로그인 필수로 보호합니다.
  matcher: ["/((?!login|_next/static|_next/image|favicon.ico|pdf.worker.min.mjs).*)"],
};
