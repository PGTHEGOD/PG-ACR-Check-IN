import { NextResponse } from "next/server"

import { listClassRooms } from "@/lib/server/student-service"

export const runtime = "nodejs"

export async function GET() {
  try {
    const classes = await listClassRooms()
    return NextResponse.json({ classes })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
