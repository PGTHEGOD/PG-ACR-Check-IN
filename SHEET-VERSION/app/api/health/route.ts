import { NextResponse } from "next/server"
import { getStudentSheetRows } from "@/lib/google-sheets"

export const runtime = "nodejs"

export async function GET() {
  try {
    await getStudentSheetRows()
    return NextResponse.json({ status: "ok" })
  } catch (error) {
    return NextResponse.json(
      { status: "error", message: (error as Error).message || "ไม่สามารถเชื่อมต่อ Google Sheets ได้" },
      { status: 500 }
    )
  }
}
