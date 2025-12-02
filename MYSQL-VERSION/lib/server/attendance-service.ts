import "server-only"

import { execute, queryRows } from "@/lib/db"
import type { AttendanceRecord, AttendanceResponse, AttendanceStats } from "@/lib/types"
import { getStudentByCode } from "./student-service"

interface AttendanceOptions {
  month?: string | null
  search?: string | null
}

interface ExistingAttendanceRow {
  id: number
  purposes: unknown
}

const ISO_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" })

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

interface AttendanceRow extends Omit<AttendanceRecord, "purposes"> {
  purposes: unknown
}

export async function listAttendance(options: AttendanceOptions = {}): Promise<AttendanceResponse> {
  const { startDate, endDate } = resolveMonthRange(options.month)
  const search = options.search?.trim()
  const searchClause = search
    ? "AND (s.student_code LIKE ? OR s.first_name LIKE ? OR s.last_name LIKE ?)"
    : ""
  const params: unknown[] = [startDate, endDate]

  if (search) {
    const likeValue = `%${search}%`
    params.push(likeValue, likeValue, likeValue)
  }

  const records = await queryRows<AttendanceRow>(
    `SELECT
        a.id,
        a.student_id AS studentId,
        s.student_code AS studentCode,
        DATE_FORMAT(a.attendance_date, '%Y-%m-%d') AS attendanceDate,
        DATE_FORMAT(a.attendance_time, '%H:%i') AS attendanceTime,
        a.purposes,
        s.class_level AS classLevel,
        NULLIF(s.room, '') AS room,
        NULLIF(s.title, '') AS title,
        NULLIF(s.student_number, '') AS number,
        s.first_name AS firstName,
        s.last_name AS lastName
     FROM attendance_logs a
     INNER JOIN students s ON s.id = a.student_id
     WHERE a.attendance_date BETWEEN ? AND ?
     ${searchClause}
     ORDER BY a.attendance_date DESC, a.attendance_time DESC`,
    params
  )

  const normalizedRecords: AttendanceRecord[] = records.map((record) => ({
    ...record,
    room: record.room ?? null,
    title: record.title ?? null,
    number: record.number ?? null,
    purposes: normalizePurposes(record.purposes),
  }))

  const stats = buildStats(normalizedRecords)
  return { records: normalizedRecords, stats }
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

async function fetchTodayAttendance(studentId: number): Promise<ExistingAttendanceRow | null> {
  const rows = await queryRows<ExistingAttendanceRow>(
    `SELECT a.id, a.purposes
     FROM attendance_logs a
     WHERE a.student_id = ?
       AND a.attendance_date = CURRENT_DATE()
     LIMIT 1`,
    [studentId]
  )
  return rows[0] ?? null
}

function normalizePurposeList(purposes: string[]): string[] {
  const seen = new Set<string>()
  for (const purpose of purposes) {
    const trimmed = purpose?.toString?.().trim()
    if (trimmed) {
      seen.add(trimmed)
    }
  }
  return Array.from(seen)
}

export async function createAttendanceEntry(studentCode: string, purposes: string[]): Promise<void> {
  const normalizedPurposes = normalizePurposeList(purposes)
  if (!studentCode || !normalizedPurposes.length) {
    throw new Error("กรุณาระบุเลขประจำตัวและจุดประสงค์")
  }

  const student = await getStudentByCode(studentCode)
  if (!student) {
    throw new Error("ไม่พบนักเรียนในระบบ")
  }

  const existing = await fetchTodayAttendance(student.id)

  if (!existing) {
    await execute(
      `INSERT INTO attendance_logs (student_id, attendance_date, attendance_time, purposes)
       VALUES (?, CURRENT_DATE(), CURRENT_TIME(), ?)
       ON DUPLICATE KEY UPDATE
         attendance_time = VALUES(attendance_time),
         purposes = VALUES(purposes)`,
      [student.id, JSON.stringify(normalizedPurposes)]
    )
    return
  }

  const currentPurposes = normalizePurposes(existing.purposes)
  const mergedPurposes = Array.from(new Set([...currentPurposes, ...normalizedPurposes]))

  await execute(
    `UPDATE attendance_logs
     SET attendance_time = CURRENT_TIME(),
         purposes = ?
     WHERE id = ?`,
    [JSON.stringify(mergedPurposes), existing.id]
  )
}

export async function deleteAttendanceById(id: number): Promise<void> {
  if (!id || Number.isNaN(id)) {
    throw new Error("ไม่พบรหัสที่ต้องการลบ")
  }
  await execute("DELETE FROM attendance_logs WHERE id = ?", [id])
}
