"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { purposes } from "@/lib/purposes-data"
import { CheckCircle } from "lucide-react"
import type { StudentRecord } from "@/lib/types"

interface StudentRegisterProps {
  studentId: string
  onSuccess: () => void
  onStudentChange?: (student: StudentRecord | null) => void
}

export default function StudentRegister({ studentId, onSuccess, onStudentChange }: StudentRegisterProps) {
  const [student, setStudent] = useState<StudentRecord | null>(null)
  const [selectedPurposes, setSelectedPurposes] = useState<string[]>([])
  const [submittedPurposes, setSubmittedPurposes] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!studentId) return
    let ignore = false
    const fetchStudent = async () => {
      setIsLoading(true)
      setError("")
      try {
        const response = await fetch(`/api/students/${studentId}`)
        if (!response.ok) {
          throw new Error("ไม่พบนักเรียนในระบบ")
        }
        const data = await response.json()
        if (!ignore) {
          setStudent(data.student)
        }
      } catch (err) {
        if (!ignore) {
          setError((err as Error).message || "โหลดข้อมูลนักเรียนไม่สำเร็จ")
          setStudent(null)
        }
      } finally {
        if (!ignore) {
          setIsLoading(false)
        }
      }
    }

    fetchStudent()
    return () => {
      ignore = true
    }
  }, [studentId])

  useEffect(() => {
    onStudentChange?.(student)
  }, [student, onStudentChange])

  useEffect(() => {
    setSelectedPurposes([])
    setSubmittedPurposes([])
    setShowSuccess(false)
  }, [studentId])

  const handleSubmit = async () => {
    if (!selectedPurposes.length) return

    const payloadPurposes = [...selectedPurposes]

    setIsSubmitting(true)
    setError("")

    try {
      const response = await fetch(`/api/attendance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentCode: studentId, purposes: payloadPurposes }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: "" }))
        throw new Error(payload.error || "บันทึกไม่สำเร็จ")
      }

      setSubmittedPurposes(payloadPurposes)
      setShowSuccess(true)
      setSelectedPurposes([])
      setTimeout(() => {
        onSuccess()
      }, 2000)
    } catch (err) {
      setError((err as Error).message || "บันทึกข้อมูลไม่สำเร็จ")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[calc(100vh-220px)] items-center justify-center px-4">
        <p className="text-slate-600">กำลังโหลดข้อมูล...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-[calc(100vh-220px)] items-center justify-center px-4">
        <Card className="w-full max-w-md border border-red-100 bg-red-50/40 text-center shadow-sm">
          <CardHeader>
            <CardTitle className="text-red-600">เกิดข้อผิดพลาด</CardTitle>
            <CardDescription className="text-red-500">{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={onSuccess} className="w-full rounded-xl bg-blue-600 hover:bg-blue-700">
              กลับไปหน้าแรก
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!student) return null

  const studentPoints = student.points ?? 0
  const hasSelection = selectedPurposes.length > 0

  const togglePurpose = (purpose: string) => {
    setSelectedPurposes((current) =>
      current.includes(purpose) ? current.filter((item) => item !== purpose) : [...current, purpose]
    )
  }

  if (showSuccess) {
    return (
      <div className="flex min-h-[calc(100vh-220px)] items-center justify-center px-4">
        <div className="text-center">
          <div className="mb-4 flex justify-center">
            <div className="bg-green-100 rounded-full p-4">
              <CheckCircle className="w-12 h-12 text-green-600" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">บันทึกสำเร็จ</h2>
          <p className="text-slate-600">
            {student.title ? `${student.title} ` : ""}
            {student.firstName} {student.lastName}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {submittedPurposes.map((purpose) => (
              <Badge key={purpose} className="rounded-full bg-green-600/10 px-3 py-1 text-green-700">
                {purpose}
              </Badge>
            ))}
          </div>
          <p className="mt-4 text-sm font-medium text-emerald-700">
            แต้มสะสมปัจจุบัน {studentPoints.toLocaleString()} คะแนน
          </p>
          <p className="text-sm text-slate-500 mt-4">ระบบจะปิดโดยอัตโนมัติใน 2 วินาที...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-[calc(100vh-220px)] items-start justify-center bg-white px-4 py-6">
      <div className="w-full max-w-4xl space-y-6">
        <Card className="rounded-3xl border border-slate-100 shadow-xl">
          <CardHeader className="space-y-3">
            <CardTitle className="text-2xl font-semibold text-slate-900">เลือกจุดประสงค์การใช้ห้องสมุด</CardTitle>
            <CardDescription>แตะเลือกได้หลายหัวข้อในครั้งเดียว ไม่ต้องเลื่อนหน้าจอไปมา</CardDescription>
            <div className="flex flex-wrap gap-2 text-xs text-slate-600">
              <Badge variant="secondary" className="rounded-full bg-slate-100 text-slate-700">
                รหัส {student.studentCode}
              </Badge>
              <Badge variant="secondary" className="rounded-full bg-slate-100 text-slate-700">
                ชั้น {student.classLevel}
                {student.room ? `/${student.room}` : ""}
              </Badge>
              {student.number && (
                <Badge variant="secondary" className="rounded-full bg-slate-100 text-slate-700">
                  เลขที่ {student.number}
                </Badge>
              )}
              <Badge className="rounded-full bg-amber-100 text-amber-800 hover:bg-amber-100">
                แต้มสะสม {studentPoints.toLocaleString()} คะแนน
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
            )}

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {purposes.map((purpose) => {
                const isActive = selectedPurposes.includes(purpose)
                return (
                  <button
                    key={purpose}
                    type="button"
                    onClick={() => togglePurpose(purpose)}
                    className={`flex items-center justify-between rounded-2xl border-2 p-4 text-left text-base font-semibold transition-all ${
                      isActive
                        ? "border-blue-600 bg-blue-50/80 text-blue-700 shadow-sm"
                        : "border-slate-200 bg-white text-slate-900 hover:border-blue-200 hover:bg-blue-50/40"
                    }`}
                  >
                    <span>{purpose}</span>
                    {isActive && <span className="text-xs font-bold uppercase tracking-wide text-blue-600">เลือกแล้ว</span>}
                  </button>
                )
              })}
            </div>

            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <p>เลือกได้มากกว่า 1 หัวข้อในครั้งเดียว หากต้องการเพิ่มเหตุผลสามารถเปิดมาหน้านี้อีกครั้งภายหลัง</p>
            </div>

            {hasSelection && (
              <div className="flex flex-wrap gap-2">
                {selectedPurposes.map((purpose) => (
                  <Badge key={purpose} className="rounded-full bg-blue-600/10 px-3 py-1 text-blue-700">
                    {purpose}
                  </Badge>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                onClick={handleSubmit}
                disabled={!hasSelection || isSubmitting}
                className="w-full rounded-2xl bg-blue-600 py-5 text-base font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {isSubmitting ? "กำลังบันทึก..." : hasSelection ? `ยืนยัน ${selectedPurposes.length} หัวข้อ` : "ยืนยันลงทะเบียน"}
              </Button>
             
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
