"use client"

import type { ChangeEvent } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { AttendanceRecord, AttendanceStats, StudentRecord } from "@/lib/types"
import { purposes } from "@/lib/purposes-data"
import { LogOut, Download, Trash2, Search, RefreshCw, Upload } from "lucide-react"
import { logoutAdmin } from "@/lib/admin-auth"

const SAMPLE_IMPORT_TEMPLATE = `{
  "Worksheet": [
    {
      "รหัสประจำตัว": "24732",
      "ชั้น": "อ.1",
      "ห้อง": "1",
      "เลขที่": "1",
      "คำนำหน้า": "เด็กชาย",
      "ชื่อ": "คงคณิน",
      "นามสกุล": "สุขเกิด"
    }
  ]
}`

const formatClassRoom = (classLevel?: string | null, room?: string | null) => {
  const level = (classLevel || "ไม่ระบุ").trim()
  const roomLabel = (room || "").trim()
  return roomLabel ? `${level}/${roomLabel}` : level
}

const getClassLevelKey = (classLevel?: string | null) => {
  const level = (classLevel ?? "").trim()
  return level || "ไม่ระบุ"
}

const formatClassLevelLabel = (classLevel?: string | null) => {
  const normalized = getClassLevelKey(classLevel)
  if (normalized === "ไม่ระบุ") return normalized
  return normalized.startsWith("ชั้น") ? normalized : `ชั้น ${normalized}`
}

const UTF8_BOM = "\ufeff" // ensures Excel reads Thai text correctly

interface AdminStudentManagementProps {
  onLogout: () => void
}

export default function AdminStudentManagement({ onLogout }: AdminStudentManagementProps) {
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([])
  const [stats, setStats] = useState<AttendanceStats | null>(null)
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7))
  const [searchTerm, setSearchTerm] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [roster, setRoster] = useState<StudentRecord[]>([])
  const [rosterSearch, setRosterSearch] = useState("")
  const [rosterLoading, setRosterLoading] = useState(false)
  const [rosterError, setRosterError] = useState("")
  const [jsonPayload, setJsonPayload] = useState(SAMPLE_IMPORT_TEMPLATE)
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [importWarning, setImportWarning] = useState<{
    message: string
    missingCount: number
    sampleCodes: string[]
  } | null>(null)
  const [pendingImportText, setPendingImportText] = useState("")
  const [selectedClass, setSelectedClass] = useState("")
  const [classChoices, setClassChoices] = useState<Array<{ classLevel: string; room: string | null }>>([])
  const [classesLoading, setClassesLoading] = useState(false)
  const [classesError, setClassesError] = useState("")

  const handleLogout = async () => {
    await logoutAdmin().catch(() => null)
    onLogout()
  }

  const fetchAttendance = useCallback(async () => {
    setIsLoading(true)
    setError("")
    try {
      const params = new URLSearchParams({ month: selectedMonth })
      if (searchTerm) {
        params.set("search", searchTerm)
      }
      const response = await fetch(`/api/attendance?${params.toString()}`)
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload.error || "ไม่สามารถโหลดข้อมูลการเข้าใช้ได้")
      }
      setAttendance(payload.records || [])
      setStats(payload.stats || null)
    } catch (err) {
      setAttendance([])
      setStats(null)
      setError((err as Error).message || "ไม่สามารถโหลดข้อมูลการเข้าใช้ได้")
    } finally {
      setIsLoading(false)
    }
  }, [searchTerm, selectedMonth])

  const fetchRoster = useCallback(async () => {
    setRosterLoading(true)
    setRosterError("")
    try {
      const hasClassFilter = Boolean(selectedClass && selectedClass !== "__all__")
      if (!hasClassFilter && !rosterSearch) {
        setRoster([])
        setRosterLoading(false)
        return
      }

      const accumulated: StudentRecord[] = []
      const limit = rosterSearch ? 200 : 500
      let page = 1
      let total = Infinity
      let keepFetching = true

      while (keepFetching) {
        const params = new URLSearchParams({ limit: String(limit), page: String(page) })
        if (rosterSearch) {
          params.set("search", rosterSearch)
        }
        if (hasClassFilter && selectedClass && selectedClass !== "__all__") {
          params.set("class", selectedClass)
        }

        const response = await fetch(`/api/students?${params.toString()}`)
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(payload.error || "โหลดรายชื่อนักเรียนไม่สำเร็จ")
        }

        const students: StudentRecord[] = payload.students || []
        accumulated.push(...students)
        total = rosterSearch ? students.length : payload.total ?? accumulated.length

        if (rosterSearch || students.length < limit || accumulated.length >= total) {
          keepFetching = false
        } else {
          page += 1
        }
      }

      setRoster(accumulated)
    } catch (err) {
      setRoster([])
      setRosterError((err as Error).message || "โหลดรายชื่อนักเรียนไม่สำเร็จ")
    } finally {
      setRosterLoading(false)
    }
  }, [rosterSearch, selectedClass])

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchAttendance()
    }, 300)
    return () => clearTimeout(timeout)
  }, [fetchAttendance])

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchRoster()
    }, 300)
    return () => clearTimeout(timeout)
  }, [fetchRoster])

  useEffect(() => {
    let ignore = false
    const fetchClasses = async () => {
      setClassesLoading(true)
      setClassesError("")
      try {
        const response = await fetch("/api/classes")
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(payload.error || "ไม่สามารถโหลดรายชื่อชั้นเรียนได้")
        }
        if (!ignore) {
          setClassChoices(payload.classes || [])
        }
      } catch (err) {
        if (!ignore) {
          setClassesError((err as Error).message || "ไม่สามารถโหลดรายชื่อชั้นเรียนได้")
        }
      } finally {
        if (!ignore) {
          setClassesLoading(false)
        }
      }
    }

    fetchClasses()
    return () => {
      ignore = true
    }
  }, [])

  const classCollator = useMemo(() => new Intl.Collator("th"), [])
  const classSelectOptions = useMemo(() => {
    const baseOptions = classChoices
      .map((choice) => ({
        value: `${choice.classLevel}|${choice.room || ""}`,
        label: formatClassRoom(choice.classLevel, choice.room),
      }))
      .sort((a, b) => classCollator.compare(a.label, b.label))

    return [
      { value: "", label: "เลือกชั้น..." },
      { value: "__all__", label: "ทุกชั้น" },
      ...baseOptions,
    ]
  }, [classChoices, classCollator])

  useEffect(() => {
    if (!classSelectOptions.some((option) => option.value === selectedClass)) {
      setSelectedClass("")
    }
  }, [classSelectOptions, selectedClass])

  const purposeColumns = purposes
  const filteredRoster = useMemo(() => {
    if (!selectedClass || selectedClass === "__all__") {
      return roster.slice().sort((a, b) => a.studentCode.localeCompare(b.studentCode, "th"))
    }
    return roster
      .filter((student) => `${student.classLevel}|${student.room || ""}` === selectedClass)
      .sort((a, b) => a.studentCode.localeCompare(b.studentCode, "th"))
  }, [roster, selectedClass])

  const classPurposeSummary = useMemo(() => {
    const purposeSet = new Set(purposeColumns)
    const totals: Record<string, number> = {}
    purposeColumns.forEach((purpose) => {
      totals[purpose] = 0
    })

    const map = new Map<string, Record<string, number>>()

    attendance.forEach((record) => {
      const classLabel = formatClassRoom(record.classLevel, record.room)
      if (!map.has(classLabel)) {
        const init: Record<string, number> = {}
        purposeColumns.forEach((purpose) => {
          init[purpose] = 0
        })
        map.set(classLabel, init)
      }
      const entry = map.get(classLabel)!

      record.purposes.forEach((purpose) => {
        if (!purposeSet.has(purpose)) return
        entry[purpose] = (entry[purpose] ?? 0) + 1
        totals[purpose] = (totals[purpose] ?? 0) + 1
      })
    })

    return {
      rows: Array.from(map.entries()).map(([classLabel, counts]) => ({
        classLabel,
        counts: { ...counts },
      })),
      totals,
    }
  }, [attendance, purposeColumns])

  const sortedClassRows = useMemo(() => {
    return [...classPurposeSummary.rows].sort((a, b) => classCollator.compare(a.classLabel, b.classLabel))
  }, [classPurposeSummary.rows, classCollator])

  const purposeLeaders = useMemo(() => {
    if (!stats) return []
    return Object.entries(stats.purposeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
  }, [stats])

  const handleExportSummary = () => {
    if (!attendance.length) return
    const header = ["CLASS", ...purposeColumns]
    const totals: Record<string, number> = {}
    purposeColumns.forEach((purpose) => {
      totals[purpose] = 0
    })

    const grouped = new Map<string, { label: string; counts: Record<string, number> }>()
    attendance.forEach((record) => {
      const key = getClassLevelKey(record.classLevel)
      if (!grouped.has(key)) {
        const baseCounts: Record<string, number> = {}
        purposeColumns.forEach((purpose) => {
          baseCounts[purpose] = 0
        })
        grouped.set(key, { label: formatClassLevelLabel(record.classLevel), counts: baseCounts })
      }
      const entry = grouped.get(key)!
      record.purposes.forEach((purpose) => {
        entry.counts[purpose] = (entry.counts[purpose] ?? 0) + 1
        totals[purpose] = (totals[purpose] ?? 0) + 1
      })
    })

    const sortedExportRows = Array.from(grouped.values()).sort((a, b) => classCollator.compare(a.label, b.label))

    let csv = header.join(",") + "\n"
    sortedExportRows.forEach((row) => {
      const line = [row.label, ...purposeColumns.map((purpose) => row.counts[purpose] ?? 0)]
      csv += `${line.join(",")}\n`
    })

    const totalsLine = ["รวม", ...purposeColumns.map((purpose) => totals[purpose] ?? 0)]
    csv += totalsLine.join(",")

    const blob = new Blob([`${UTF8_BOM}${csv}`], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = `library_class_summary_${selectedMonth}.csv`
    link.click()
  }

  const handleExportByClass = () => {
    if (!attendance.length) return
    const grouped = new Map<string, { label: string; records: AttendanceRecord[] }>()
    attendance.forEach((record) => {
      const key = getClassLevelKey(record.classLevel)
      if (!grouped.has(key)) {
        grouped.set(key, { label: formatClassLevelLabel(record.classLevel), records: [] })
      }
      grouped.get(key)!.records.push(record)
    })

    const header = ["CLASS", "ROOM", "STUDENT_CODE", "NAME", "PURPOSES", "DATE", "TIME"]
    let csv = header.join(",") + "\n"

    const sortedGroups = Array.from(grouped.values()).sort((a, b) => classCollator.compare(a.label, b.label))
    sortedGroups.forEach(({ label, records }) => {
      records
        .slice()
        .sort((a, b) => classCollator.compare(`${a.firstName}${a.lastName}`, `${b.firstName}${b.lastName}`))
        .forEach((record) => {
          const fullName = `${record.title ? `${record.title} ` : ""}${record.firstName} ${record.lastName}`.trim().replace(/"/g, '""')
          const purposesText = record.purposes.join(" / ").replace(/"/g, '""')
          const line = [
            label,
            record.room || "",
            record.studentCode,
            `"${fullName}"`,
            `"${purposesText}"`,
            record.attendanceDate,
            record.attendanceTime,
          ]
          csv += `${line.join(",")}\n`
        })
    })

    const blob = new Blob([`${UTF8_BOM}${csv}`], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = `library_class_detail_${selectedMonth}.csv`
    link.click()
  }

  const handleDelete = async (recordId: number) => {
    if (!confirm("ต้องการลบการบันทึกนี้?")) return
    const numericId = Number(recordId)
    if (!Number.isFinite(numericId)) {
      alert("รหัสไม่ถูกต้อง")
      return
    }
    try {
      const response = await fetch(`/api/attendance/${numericId}`, { method: "DELETE" })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload.error || "ลบข้อมูลไม่สำเร็จ")
      }
      fetchAttendance()
    } catch (err) {
      alert((err as Error).message)
    }
  }

  const runImport = useCallback(
    async (source: string | unknown, options?: { action?: "update" | "delete" }) => {
      setImportStatus(null)
      setImportError(null)
      const isStringPayload = typeof source === "string"
      const hasContent = isStringPayload ? Boolean((source as string).trim()) : true
      if (!hasContent) {
        setImportError("โปรดใส่ข้อมูล JSON ก่อนนำเข้า")
        return
      }

      setImporting(true)
      try {
        const payloadText = isStringPayload ? (source as string) : JSON.stringify(source)
        const params = new URLSearchParams()
        if (options?.action) {
          params.set("action", options.action)
        }
        const query = params.toString()

        const response = await fetch(`/api/students/import${query ? `?${query}` : ""}`, {
          method: "POST",
          headers: {
            "Content-Type": isStringPayload ? "text/plain;charset=utf-8" : "application/json",
          },
          body: payloadText,
        })
        const body = await response.json().catch(() => ({}))
        if (!response.ok) {
          if (response.status === 409 && body.warning) {
            setPendingImportText(payloadText)
            setImportWarning({
              message: body.warning,
              missingCount: body.missingCount || 0,
              sampleCodes: body.sampleCodes || [],
            })
            setImporting(false)
            return
          }
          throw new Error(body.error || "นำเข้าข้อมูลไม่สำเร็จ")
        }
        setImportStatus(`นำเข้าข้อมูล ${body.processed || 0} รายการแล้ว`)
        setPendingImportText("")
        setImportWarning(null)
        fetchRoster()
      } catch (err) {
        setImportError((err as Error).message || "นำเข้าข้อมูลไม่สำเร็จ")
      } finally {
        setImporting(false)
      }
    },
    [fetchRoster]
  )

  const handleImport = () => {
    runImport(jsonPayload)
  }

  const handleImportWarningAction = (action: "update" | "delete") => {
    if (!pendingImportText) return
    setImportWarning(null)
    runImport(pendingImportText, { action })
  }

  const handleDismissWarning = () => {
    setImportWarning(null)
    setPendingImportText("")
  }

  const handleFileSelection = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      setJsonPayload(text)
      await runImport(text)
    } finally {
      event.target.value = ""
    }
  }

return (
  <>
    <div className="min-h-screen bg-slate-100/70">
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Admin</p>
            <h1 className="text-2xl font-semibold text-slate-900">ระบบจัดการห้องสมุด</h1>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout} className="rounded-full border-slate-300 text-slate-600">
            <LogOut className="w-4 h-4 mr-2" />
            ออกจากระบบ
          </Button>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6">
        {/* Stats */}
        <section className="grid gap-4 md:grid-cols-3">
          <Card className="rounded-2xl border-0 bg-white shadow-sm">
            <CardContent className="space-y-2 p-6">
              <p className="text-sm text-slate-500">รวมการบันทึก</p>
              <p className="text-3xl font-semibold text-blue-600">{stats?.totalRecords ?? 0}</p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-0 bg-white shadow-sm">
            <CardContent className="space-y-2 p-6">
              <p className="text-sm text-slate-500">จำนวนนักเรียน</p>
              <p className="text-3xl font-semibold text-emerald-600">{stats?.uniqueStudents ?? 0}</p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-0 bg-white shadow-sm">
            <CardContent className="space-y-2 p-6">
              <p className="text-sm text-slate-500">จุดประสงค์ยอดนิยม</p>
              {purposeLeaders.length === 0 ? (
                <p className="text-sm text-slate-400">ยังไม่มีข้อมูล</p>
              ) : (
                <ul className="space-y-1 text-sm text-slate-700">
                  {purposeLeaders.map(([purpose, count]) => (
                    <li key={purpose} className="flex justify-between">
                      <span>{purpose}</span>
                      <span className="font-semibold text-slate-900">{count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Controls */}
        <section className="rounded-2xl border-0 bg-white p-6 shadow-sm">
  <div
    className="
      flex flex-col gap-6 
      md:grid md:grid-cols-2 
      lg:flex lg:flex-row lg:items-end lg:gap-6
    "
  >

    {/* เลือกเดือน */}
    <div className="space-y-2 w-full lg:w-[200px]">
      <label className="text-sm font-medium text-slate-700">เลือกเดือน</label>
      <input
        type="month"
        value={selectedMonth}
        onChange={(e) => setSelectedMonth(e.target.value)}
        className="w-full rounded-xl border border-slate-200 px-4 py-2"
      />
    </div>

    {/* ค้นหาการบันทึก */}
    <div className="space-y-2 flex-1 min-w-[240px]">
      <label className="text-sm font-medium text-slate-700">ค้นหาการบันทึก</label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
        <Input
          type="text"
          placeholder="เลขประจำตัวหรือชื่อ"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>
    </div>

    {/* ปุ่ม - Responsive Grid */}
    <div
      className="
        flex flex-col 
        gap-2 
        w-full 
        md:col-span-2
        lg:w-[200px] lg:shrink-0
      "
    >
      <Button onClick={fetchAttendance} variant="outline" className="rounded-xl border-slate-300 text-slate-600 w-full">
        <RefreshCw className="w-4 h-4 mr-2" /> รีโหลด
      </Button>

      <Button onClick={handleExportSummary} className="rounded-xl bg-green-600 hover:bg-green-700 w-full">
        <Download className="w-4 h-4 mr-2" /> Export สรุปชั้น
      </Button>

      <Button onClick={handleExportByClass} className="rounded-xl bg-blue-600 hover:bg-blue-700 w-full">
        <Download className="w-4 h-4 mr-2" /> Export รายชื่อนักเรียน
      </Button>
    </div>
  </div>
</section>


        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">{error}</div>}

        {/* Class summary */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-slate-900">สรุปการเข้าใช้ตามชั้น</CardTitle>
            <p className="text-sm text-slate-500">จำนวนครั้งต่อจุดประสงค์ในเดือนที่เลือก</p>
          </CardHeader>
          <CardContent>
            {attendance.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">ยังไม่มีข้อมูลการเข้าใช้ในเดือนนี้</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50">
                    <tr className="text-slate-600 font-medium">
                      <th className="text-left py-3 px-4">ชั้น / ห้อง</th>
                      {purposeColumns.map((purpose) => (
                        <th key={purpose} className="text-right py-3 px-4">
                          {purpose}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {sortedClassRows.map((row) => (
                      <tr key={row.classLabel} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-semibold text-slate-900">{row.classLabel}</td>
                        {purposeColumns.map((purpose) => (
                          <td key={purpose} className="py-3 px-4 text-right text-slate-900">
                            {row.counts[purpose] ?? 0}
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr className="bg-slate-100 font-semibold text-slate-900">
                      <td className="py-3 px-4">รวม</td>
                      {purposeColumns.map((purpose) => (
                        <td key={purpose} className="py-3 px-4 text-right">
                          {classPurposeSummary.totals[purpose] ?? 0}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Records Table */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-slate-900">บันทึกการเข้าใช้ห้องสมุด</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200">
                  <tr className="text-slate-600 font-medium">
                    <th className="text-left py-3 px-4">วันที่</th>
                    <th className="text-left py-3 px-4">เวลา</th>
                    <th className="text-left py-3 px-4">เลขประจำตัว</th>
                    <th className="text-left py-3 px-4">ชื่อ-นามสกุล</th>
                    <th className="text-left py-3 px-4">ชั้น</th>
                    <th className="text-left py-3 px-4">จุดประสงค์</th>
                    <th className="text-center py-3 px-4">ดำเนินการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {isLoading ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-slate-500">
                        กำลังโหลดข้อมูล...
                      </td>
                    </tr>
                  ) : attendance.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-slate-500">
                        ไม่พบข้อมูลในเดือนนี้
                      </td>
                    </tr>
                  ) : (
                    attendance.map((record) => {
                      const fullName = `${record.title ? `${record.title} ` : ""}${record.firstName} ${record.lastName}`.trim()
                      return (
                        <tr key={record.id} className="hover:bg-slate-50">
                          <td className="py-3 px-4 text-slate-900">{record.attendanceDate}</td>
                          <td className="py-3 px-4 text-slate-900">{record.attendanceTime}</td>
                          <td className="py-3 px-4 text-slate-900 font-medium">{record.studentCode}</td>
                          <td className="py-3 px-4 text-slate-900">{fullName}</td>
                          <td className="py-3 px-4 text-slate-900">{formatClassRoom(record.classLevel, record.room)}</td>
                          <td className="py-3 px-4 text-slate-900">{record.purposes.join(", ")}</td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => handleDelete(record.id)}
                              className="text-red-600 hover:text-red-700 p-1 hover:bg-red-50 rounded"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Student roster & import */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="border-0 shadow-sm">
            <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="text-slate-900">รายชื่อนักเรียน</CardTitle>
                <p className="text-sm text-slate-500">ค้นหาและจัดการรายชื่อนักเรียนตามชั้น</p>
              </div>
              <Button variant="outline" size="sm" onClick={fetchRoster} className="text-slate-600">
                <RefreshCw className="w-4 h-4 mr-2" /> รีโหลด
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-end">
                {/* ช่องค้นหา */}
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    value={rosterSearch}
                    onChange={(e) => setRosterSearch(e.target.value)}
                    placeholder="ค้นหาเลขประจำตัวหรือชื่อ"
                    className="pl-10"
                  />
                </div>

                {/* ช่องเลือกชั้น */}
                <div className="flex flex-col min-w-[220px]">
                  <label className="mb-1 text-sm font-medium text-slate-700">กรองตามชั้น</label>
                  <select
                    value={selectedClass}
                    onChange={(e) => setSelectedClass(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    disabled={classesLoading}
                  >
                    {classSelectOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                {classesLoading && (
                  <p className="text-xs text-slate-500">กำลังโหลดรายชื่อชั้น...</p>
                )}
              </div>

              {classesError && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{classesError}</div>}
              {!selectedClass && !rosterSearch && !rosterLoading && (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-3 py-4 text-sm text-slate-500">
                  โปรดเลือกชั้นหรือพิมพ์ค้นหานักเรียนเพื่อแสดงรายชื่อ
                </div>
              )}
              {rosterError && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{rosterError}</div>}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200">
                    <tr className="text-slate-600 font-medium">
                      <th className="text-left py-2 px-3">เลขประจำตัว</th>
                      <th className="text-left py-2 px-3">ชื่อ-นามสกุล</th>
                      <th className="text-left py-2 px-3">ชั้น/ห้อง</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {rosterLoading ? (
                      <tr>
                        <td colSpan={3} className="text-center py-6 text-slate-500">
                          กำลังโหลด...
                        </td>
                      </tr>
                    ) : filteredRoster.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="text-center py-6 text-slate-500">
                          ไม่พบรายชื่อ
                        </td>
                      </tr>
                    ) : (
                      filteredRoster.map((student) => (
                        <tr key={student.id}>
                          <td className="py-2 px-3 font-semibold text-slate-900">{student.studentCode}</td>
                          <td className="py-2 px-3 text-slate-900">
                            {student.title ? `${student.title} ` : ""}
                            {student.firstName} {student.lastName}
                          </td>
                          <td className="py-2 px-3 text-slate-600">{formatClassRoom(student.classLevel, student.room)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-slate-900 flex items-center gap-2">
                <Upload className="w-4 h-4 text-amber-600" /> นำเข้ารายชื่อนักเรียนด้วย JSON
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-slate-600">
                วางข้อมูล JSON จากไฟล์ Excel แปลง (รูปแบบ Worksheet) หรืออัปโหลดไฟล์เพื่ออัปเดตนักเรียนโดยอัตโนมัติ
                ข้อมูลที่ซ้ำกัน (เลขประจำตัวเดิม) จะถูกอัปเดตด้วยข้อมูลล่าสุด
              </p>
              <Textarea rows={10} value={jsonPayload} onChange={(e) => setJsonPayload(e.target.value)} />
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json,application/*+json"
                className="hidden"
                onChange={handleFileSelection}
              />
              {importStatus && <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded text-sm">{importStatus}</div>}
              {importError && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{importError}</div>}
              <div className="flex flex-col md:flex-row gap-2">
                <Button onClick={handleImport} disabled={importing} className="flex-1 bg-blue-600 hover:bg-blue-700">
                  <Upload className="w-4 h-4 mr-2" /> {importing ? "กำลังนำเข้า..." : "นำเข้าข้อมูล"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 text-slate-600"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importing}
                >
                  เลือกไฟล์ JSON
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 text-slate-600"
                  onClick={() => {
                    setJsonPayload(SAMPLE_IMPORT_TEMPLATE)
                    setImportError(null)
                    setImportStatus(null)
                  }}
                  disabled={importing}
                >
                  ล้างข้อความ
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>

    {importWarning && (
      <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/50 px-4 py-10">
        <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
          <h3 className="text-lg font-semibold text-slate-900">ตรวจพบรายชื่อที่ไม่มีในไฟล์นำเข้า</h3>
          <p className="mt-2 text-sm text-slate-600">{importWarning.message}</p>
          <p className="mt-2 text-sm text-slate-500">
            รายชื่อที่หายไปทั้งหมด {importWarning.missingCount} รายการ
            {importWarning.sampleCodes.length > 0 && ` (ตัวอย่าง: ${importWarning.sampleCodes.join(", ")})`}
          </p>
          <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <p>เลือก “อัปเดตต่อ” เพื่อบันทึกเฉพาะข้อมูลใหม่</p>
            <p>เลือก “ลบรายชื่อที่ไม่มี” เพื่อลบรายชื่อนักเรียนที่ไม่อยู่ในไฟล์ก่อนนำเข้า</p>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button variant="outline" className="flex-1 text-slate-600" onClick={handleDismissWarning}>
              ยกเลิก
            </Button>
            <Button
              className="flex-1 bg-blue-600 hover:bg-blue-700"
              onClick={() => handleImportWarningAction("update")}
            >
              อัปเดตต่อ
            </Button>
            <Button
              className="flex-1 bg-red-600 hover:bg-red-700"
              onClick={() => handleImportWarningAction("delete")}
            >
              ลบรายชื่อที่ไม่มี
            </Button>
          </div>
        </div>
      </div>
    )}
  </>
)
}
