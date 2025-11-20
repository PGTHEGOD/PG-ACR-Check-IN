import { NextResponse } from "next/server"

import { getStudentByCode } from "@/lib/server/student-service"

export const runtime = "nodejs"

interface RouteParams {
  params: Promise<{ studentCode: string }>
}

export async function GET(_: Request, context: RouteParams) {
  try {
    const { studentCode } = await context.params
    const student = await getStudentByCode(studentCode)
    if (!student) {
      return NextResponse.json({ error: "ไม่พบนักเรียน" }, { status: 404 })
    }
    return NextResponse.json({ student })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
