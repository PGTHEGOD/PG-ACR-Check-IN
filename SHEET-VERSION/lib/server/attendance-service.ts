import "server-only"

import { generateRecordId, getAttendanceSheetRows, saveAttendanceSheetRows } from "@/lib/google-sheets"
import type { AttendanceRecord, AttendanceResponse, AttendanceStats } from "@/lib/types"
import { getAllStudents, getStudentByCode } from "./student-service"

interface AttendanceOptions {
  month?: string | null
  search?: string | null
}

const REPORT_TIMEZONE = process.env.LIBRARY_TIMEZONE || "Asia/Bangkok"
const ISO_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: REPORT_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" })
const TIME_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: REPORT_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})

function resolveMonthRange(month?: string | null) {
  const now = new Date()
  let year = now.getFullYear()
  let monthIndex = now.getMonth()

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [rawYear, rawMonth] = month.split("-")
    const parsedYear = Number(rawYear)
    const parsedMonth = Number(rawMonth) - 1
    if (Number.isFinite(parsedYear) && Number.isFinite(parsedMonth)) {
      year = parsedYear
      monthIndex = Math.min(Math.max(parsedMonth, 0), 11)
    }
  }

  const start = new Date(Date.UTC(year, monthIndex, 1))
  const end = new Date(Date.UTC(year, monthIndex + 1, 0))

  const startDate = ISO_DATE.format(start)
  const endDate = ISO_DATE.format(end)

  return { startDate, endDate }
}

export async function listAttendance(options: AttendanceOptions = {}): Promise<AttendanceResponse> {
  const { startDate, endDate } = resolveMonthRange(options.month)
  const [attendanceRows, students] = await Promise.all([getAttendanceSheetRows(), getAllStudents()])
  const studentMap = new Map(students.map((student) => [student.id.toString(), student]))
  const search = options.search?.trim().toLowerCase()

  const records = attendanceRows
    .filter((row) => {
      const date = row.attendanceDate
      return Boolean(date) && date >= startDate && date <= endDate
    })
    .map((row) => {
      const student = studentMap.get(row.studentId)
      if (!student) return null
      const id = Number(row.id)
      if (!Number.isFinite(id)) return null
      const record: AttendanceRecord = {
        id,
        studentId: student.id,
        studentCode: student.studentCode,
        attendanceDate: row.attendanceDate || "",
        attendanceTime: row.attendanceTime || "",
        purposes: normalizePurposes(row.purposes),
        classLevel: student.classLevel,
        room: student.room,
        title: student.title,
        number: student.number,
        firstName: student.firstName,
        lastName: student.lastName,
      }
      return record
    })
    .filter((record): record is AttendanceRecord => Boolean(record))
    .filter((record) => {
      if (!search) return true
      return (
        record.studentCode.toLowerCase().includes(search) ||
        record.firstName.toLowerCase().includes(search) ||
        record.lastName.toLowerCase().includes(search)
      )
    })
    .sort((a, b) => {
      if (a.attendanceDate === b.attendanceDate) {
        return b.attendanceTime.localeCompare(a.attendanceTime)
      }
      return b.attendanceDate.localeCompare(a.attendanceDate)
    })

  const stats = buildStats(records)
  return { records, stats }
}

function normalizePurposes(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => item?.toString?.() ?? "").filter(Boolean)
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) {
        return parsed.map((item) => item?.toString?.() ?? "").filter(Boolean)
      }
    } catch {
      return [value]
    }
  }
  return []
}

function buildStats(records: AttendanceRecord[]): AttendanceStats {
  const purposeCount: Record<string, number> = {}
  const studentIds = new Set<number>()

  for (const record of records) {
    studentIds.add(record.studentId)
    const purposes = Array.isArray(record.purposes) ? record.purposes : []
    for (const purpose of purposes) {
      if (!purpose) continue
      purposeCount[purpose] = (purposeCount[purpose] || 0) + 1
    }
  }

  return {
    totalRecords: records.length,
    uniqueStudents: studentIds.size,
    purposeCounts: purposeCount,
  }
}

export async function createAttendanceEntry(studentCode: string, purpose: string): Promise<void> {
  const trimmedPurpose = purpose.trim()
  if (!studentCode || !trimmedPurpose) {
    throw new Error("กรุณาระบุเลขประจำตัวและจุดประสงค์")
  }

  const student = await getStudentByCode(studentCode)
  if (!student) {
    throw new Error("ไม่พบนักเรียนในระบบ")
  }

  const attendanceRows = await getAttendanceSheetRows()
  const existingIds = new Set(attendanceRows.map((row) => row.id).filter(Boolean))
  const studentIdValue = student.id.toString()
  const today = ISO_DATE.format(new Date())
  const timestamp = new Date().toISOString()
  const timeLabel = TIME_FORMAT.format(new Date())

  const existing = attendanceRows.find((row) => row.studentId === studentIdValue && row.attendanceDate === today)

  if (!existing) {
    const newId = String(generateRecordId(existingIds))
    existingIds.add(newId)
    attendanceRows.push({
      id: newId,
      studentId: studentIdValue,
      attendanceDate: today,
      attendanceTime: timeLabel,
      purposes: JSON.stringify([trimmedPurpose]),
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await saveAttendanceSheetRows(attendanceRows)
    return
  }

  const currentPurposes = normalizePurposes(existing.purposes)
  if (!currentPurposes.includes(trimmedPurpose)) {
    currentPurposes.push(trimmedPurpose)
  }
  existing.attendanceTime = timeLabel
  existing.purposes = JSON.stringify(currentPurposes)
  existing.updatedAt = timestamp

  await saveAttendanceSheetRows(attendanceRows)
}

export async function deleteAttendanceById(id: number): Promise<void> {
  if (!id || Number.isNaN(id)) {
    throw new Error("ไม่พบรหัสที่ต้องการลบ")
  }
  const attendanceRows = await getAttendanceSheetRows()
  const targetId = String(id)
  const filtered = attendanceRows.filter((row) => row.id !== targetId)
  if (filtered.length === attendanceRows.length) {
    return
  }
  await saveAttendanceSheetRows(filtered)
}
