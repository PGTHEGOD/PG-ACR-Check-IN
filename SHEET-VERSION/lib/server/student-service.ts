import "server-only"

import {
  generateRecordId,
  getAttendanceSheetRows,
  getStudentSheetRows,
  saveAttendanceSheetRows,
  saveStudentSheetRows,
  type StudentSheetRow,
} from "@/lib/google-sheets"
import type { PaginatedStudents, StudentImportRow, StudentRecord } from "@/lib/types"

interface ListStudentsOptions {
  search?: string | null
  limit?: number
  page?: number
  classFilter?: ClassFilter | null
}

interface ClassFilter {
  classLevel: string
  room?: string | null
}

const collator = new Intl.Collator("th-TH", { sensitivity: "base", numeric: true })

function normalizeImportRow(row: StudentImportRow): StudentImportRow | null {
  const normalize = (value?: string) => (value ? value.trim() : "")
  const normalized: StudentImportRow = {
    studentCode: normalize(row.studentCode),
    classLevel: normalize(row.classLevel) || "-",
    room: normalize(row.room),
    number: normalize(row.number),
    title: normalize(row.title),
    firstName: normalize(row.firstName),
    lastName: normalize(row.lastName),
  }

  if (!normalized.studentCode || !normalized.firstName || !normalized.lastName) {
    return null
  }

  return normalized
}

function toStudentRecord(row: StudentSheetRow): StudentRecord | null {
  const id = Number(row.id)
  if (!row.studentCode || !row.firstName || !row.lastName || !Number.isFinite(id)) {
    return null
  }
  const createdAt = row.createdAt || row.updatedAt || new Date().toISOString()
  const updatedAt = row.updatedAt || createdAt
  return {
    id,
    studentCode: row.studentCode,
    classLevel: row.classLevel || "-",
    room: row.room?.trim() ? row.room : null,
    number: row.number?.trim() ? row.number : null,
    title: row.title?.trim() ? row.title : null,
    firstName: row.firstName,
    lastName: row.lastName,
    createdAt,
    updatedAt,
  }
}

function compareNullable(a: string | null, b: string | null) {
  const left = a?.trim() ?? ""
  const right = b?.trim() ?? ""
  if (!left && right) return -1
  if (left && !right) return 1
  return collator.compare(left, right)
}

function compareStudentNumber(a: string | null, b: string | null) {
  const numA = Number(a)
  const numB = Number(b)
  if (Number.isFinite(numA) && Number.isFinite(numB)) {
    return numA - numB
  }
  return compareNullable(a, b)
}

function sortStudents(records: StudentRecord[]) {
  return records.slice().sort((a, b) => {
    let result = collator.compare(a.classLevel || "", b.classLevel || "")
    if (result !== 0) return result
    result = compareNullable(a.room, b.room)
    if (result !== 0) return result
    result = compareStudentNumber(a.number, b.number)
    if (result !== 0) return result
    result = collator.compare(a.firstName, b.firstName)
    if (result !== 0) return result
    return collator.compare(a.lastName, b.lastName)
  })
}

function matchesClassFilter(student: StudentRecord, classFilter?: ClassFilter | null) {
  if (!classFilter?.classLevel) return true
  if (student.classLevel !== classFilter.classLevel) return false
  if (classFilter.room === undefined) return true
  if (classFilter.room) {
    return (student.room ?? "") === classFilter.room
  }
  return !student.room
}

function matchesSearch(student: StudentRecord, search?: string | null) {
  const term = search?.trim().toLowerCase()
  if (!term) return true
  return (
    student.studentCode.toLowerCase().includes(term) ||
    student.firstName.toLowerCase().includes(term) ||
    student.lastName.toLowerCase().includes(term)
  )
}

export async function getAllStudents(): Promise<StudentRecord[]> {
  const rows = await getStudentSheetRows()
  return rows.map(toStudentRecord).filter((record): record is StudentRecord => Boolean(record))
}

export async function listStudents(options: ListStudentsOptions = {}): Promise<PaginatedStudents> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 500)
  const page = Math.max(options.page ?? 1, 1)
  const offset = (page - 1) * limit

  const allStudents = await getAllStudents()
  const filtered = allStudents.filter(
    (student) => matchesClassFilter(student, options.classFilter ?? null) && matchesSearch(student, options.search)
  )
  const sorted = sortStudents(filtered)
  const students = sorted.slice(offset, offset + limit)
  return { students, total: filtered.length }
}

export async function getStudentByCode(studentCode: string): Promise<StudentRecord | null> {
  const trimmed = studentCode.trim()
  if (!trimmed) return null
  const students = await getAllStudents()
  return students.find((student) => student.studentCode === trimmed) ?? null
}

export async function bulkUpsertStudents(rows: StudentImportRow[]): Promise<{ processed: number }> {
  if (!rows.length) {
    return { processed: 0 }
  }

  const normalizedRows = rows
    .map(normalizeImportRow)
    .filter((row): row is StudentImportRow => Boolean(row))

  if (!normalizedRows.length) {
    return { processed: 0 }
  }

  const existingRows = await getStudentSheetRows()
  const existingIds = new Set(existingRows.map((row) => row.id).filter(Boolean))
  const rowMap = new Map(existingRows.map((row) => [row.studentCode, row]))

  for (const row of normalizedRows) {
    const code = row.studentCode
    const timestamp = new Date().toISOString()
    const existing = rowMap.get(code)
    if (existing) {
      existing.classLevel = row.classLevel
      existing.room = row.room || ""
      existing.number = row.number || ""
      existing.title = row.title || ""
      existing.firstName = row.firstName
      existing.lastName = row.lastName
      existing.updatedAt = timestamp
    } else {
      const newId = String(generateRecordId(existingIds))
      existingIds.add(newId)
      const newRow: StudentSheetRow = {
        id: newId,
        studentCode: code,
        classLevel: row.classLevel,
        room: row.room || "",
        number: row.number || "",
        title: row.title || "",
        firstName: row.firstName,
        lastName: row.lastName,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      existingRows.push(newRow)
      rowMap.set(code, newRow)
    }
  }

  await saveStudentSheetRows(existingRows)
  return { processed: normalizedRows.length }
}

export async function listStudentCodes(): Promise<string[]> {
  const rows = await getStudentSheetRows()
  const codes = new Set<string>()
  for (const row of rows) {
    const code = row.studentCode.trim()
    if (code) {
      codes.add(code)
    }
  }
  return Array.from(codes).sort((a, b) => collator.compare(a, b))
}

export async function listClassRooms(): Promise<Array<{ classLevel: string; room: string | null }>> {
  const students = await getAllStudents()
  const combos = new Map<string, { classLevel: string; room: string | null }>()
  for (const student of students) {
    const room = student.room ?? null
    const key = `${student.classLevel}::${room ?? ""}`
    if (!combos.has(key)) {
      combos.set(key, { classLevel: student.classLevel, room })
    }
  }
  const values = Array.from(combos.values())
  values.sort((a, b) => {
    const levelCompare = collator.compare(a.classLevel, b.classLevel)
    if (levelCompare !== 0) return levelCompare
    return compareNullable(a.room, b.room)
  })
  return values
}

export async function deleteStudentsByCodes(codes: string[]): Promise<void> {
  const normalizedCodes = codes.map((code) => code.trim()).filter(Boolean)
  if (!normalizedCodes.length) return

  const codeSet = new Set(normalizedCodes)
  const studentRows = await getStudentSheetRows()
  const removedRows = studentRows.filter((row) => codeSet.has(row.studentCode))
  if (!removedRows.length) {
    return
  }

  const remainingRows = studentRows.filter((row) => !codeSet.has(row.studentCode))
  await saveStudentSheetRows(remainingRows)

  const removedIds = new Set(removedRows.map((row) => row.id))
  if (!removedIds.size) {
    return
  }

  const attendanceRows = await getAttendanceSheetRows()
  const filteredAttendance = attendanceRows.filter((row) => !removedIds.has(row.studentId))
  if (filteredAttendance.length !== attendanceRows.length) {
    await saveAttendanceSheetRows(filteredAttendance)
  }
}
