import { NextResponse } from "next/server"

import { deleteAttendanceById } from "@/lib/server/attendance-service"

export const runtime = "nodejs"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function DELETE(_: Request, context: RouteParams) {
  try {
    const { id: rawId } = await context.params
    const id = Number.parseInt(rawId, 10)
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "รหัสไม่ถูกต้อง" }, { status: 400 })
    }
    await deleteAttendanceById(id)
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
