import mysql from "mysql2/promise"

interface MysqlConfig {
  host: string
  port: number
  user: string
  password?: string
  database: string
}

const config: MysqlConfig = {
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT || "3306"),
  user: process.env.MYSQL_USER || "pgdev",
  password: process.env.MYSQL_PASSWORD || "parkggez",
  database: process.env.MYSQL_DATABASE || "library_system",
}

type MysqlPool = mysql.Pool

const globalForMysql = globalThis as typeof globalThis & { __libraryMysql?: MysqlPool }

function createPool(): MysqlPool {
  return mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    waitForConnections: true,
    connectionLimit: 10,
    charset: "utf8mb4_unicode_ci",
    timezone: "Z",
  }) as MysqlPool
}

const pool: MysqlPool = globalForMysql.__libraryMysql ?? createPool()
if (process.env.NODE_ENV !== "production") {
  globalForMysql.__libraryMysql = pool
}

export function escapeValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "NULL"
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value)
  }

  if (typeof value === "boolean") {
    return value ? "1" : "0"
  }

  const str = String(value)
  return `'${str.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`
}

function escapeIdentifier(identifier: string): string {
  return "`" + identifier.replace(/`/g, "``") + "`"
}

let schemaReady: Promise<void> | null = null

async function ensureSchema(): Promise<void> {
  if (schemaReady) return schemaReady
  const database = escapeIdentifier(config.database)
  schemaReady = (async () => {
    const serverConnection = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
    })

    try {
      await serverConnection.query(
        `CREATE DATABASE IF NOT EXISTS ${database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
      )

      await serverConnection.query(
        `CREATE TABLE IF NOT EXISTS ${database}.students (
          id INT UNSIGNED NOT NULL AUTO_INCREMENT,
          student_code VARCHAR(32) NOT NULL,
          class_level VARCHAR(32) NOT NULL,
          room VARCHAR(16) NULL,
          student_number VARCHAR(16) NULL,
          title VARCHAR(64) NULL,
          first_name VARCHAR(128) NOT NULL,
          last_name VARCHAR(128) NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uniq_student_code (student_code)
        ) CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci`
      )

      await serverConnection.query(
        `CREATE TABLE IF NOT EXISTS ${database}.attendance_logs (
          id INT UNSIGNED NOT NULL AUTO_INCREMENT,
          student_id INT UNSIGNED NOT NULL,
          attendance_date DATE NOT NULL,
          attendance_time TIME NOT NULL,
          purposes LONGTEXT NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uniq_student_date (student_id, attendance_date),
          CONSTRAINT fk_attendance_student FOREIGN KEY (student_id) REFERENCES ${database}.students(id) ON DELETE CASCADE
        ) CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci`
      )

      await serverConnection.query(
        `CREATE TABLE IF NOT EXISTS ${database}.library_scores (
          id INT UNSIGNED NOT NULL AUTO_INCREMENT,
          student_id VARCHAR(32) NOT NULL,
          change_value INT NOT NULL,
          note VARCHAR(255) NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          INDEX idx_scores_student (student_id)
        ) CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci`
      )
    } finally {
      await serverConnection.end()
    }
  })()

  return schemaReady
}

function extractFirstColumn(row: mysql.RowDataPacket): unknown {
  const value = row.json ?? row.JSON ?? Object.values(row)[0]
  return value
}

export async function queryJson<T>(sql: string, defaultValue: T, params: unknown[] = []): Promise<T> {
  await ensureSchema()
  const [rows] = await pool.query<mysql.RowDataPacket[]>(sql, params)
  if (!rows.length) return defaultValue
  const raw = extractFirstColumn(rows[0])
  if (raw === null || raw === undefined || raw === "") {
    return defaultValue
  }
  if (typeof raw === "string") {
    return JSON.parse(raw) as T
  }
  if (Buffer.isBuffer(raw)) {
    return JSON.parse(raw.toString("utf8")) as T
  }
  return raw as T
}

export async function execute(sql: string, params: unknown[] = []): Promise<void> {
  await ensureSchema()
  await pool.query(sql, params)
}

export async function queryRows<T extends mysql.RowDataPacket>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  await ensureSchema()
  const [rows] = await pool.query<mysql.RowDataPacket[]>(sql, params)
  return rows as T[]
}

export function getMysqlConfig() {
  return { ...config }
}
