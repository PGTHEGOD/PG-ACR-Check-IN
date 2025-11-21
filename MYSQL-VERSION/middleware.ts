import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { getAccessCookieName, isAccessEnabled, isAuthorizedCookie } from "@/lib/access-control"

const PUBLIC_API = ["/api/access", "/api/health"]

export function middleware(request: NextRequest) {
  if (!isAccessEnabled()) {
    return NextResponse.next()
  }
  const { pathname } = request.nextUrl
  if (!pathname.startsWith("/api/") || PUBLIC_API.some((path) => pathname.startsWith(path))) {
    return NextResponse.next()
  }

  const token = request.cookies.get(getAccessCookieName())?.value
  if (isAuthorizedCookie(token)) {
    return NextResponse.next()
  }

  return NextResponse.json(
    { error: "กรุณาป้อนรหัสสำหรับอุปกรณ์ที่ได้รับจากห้องสมุดก่อนใช้งาน" },
    { status: 403 }
  )
}

export const config = {
  matcher: ["/api/:path*"],
}
