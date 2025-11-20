import { NextRequest, NextResponse } from "next/server"
import { jsonrepair } from "jsonrepair"
import { parse as parseJsonLines } from "jsonlines"

import { bulkUpsertStudents, deleteStudentsByCodes, listStudentCodes } from "@/lib/server/student-service"
import type { StudentImportRow } from "@/lib/types"

export const runtime = "nodejs"

type WorksheetRow = Record<string, unknown>

function escapeLooseNewlines(json: string): string {
  let inString = false
  let escaped = false
  let result = ""

  for (let i = 0; i < json.length; i++) {
    const char = json[i]

    if (!inString) {
      if (char === '"') {
        inString = true
      }
      result += char
      continue
    }

    if (escaped) {
      escaped = false
      result += char
      continue
    }

    if (char === "\\") {
      escaped = true
      result += char
      continue
    }

    if (char === '"') {
      inString = false
      result += char
      continue
    }

    if (char === "\n") {
      result += "\\n"
      continue
    }

    if (char === "\r") {
      result += "\\r"
      continue
    }

    result += char
  }

  return result
}

function mapWorksheetRow(row: WorksheetRow): StudentImportRow {
  const getValue = (key: string, fallbackKey?: string) =>
    (row[key] ?? (fallbackKey ? row[fallbackKey] : "") ?? "").toString()

  return {
    studentCode: getValue("รหัสประจำตัว", "studentCode"),
    classLevel: getValue("ชั้น", "classLevel"),
    room: getValue("ห้อง", "room"),
    number: getValue("เลขที่", "number"),
    title: getValue("คำนำหน้า", "title"),
    firstName: getValue("ชื่อ", "firstName"),
    lastName: getValue("นามสกุล", "lastName"),
  }
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()
    if (!rawBody.trim()) {
      return NextResponse.json({ error: "ไม่พบข้อมูลนักเรียนในไฟล์ JSON" }, { status: 400 })
    }

    const sanitized = rawBody.replace(/^\uFEFF/, "").trim()
    let payload: any
    let parseError: Error | null = null
    const attempts: Array<() => any> = [
      () => JSON.parse(sanitized),
      () => JSON.parse(escapeLooseNewlines(sanitized)),
      () => JSON.parse(jsonrepair(sanitized)),
      () => parseJsonLines(sanitized),
    ]

    for (const attempt of attempts) {
      try {
        payload = attempt()
        parseError = null
        break
      } catch (err) {
        parseError = err as Error
      }
    }

    if (!payload) {
      return NextResponse.json(
        {
          error: `รูปแบบ JSON ไม่ถูกต้อง: ${parseError?.message || "ไม่สามารถอ่านไฟล์ได้"}. กรุณาตรวจสอบว่าข้อมูลมีการปิดคำและรูปแบบถูกต้อง`,
        },
        { status: 400 }
      )
    }
    const worksheet: WorksheetRow[] = Array.isArray(payload)
      ? payload
      : payload?.Worksheet || payload?.worksheet || payload?.students || payload?.data || []

    if (!Array.isArray(worksheet) || worksheet.length === 0) {
      return NextResponse.json({ error: "ไม่พบข้อมูลนักเรียนในไฟล์ JSON" }, { status: 400 })
    }

    const rows = worksheet.map(mapWorksheetRow)
    const missingCodes = rows.filter((row) => !row.studentCode?.trim()).length
    if (missingCodes > 0) {
      return NextResponse.json(
        {
          error: `ข้อมูลมีรายการที่ไม่มีเลขประจำตัว ${missingCodes} รายการ กรุณาตรวจสอบไฟล์ก่อนนำเข้า (แถวที่ไม่มีเลขประจำตัวจะถูกข้ามและไม่ถูกเพิ่ม/อัปเดต)`,
        },
        { status: 400 }
      )
    }

    const existingCodes = await listStudentCodes()
    const incomingSet = new Set(rows.map((row) => row.studentCode.trim()))
    const missingExisting = existingCodes.filter((code) => !incomingSet.has(code))

    const action = request.nextUrl.searchParams.get("action")
    if (missingExisting.length > 0) {
      if (action === "delete") {
        await deleteStudentsByCodes(missingExisting)
      } else if (action !== "update") {
        const sample = missingExisting.slice(0, 10)
        return NextResponse.json(
          {
            warning: `ตรวจพบเลขประจำตัวในระบบที่ไม่มีในไฟล์นำเข้า ${missingExisting.length} รายการ`,
            missingCount: missingExisting.length,
            sampleCodes: sample,
          },
          { status: 409 }
        )
      }
    }

    const result = await bulkUpsertStudents(rows)

    return NextResponse.json({ processed: result.processed })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
