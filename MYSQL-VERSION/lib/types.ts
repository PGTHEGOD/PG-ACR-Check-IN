export interface StudentRecord {
  id: number
  studentCode: string
  classLevel: string
  room: string | null
  number: string | null
  title: string | null
  firstName: string
  lastName: string
  createdAt: string
  updatedAt: string
  points: number
}

export interface AttendanceRecord {
  id: number
  studentId: number
  studentCode: string
  attendanceDate: string
  attendanceTime: string
  purposes: string[]
  classLevel: string
  room: string | null
  title: string | null
  number: string | null
  firstName: string
  lastName: string
}

export interface AttendanceStats {
  totalRecords: number
  uniqueStudents: number
  purposeCounts: Record<string, number>
}

export interface StudentImportRow {
  studentCode: string
  classLevel: string
  room: string
  number: string
  title: string
  firstName: string
  lastName: string
}

export interface AttendanceResponse {
  records: AttendanceRecord[]
  stats: AttendanceStats
}

export interface PaginatedStudents {
  students: StudentRecord[]
  total: number
}
