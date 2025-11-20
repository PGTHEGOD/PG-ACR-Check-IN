import { NextRequest, NextResponse } from "next/server"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ""
const SESSION_COOKIE = "acr_admin_session"
const SESSION_VALUE = process.env.ADMIN_SESSION_TOKEN || "acr_session"
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 8,
}

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  if (!ADMIN_PASSWORD) {
    return NextResponse.json({ error: "ระบบยังไม่ตั้งค่ารหัสผ่านผู้ดูแล" }, { status: 500 })
  }

  const body = await request.json().catch(() => ({}))
  const password = body?.password?.toString?.() || ""

  if (!password) {
    return NextResponse.json({ error: "กรุณาระบุรหัสผ่าน" }, { status: 400 })
  }

  if (password !== ADMIN_PASSWORD) {
    return NextResponse.json({ error: "รหัสผ่านไม่ถูกต้อง" }, { status: 401 })
  }

  const response = NextResponse.json({ success: true })
  response.cookies.set(SESSION_COOKIE, SESSION_VALUE, COOKIE_OPTIONS)
  return response
}
