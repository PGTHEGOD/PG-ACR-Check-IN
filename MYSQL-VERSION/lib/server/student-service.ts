import "server-only"

import { escapeValue, execute, queryRows } from "@/lib/db"
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

const toLikeValue = (value: string) => `%${value}%`

function buildWhereClause({
  search,
  classFilter,
}: {
  search?: string | null
  classFilter?: ClassFilter | null
}) {
  const conditions: string[] = []
  const params: unknown[] = []

  if (classFilter?.classLevel) {
    conditions.push("s.class_level = ?")
    params.push(classFilter.classLevel)
    if (classFilter.room !== undefined) {
      if (classFilter.room) {
        conditions.push("COALESCE(s.room, '') = ?")
        params.push(classFilter.room)
      } else {
        conditions.push("(s.room IS NULL OR s.room = '')")
      }
    }
  }

  if (search) {
    const likeValue = toLikeValue(search)
    conditions.push("(s.student_code LIKE ? OR s.first_name LIKE ? OR s.last_name LIKE ?)")
    params.push(likeValue, likeValue, likeValue)
  }

  const clause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""
  return { clause, params }
}

export async function listStudents(options: ListStudentsOptions = {}): Promise<PaginatedStudents> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 500)
  const page = Math.max(options.page ?? 1, 1)
  const offset = (page - 1) * limit

  const { clause, params } = buildWhereClause({
    search: options.search?.trim(),
    classFilter: options.classFilter ?? null,
  })

  const students = await queryRows<StudentRecord>(
    `SELECT
        s.id,
        s.student_code AS studentCode,
        s.class_level AS classLevel,
        NULLIF(s.room, '') AS room,
        NULLIF(s.student_number, '') AS number,
        NULLIF(s.title, '') AS title,
        s.first_name AS firstName,
        s.last_name AS lastName,
        DATE_FORMAT(s.created_at, '%Y-%m-%dT%H:%i:%sZ') AS createdAt,
        DATE_FORMAT(s.updated_at, '%Y-%m-%dT%H:%i:%sZ') AS updatedAt,
        COALESCE(score.total_points, 0) AS points
     FROM students s
     LEFT JOIN (
        SELECT student_id, SUM(change_value) AS total_points
        FROM library_scores
        GROUP BY student_id
     ) score ON score.student_id = s.student_code
     ${clause}
     ORDER BY s.class_level, s.room, s.student_number, s.first_name, s.last_name
     LIMIT ?
     OFFSET ?`,
    [...params, limit, offset]
  )

  const totalRows = await queryRows<{ total: number }>(
    `SELECT COUNT(*) AS total FROM students s ${clause}`,
    params
  )

  return { students, total: totalRows[0]?.total ?? 0 }
}

export async function getStudentByCode(studentCode: string): Promise<StudentRecord | null> {
  const trimmed = studentCode.trim()
  if (!trimmed) return null

  const rows = await queryRows<StudentRecord>(
    `SELECT
        s.id,
        s.student_code AS studentCode,
        s.class_level AS classLevel,
        NULLIF(s.room, '') AS room,
        NULLIF(s.student_number, '') AS number,
        NULLIF(s.title, '') AS title,
        s.first_name AS firstName,
        s.last_name AS lastName,
        DATE_FORMAT(s.created_at, '%Y-%m-%dT%H:%i:%sZ') AS createdAt,
        DATE_FORMAT(s.updated_at, '%Y-%m-%dT%H:%i:%sZ') AS updatedAt,
        COALESCE(score.total_points, 0) AS points
     FROM students s
     LEFT JOIN (
        SELECT student_id, SUM(change_value) AS total_points
        FROM library_scores
        GROUP BY student_id
     ) score ON score.student_id = s.student_code
     WHERE s.student_code = ?
     LIMIT 1`,
    [trimmed]
  )

  return rows[0] ?? null
}

function normalizeImportRow(row: StudentImportRow): StudentImportRow | null {
  const normalize = (value?: string) => (value ? value.trim() : "")
  const normalized: StudentImportRow = {
    studentCode: normalize(row.studentCode),
    classLevel: normalize(row.classLevel) || "-",
    room: normalize(row.room) || "-",
    number: normalize(row.number) || "",
    title: normalize(row.title) || "",
    firstName: normalize(row.firstName),
    lastName: normalize(row.lastName),
  }

  if (!normalized.studentCode || !normalized.firstName || !normalized.lastName) {
    return null
  }

  return normalized
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

  const chunkSize = 100
  for (let i = 0; i < normalizedRows.length; i += chunkSize) {
    const chunk = normalizedRows.slice(i, i + chunkSize)
    const values = chunk
      .map((row) =>
        [
          escapeValue(row.studentCode),
          escapeValue(row.classLevel),
          escapeValue(row.room || null),
          escapeValue(row.number || null),
          escapeValue(row.title || null),
          escapeValue(row.firstName),
          escapeValue(row.lastName),
        ].join(",")
      )
      .map((valueString) => `(${valueString})`)
      .join(",")

    const sql = `INSERT INTO students (student_code, class_level, room, student_number, title, first_name, last_name)
      VALUES ${values}
      ON DUPLICATE KEY UPDATE
        class_level = VALUES(class_level),
        room = VALUES(room),
        student_number = VALUES(student_number),
        title = VALUES(title),
        first_name = VALUES(first_name),
        last_name = VALUES(last_name),
        updated_at = CURRENT_TIMESTAMP`

    await execute(sql)
  }

  return { processed: normalizedRows.length }
}

export async function listStudentCodes(): Promise<string[]> {
  const rows = await queryRows<{ code: string }>(
    `SELECT DISTINCT student_code AS code
     FROM students
     ORDER BY student_code`
  )
  return rows.map((row) => row.code)
}

export async function listClassRooms(): Promise<Array<{ classLevel: string; room: string | null }>> {
  return queryRows(
    `SELECT DISTINCT
        class_level AS classLevel,
        COALESCE(NULLIF(room, ''), NULL) AS room
     FROM students
     ORDER BY class_level, room`
  )
}

export async function deleteStudentsByCodes(codes: string[]): Promise<void> {
  if (!codes.length) return
  const placeholders = codes.map(() => "?").join(",")
  await execute(`DELETE FROM students WHERE student_code IN (${placeholders})`, codes)
}
