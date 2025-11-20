import { NextRequest, NextResponse } from "next/server"

import { listStudents } from "@/lib/server/student-service"

export const runtime = "nodejs"

function parseClassParam(param: string | null) {
  if (!param || param === "__all__") return null
  const [classLevel, room = ""] = param.split("|")
  const trimmedLevel = classLevel.trim()
  const trimmedRoom = room.trim()
  if (!trimmedLevel) return null
  return { classLevel: trimmedLevel, room: trimmedRoom || null }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search")
    const limit = Number(searchParams.get("limit") || "50")
    const page = Number(searchParams.get("page") || "1")
    const classFilter = parseClassParam(searchParams.get("class"))

    const data = await listStudents({ search, limit, page, classFilter })
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
