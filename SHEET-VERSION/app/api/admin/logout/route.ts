import { NextResponse } from "next/server"

const SESSION_COOKIE = "acr_admin_session"

export const runtime = "nodejs"

export async function POST() {
  const response = NextResponse.json({ success: true })
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 })
  return response
}
