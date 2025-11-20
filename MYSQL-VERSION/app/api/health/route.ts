import { NextResponse } from "next/server"
import { execute } from "@/lib/db"

export const runtime = "nodejs"

export async function GET() {
  try {
    await execute("SELECT 1")
    return NextResponse.json({ status: "ok" })
  } catch (error) {
    return NextResponse.json(
      { status: "error", message: (error as Error).message || "ไม่สามารถเชื่อมต่อฐานข้อมูลได้" },
      { status: 500 }
    )
  }
}
