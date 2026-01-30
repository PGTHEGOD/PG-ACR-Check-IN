import { NextRequest, NextResponse } from "next/server"
import { queryRows } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
    try {
        const body = await req.json()
        const { student_id } = body

        if (!student_id) {
            return NextResponse.json({ error: "Missing student_id" }, { status: 400 })
        }

        // Check for attendance record:
        // 1. Matches student_code (student_id from request)
        // 2. updated_at is within the last 10 minutes
        // 3. purposes contains "ใช้คอมทำงาน"
        // Note: purposes is stored as JSON string or plain string.
        // We use LIKE for a simple check since "ใช้คอมทำงาน" is distinct.
        const sql = `
            SELECT s.first_name, s.last_name
            FROM attendance_logs a
            JOIN students s ON a.student_id = s.id
            WHERE s.student_code = ?
              AND a.updated_at >= NOW() - INTERVAL 10 MINUTE
              AND a.purposes LIKE '%ใช้คอมทำงาน%'
            ORDER BY a.updated_at DESC
            LIMIT 1
        `

        const rows = await queryRows<{ first_name: string, last_name: string }>(sql, [student_id])

        if (rows.length > 0) {
            return NextResponse.json({
                name: rows[0].first_name,
                surname: rows[0].last_name
            })
        } else {
            return NextResponse.json({ error: "Student not registered yet" }, { status: 404 })
        }

    } catch (error) {
        console.error("Register-Net Check Error:", error)
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
    }
}
