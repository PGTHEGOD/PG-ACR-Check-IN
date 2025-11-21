import { NextRequest, NextResponse } from "next/server"
import {
  getAccessCookieName,
  getSessionToken,
  isAccessEnabled,
  isAuthorizedCookie,
  verifyAccessCode,
} from "@/lib/access-control"

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
}

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  if (!isAccessEnabled()) {
    return NextResponse.json({ authorized: true, enabled: false })
  }
  const token = request.cookies.get(getAccessCookieName())?.value
  if (isAuthorizedCookie(token)) {
    return NextResponse.json({ authorized: true, enabled: true })
  }
  return NextResponse.json({ authorized: false, enabled: true }, { status: 401 })
}

export async function POST(request: NextRequest) {
  if (!isAccessEnabled()) {
    return NextResponse.json(
      { error: "ยังไม่ได้กำหนด LIBRARY_ACCESS_CODE ในเซิร์ฟเวอร์" },
      { status: 500 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const code = body?.code?.toString?.().trim() || ""
  if (!code) {
    return NextResponse.json({ error: "กรุณาระบุรหัสสำหรับอุปกรณ์" }, { status: 400 })
  }
  if (!(await verifyAccessCode(code))) {
    return NextResponse.json({ error: "รหัสไม่ถูกต้อง" }, { status: 401 })
  }

  const response = NextResponse.json({ authorized: true })
  response.cookies.set(getAccessCookieName(), getSessionToken(), COOKIE_OPTIONS)
  return response
}
