import "server-only"

import { escapeValue, execute, queryJson } from "@/lib/db"
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

  const students = await queryJson<StudentRecord[]>(
    `SELECT COALESCE(JSON_ARRAYAGG(
        JSON_OBJECT(
          'id', sub.id,
          'studentCode', sub.student_code,
          'classLevel', sub.class_level,
          'room', sub.room,
          'number', sub.student_number,
          'title', sub.title,
          'firstName', sub.first_name,
          'lastName', sub.last_name,
          'createdAt', DATE_FORMAT(sub.created_at, '%Y-%m-%dT%H:%i:%sZ'),
          'updatedAt', DATE_FORMAT(sub.updated_at, '%Y-%m-%dT%H:%i:%sZ')
        ) ORDER BY sub.class_level, sub.room, sub.student_number, sub.first_name, sub.last_name
      ), JSON_ARRAY())
     FROM (
        SELECT s.*
        FROM students s
        ${clause}
        ORDER BY s.class_level, s.room, s.student_number, s.first_name, s.last_name
        LIMIT ?
        OFFSET ?
     ) sub`,
    [],
    [...params, limit, offset]
  )

  const totalResult = await queryJson<{ total: number }>(
    `SELECT JSON_OBJECT('total', COUNT(*)) FROM students s ${clause}`,
    { total: 0 },
    params
  )

  return { students, total: totalResult.total }
}

export async function getStudentByCode(studentCode: string): Promise<StudentRecord | null> {
  const trimmed = studentCode.trim()
  if (!trimmed) return null

  return queryJson<StudentRecord | null>(
    `SELECT JSON_OBJECT(
        'id', s.id,
        'studentCode', s.student_code,
        'classLevel', s.class_level,
        'room', s.room,
        'number', s.student_number,
        'title', s.title,
        'firstName', s.first_name,
        'lastName', s.last_name,
        'createdAt', DATE_FORMAT(s.created_at, '%Y-%m-%dT%H:%i:%sZ'),
        'updatedAt', DATE_FORMAT(s.updated_at, '%Y-%m-%dT%H:%i:%sZ')
      )
     FROM students s
     WHERE s.student_code = ?
     LIMIT 1`,
    null,
    [trimmed]
  )
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
  return queryJson(
    `SELECT COALESCE(JSON_ARRAYAGG(code ORDER BY code), JSON_ARRAY())
     FROM (
       SELECT DISTINCT student_code AS code
       FROM students
     ) t`,
    []
  )
}

export async function listClassRooms(): Promise<Array<{ classLevel: string; room: string | null }>> {
  return queryJson(
    `SELECT COALESCE(JSON_ARRAYAGG(
        JSON_OBJECT(
          'classLevel', c.class_level,
          'room', c.room
        ) ORDER BY c.class_level, c.room
      ), JSON_ARRAY())
     FROM (
       SELECT DISTINCT class_level, COALESCE(NULLIF(room, ''), NULL) AS room
       FROM students
       ORDER BY class_level, room
     ) c`,
    []
  )
}

export async function deleteStudentsByCodes(codes: string[]): Promise<void> {
  if (!codes.length) return
  const placeholders = codes.map(() => "?").join(",")
  await execute(`DELETE FROM students WHERE student_code IN (${placeholders})`, codes)
}
