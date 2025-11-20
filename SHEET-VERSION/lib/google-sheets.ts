import "server-only"

import { google, sheets_v4 } from "googleapis"

const SHEETS_SCOPE = ["https://www.googleapis.com/auth/spreadsheets"]

interface SheetsConfig {
  spreadsheetId: string
  studentsSheetName: string
  attendanceSheetName: string
  serviceAccountEmail: string
  privateKey: string
}

const config: SheetsConfig = {
  spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID || "",
  studentsSheetName: process.env.GOOGLE_SHEETS_STUDENTS_SHEET || "Students",
  attendanceSheetName: process.env.GOOGLE_SHEETS_ATTENDANCE_SHEET || "Attendance",
  serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "",
  privateKey: (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
}

const globalForSheets = globalThis as typeof globalThis & {
  __sheetsClientPromise?: Promise<sheets_v4.Sheets>
}

const STUDENT_HEADERS = [
  "id",
  "studentCode",
  "classLevel",
  "room",
  "number",
  "title",
  "firstName",
  "lastName",
  "createdAt",
  "updatedAt",
] as const

const ATTENDANCE_HEADERS = [
  "id",
  "studentId",
  "attendanceDate",
  "attendanceTime",
  "purposes",
  "createdAt",
  "updatedAt",
] as const

const SHEET_DEFINITIONS = [
  { title: () => config.studentsSheetName, headers: STUDENT_HEADERS },
  { title: () => config.attendanceSheetName, headers: ATTENDANCE_HEADERS },
]

let sheetStructurePromise: Promise<void> | null = null

function ensureConfigReady() {
  if (!config.spreadsheetId) {
    throw new Error("GOOGLE_SHEETS_SPREADSHEET_ID is not set")
  }
  if (!config.serviceAccountEmail) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_EMAIL is not set")
  }
  if (!config.privateKey) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY is not set")
  }
}

async function getSheetsClient(): Promise<sheets_v4.Sheets> {
  ensureConfigReady()
  if (!globalForSheets.__sheetsClientPromise) {
    const auth = new google.auth.JWT({
      email: config.serviceAccountEmail,
      key: config.privateKey,
      scopes: SHEETS_SCOPE,
    })
    globalForSheets.__sheetsClientPromise = (async () => {
      try {
        await auth.authorize()
        return google.sheets({ version: "v4", auth })
      } catch (error) {
        globalForSheets.__sheetsClientPromise = undefined
        throw error
      }
    })()
  }
  return globalForSheets.__sheetsClientPromise
}

function escapeSheetName(name: string): string {
  const normalized = name.replace(/'/g, "''")
  return `'${normalized}'`
}

function toColumnLabel(index: number): string {
  let label = ""
  let current = index
  while (current > 0) {
    const remainder = (current - 1) % 26
    label = String.fromCharCode(65 + remainder) + label
    current = Math.floor((current - 1) / 26)
  }
  return label
}

async function ensureSheetStructure(sheets: sheets_v4.Sheets): Promise<void> {
  if (sheetStructurePromise) return sheetStructurePromise
  sheetStructurePromise = (async () => {
    try {
      const { data } = await sheets.spreadsheets.get({
        spreadsheetId: config.spreadsheetId,
        fields: "sheets(properties(title))",
      })
      const existingTitles = new Set(
        (data.sheets ?? [])
          .map((sheet) => sheet.properties?.title)
          .filter((title): title is string => Boolean(title))
      )

      const requests: sheets_v4.Schema$Request[] = []
      for (const definition of SHEET_DEFINITIONS) {
        const title = definition.title()
        if (!existingTitles.has(title)) {
          requests.push({
            addSheet: {
              properties: {
                title,
              },
            },
          })
        }
      }

      if (requests.length) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: config.spreadsheetId,
          requestBody: { requests },
        })
      }

    await Promise.all(
      SHEET_DEFINITIONS.map(async (definition) => {
        const title = definition.title()
        const headers = definition.headers
        const endColumn = toColumnLabel(headers.length)
        await sheets.spreadsheets.values.update({
          spreadsheetId: config.spreadsheetId,
          range: `${escapeSheetName(title)}!A1:${endColumn}1`,
          valueInputOption: "RAW",
          requestBody: { values: [headers] },
        })
      })
    )
    } catch (error) {
      sheetStructurePromise = null
      throw error
    }
  })()
  return sheetStructurePromise
}

async function readSheetRows(sheetName: string, columnCount: number): Promise<string[][]> {
  const sheets = await getSheetsClient()
  await ensureSheetStructure(sheets)
  const endColumn = toColumnLabel(columnCount)
  const range = `${escapeSheetName(sheetName)}!A2:${endColumn}`
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range,
  })
  const values = (response.data.values as string[][] | undefined) ?? []
  return values.map((row) =>
    Array.from({ length: columnCount }, (_, index) => (row[index] ?? "").toString())
  )
}

async function writeSheetRows(sheetName: string, columnCount: number, rows: string[][]): Promise<void> {
  const sheets = await getSheetsClient()
  await ensureSheetStructure(sheets)
  const endColumn = toColumnLabel(columnCount)
  const range = `${escapeSheetName(sheetName)}!A2:${endColumn}`

  await sheets.spreadsheets.values.clear({
    spreadsheetId: config.spreadsheetId,
    range,
  })

  if (!rows.length) return

  await sheets.spreadsheets.values.update({
    spreadsheetId: config.spreadsheetId,
    range,
    valueInputOption: "RAW",
    requestBody: { values: rows },
  })
}

export interface StudentSheetRow {
  id: string
  studentCode: string
  classLevel: string
  room: string
  number: string
  title: string
  firstName: string
  lastName: string
  createdAt: string
  updatedAt: string
}

export interface AttendanceSheetRow {
  id: string
  studentId: string
  attendanceDate: string
  attendanceTime: string
  purposes: string
  createdAt: string
  updatedAt: string
}

export async function getStudentSheetRows(): Promise<StudentSheetRow[]> {
  const rows = await readSheetRows(config.studentsSheetName, STUDENT_HEADERS.length)
  return rows.map((row) => ({
    id: row[0] || "",
    studentCode: row[1] || "",
    classLevel: row[2] || "",
    room: row[3] || "",
    number: row[4] || "",
    title: row[5] || "",
    firstName: row[6] || "",
    lastName: row[7] || "",
    createdAt: row[8] || "",
    updatedAt: row[9] || "",
  }))
}

export async function saveStudentSheetRows(rows: StudentSheetRow[]): Promise<void> {
  const values = rows.map((row) => [
    row.id ?? "",
    row.studentCode ?? "",
    row.classLevel ?? "",
    row.room ?? "",
    row.number ?? "",
    row.title ?? "",
    row.firstName ?? "",
    row.lastName ?? "",
    row.createdAt ?? "",
    row.updatedAt ?? "",
  ])
  await writeSheetRows(config.studentsSheetName, STUDENT_HEADERS.length, values)
}

export async function getAttendanceSheetRows(): Promise<AttendanceSheetRow[]> {
  const rows = await readSheetRows(config.attendanceSheetName, ATTENDANCE_HEADERS.length)
  return rows.map((row) => ({
    id: row[0] || "",
    studentId: row[1] || "",
    attendanceDate: row[2] || "",
    attendanceTime: row[3] || "",
    purposes: row[4] || "",
    createdAt: row[5] || "",
    updatedAt: row[6] || "",
  }))
}

export async function saveAttendanceSheetRows(rows: AttendanceSheetRow[]): Promise<void> {
  const values = rows.map((row) => [
    row.id ?? "",
    row.studentId ?? "",
    row.attendanceDate ?? "",
    row.attendanceTime ?? "",
    row.purposes ?? "",
    row.createdAt ?? "",
    row.updatedAt ?? "",
  ])
  await writeSheetRows(config.attendanceSheetName, ATTENDANCE_HEADERS.length, values)
}

export function generateRecordId(existingIds?: Set<string>): number {
  let value = Date.now() + Math.floor(Math.random() * 1000)
  if (!existingIds) {
    return value
  }
  while (existingIds.has(String(value))) {
    value += Math.floor(Math.random() * 1000) + 1
  }
  return value
}
