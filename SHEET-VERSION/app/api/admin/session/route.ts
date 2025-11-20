import { NextRequest, NextResponse } from "next/server"

const SESSION_COOKIE = "acr_admin_session"
const SESSION_VALUE = process.env.ADMIN_SESSION_TOKEN || "acr_session"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE)
  const authenticated = cookie?.value === SESSION_VALUE
  return NextResponse.json({ authenticated })
}
