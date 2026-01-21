import { NextRequest, NextResponse } from "next/server"
import { queryRows } from "@/lib/db"

export const dynamic = "force-dynamic"

// These must match the purposes in the DB exactly, or be mapped correctly.
// Based on lib/purposes-data.ts:
// "ปริ้นงาน / ถ่ายเอกสาร", "ยืม - คืนหนังสือ", "อ่านหนังสือ", "ทำการบ้าน", "ใช้คอมทำงาน"
const PURPOSE_KEYS = {
    borrow: "ยืม - คืนหนังสือ",
    read: "อ่านหนังสือ",
    homework: "ทำการบ้าน",
    computer: "ใช้คอมทำงาน",
    print: "ปริ้นงาน / ถ่ายเอกสาร",
}

// Order of class levels for the report
const ORDERED_LEVELS = [
    "ป.1", "ป.2", "ป.3", "ป.4", "ป.5", "ป.6",
    "ม.1", "ม.2", "ม.3", "ม.4", "ม.5", "ม.6"
]

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url)
        const monthParam = searchParams.get("month") // YYYY-MM

        let startDate: string
        let endDate: string
        let monthLabel: string

        const now = new Date()

        if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
            const [y, m] = monthParam.split("-").map(Number)
            const date = new Date(y, m - 1, 1)
            startDate = `${y}-${String(m).padStart(2, '0')}-01`
            endDate = new Date(y, m, 0).toISOString().split("T")[0] // Last day of month

            const thaiMonth = date.toLocaleDateString("th-TH", { month: "long" })
            const thaiYear = date.getFullYear() + 543
            monthLabel = `${thaiMonth} ${thaiYear}`
        } else {
            // Default to current month
            const y = now.getFullYear()
            const m = now.getMonth() + 1
            startDate = `${y}-${String(m).padStart(2, '0')}-01`
            endDate = new Date(y, m, 0).toISOString().split("T")[0]

            const thaiMonth = now.toLocaleDateString("th-TH", { month: "long" })
            const thaiYear = now.getFullYear() + 543
            monthLabel = `${thaiMonth} ${thaiYear}`
        }

        // Fetch all records for the month joined with student data
        // We need class_level to group by.
        const sql = `
      SELECT 
        s.class_level,
        a.purposes
      FROM attendance_logs a
      JOIN students s ON a.student_id = s.id
      WHERE a.attendance_date BETWEEN ? AND ?
    `

        const rows = await queryRows<{ class_level: string, purposes: any }>(sql, [startDate, endDate])

        // Initialize stats map
        // Structure: { "ป.1": { borrow: 0, read: 0, ... }, ... }
        const stats: Record<string, Record<string, number>> = {}

        // Ensure all levels exist in stats even if count is 0
        for (const level of ORDERED_LEVELS) {
            stats[level] = {
                borrow: 0,
                read: 0,
                homework: 0,
                computer: 0,
                print: 0,
                total: 0 // Sum of actions
            }
        }
        // Also add an entry for "Other" or unknown levels if necessary, 
        // but the requirement is specific to these levels. We can track others if needed.

        let grandTotal = 0

        // Process rows
        for (const row of rows) {
            // Normalize class level (trim)
            let level = row.class_level?.trim() || ""

            // Attempt to match standard levels if slight variations exist, 
            // otherwise ignore or put in 'Other' (skipping 'Other' for now to match strict report)
            if (!stats[level]) {
                // Try to find if it's a valid level
                if (ORDERED_LEVELS.includes(level)) {
                    // it's valid
                } else {
                    continue; // Skip unknown levels for this specific report
                }
            }

            // Parse purposes
            let purposesList: string[] = []
            if (typeof row.purposes === 'string') {
                try {
                    // It might be a JSON string like '["a", "b"]' or just a string
                    if (row.purposes.startsWith('[')) {
                        purposesList = JSON.parse(row.purposes)
                    } else {
                        purposesList = [row.purposes]
                    }
                } catch {
                    purposesList = [row.purposes] // fallback
                }
            } else if (Array.isArray(row.purposes)) {
                purposesList = row.purposes
            }

            if (!Array.isArray(purposesList)) continue

            for (const p of purposesList) {
                const purpose = p?.toString()?.trim()
                if (!purpose) continue

                let matched = false
                if (purpose === PURPOSE_KEYS.borrow) {
                    stats[level].borrow++
                    matched = true
                } else if (purpose === PURPOSE_KEYS.read) {
                    stats[level].read++
                    matched = true
                } else if (purpose === PURPOSE_KEYS.homework) {
                    stats[level].homework++
                    matched = true
                } else if (purpose === PURPOSE_KEYS.computer) {
                    stats[level].computer++
                    matched = true
                } else if (purpose === PURPOSE_KEYS.print) {
                    stats[level].print++
                    matched = true
                }

                if (matched) {
                    stats[level].total++
                    grandTotal++
                }
            }
        }

        // Prepare table data array
        const tableData = ORDERED_LEVELS.map(level => {
            const d = stats[level]
            return {
                level,
                borrow: d.borrow,
                read: d.read,
                homework: d.homework,
                computer: d.computer,
                print: d.print,
                total: d.total,
                percentage: grandTotal > 0 ? ((d.total / grandTotal) * 100).toFixed(2) : "0.00"
            }
        })

        // Calculate columns totals
        const totals = {
            level: "รวม",
            borrow: 0,
            read: 0,
            homework: 0,
            computer: 0,
            print: 0,
            total: 0,
            percentage: "100.00"
        }

        for (const d of tableData) {
            totals.borrow += d.borrow
            totals.read += d.read
            totals.homework += d.homework
            totals.computer += d.computer
            totals.print += d.print
            totals.total += d.total
        }

        // Top 3 Logic
        // We need Top 3 levels for: Reading, Print/Copy, Homework
        const getTop3 = (key: 'read' | 'print' | 'homework') => {
            const sorted = [...tableData].sort((a, b) => b[key] - a[key])
            // Filter out usage > 0 (optional, but typical for "top stats")
            // If all are 0, it returns empty or zeros.
            return sorted.slice(0, 3).map((item, index) => ({
                rank: index + 1,
                level: item.level,
                count: item[key]
            })).filter(i => i.count > 0)
        }

        const top3 = {
            reading: getTop3('read'),
            print: getTop3('print'),
            homework: getTop3('homework')
        }

        // Pie Chart Data (Distribution by Level)
        // Filter out levels with 0 total usage to keep chart clean
        const pieChartData = tableData
            .filter(d => d.total > 0)
            .map(d => ({
                name: d.level,
                value: d.total,
                percentage: d.percentage
            }))

        return NextResponse.json({
            monthLabel,
            tableData,
            totals,
            top3,
            pieChartData
        })

    } catch (error) {
        console.error("Summary Report Error:", error)
        return NextResponse.json({ error: "Failed to generate report" }, { status: 500 })
    }
}
