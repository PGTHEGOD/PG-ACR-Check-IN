import { NextRequest, NextResponse } from "next/server"

import { createAttendanceEntry, listAttendance } from "@/lib/server/attendance-service"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const month = searchParams.get("month")
    const search = searchParams.get("search")
    const data = await listAttendance({ month, search })
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const studentCode = body?.studentCode?.toString() ?? ""
    const rawPurposes = body?.purposes

    let purposes: string[] = []
    if (Array.isArray(rawPurposes)) {
      purposes = rawPurposes.map((item) => (item ?? "").toString())
    } else if (typeof rawPurposes === "string") {
      purposes = [rawPurposes]
    } else if (body?.purpose) {
      const legacy = body.purpose.toString()
      if (legacy) {
        purposes = [legacy]
      }
    }

    if (!studentCode || !purposes.length) {
      return NextResponse.json({ error: "กรุณาระบุข้อมูลให้ครบ" }, { status: 400 })
    }

    await createAttendanceEntry(studentCode, purposes)
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
