"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { purposes } from "@/lib/purposes-data"
import { CheckCircle } from "lucide-react"
import type { StudentRecord } from "@/lib/types"

interface StudentRegisterProps {
  studentId: string
  onSuccess: () => void
}

export default function StudentRegister({ studentId, onSuccess }: StudentRegisterProps) {
  const [student, setStudent] = useState<StudentRecord | null>(null)
  const [selectedPurpose, setSelectedPurpose] = useState("")
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

  const handleSubmit = async () => {
    if (!selectedPurpose) return

    setIsSubmitting(true)
    setError("")

    try {
      const response = await fetch(`/api/attendance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentCode: studentId, purpose: selectedPurpose }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: "" }))
        throw new Error(payload.error || "บันทึกไม่สำเร็จ")
      }

      setShowSuccess(true)
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
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <p className="text-slate-600">กำลังโหลดข้อมูล...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <p className="text-red-600 font-semibold">{error}</p>
          <Button onClick={onSuccess} className="bg-blue-600 hover:bg-blue-700">
            กลับไปหน้าแรก
          </Button>
        </div>
      </div>
    )
  }

  if (!student) return null

  if (showSuccess) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <div className="text-center">
          <div className="mb-4 flex justify-center">
            <div className="bg-green-100 rounded-full p-4">
              <CheckCircle className="w-12 h-12 text-green-600" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">บันทึกสำเร็จ</h2>
          <p className="text-slate-600">
            {student.title ? `${student.title} ` : ""}
            {student.firstName} {student.lastName} ({selectedPurpose})
          </p>
          <p className="text-sm text-slate-500 mt-4">ระบบจะปิดโดยอัตโนมัติใน 2 วินาที...</p>
        </div>
      </div>
    )
  }

  return (
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header className="rounded-2xl bg-white/80 p-6 shadow-sm ring-1 ring-slate-100">
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Library Check-in</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900">
            สวัสดี{" "}
            <span className="text-blue-600">
              {student.title ? `${student.title} ` : ""}
              {student.firstName} {student.lastName}
            </span>
          </h1>
          <p className="mt-1 text-slate-600">โปรดตรวจสอบข้อมูลและเลือกจุดประสงค์การใช้ห้องสมุด</p>
        </header>

        <div className="grid gap-6 md:grid-cols-[320px,1fr]">
          <section className="space-y-6">
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-slate-900">ข้อมูลนักเรียน</CardTitle>
                <CardDescription>ตรวจสอบความถูกต้องก่อนบันทึก</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-500">ชื่อ - นามสกุล</p>
                  <p className="text-lg font-medium text-slate-900">
                    {student.title ? `${student.title} ` : ""}
                    {student.firstName} {student.lastName}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500">ชั้น</p>
                    <p className="text-base font-semibold text-slate-900">{student.classLevel}</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500">ห้อง</p>
                    <p className="text-base font-semibold text-slate-900">{student.room || "-"}</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500">เลขประจำตัว</p>
                    <p className="text-base font-semibold text-slate-900">{student.studentCode}</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500">เลขที่</p>
                    <p className="text-base font-semibold text-slate-900">{student.number || "-"}</p>
                  </div>
                </div>
                <div className="rounded-xl border border-blue-100 bg-blue-50/80 p-3 text-sm text-blue-900">
                  ✓ เมื่อบันทึกสำเร็จ ระบบจะจำเวลาล่าสุดของวันนี้ให้อัตโนมัติ
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-slate-900">ขั้นตอน</CardTitle>
                <CardDescription>เตรียมข้อมูลให้ครบทุกครั้ง</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-slate-600">
                <div className="flex items-start gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                    1
                  </span>
                  <div>
                    <p className="font-medium text-slate-900">เลือกจุดประสงค์</p>
                    <p>เลือกหัวข้อที่ตรงกับการใช้งานวันนี้ (เลือกได้มากกว่า 1 ครั้ง)</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                    2
                  </span>
                  <div>
                    <p className="font-medium text-slate-900">ยืนยันข้อมูล</p>
                    <p>กดปุ่ม “ยืนยันลงทะเบียน” เพื่อบันทึกเข้าระบบ</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          <section>
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="text-slate-900">เลือกจุดประสงค์การใช้ห้องสมุด</CardTitle>
                <CardDescription>เลือกหัวข้อที่ตรงกับการใช้งานในครั้งนี้</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {purposes.map((purpose) => {
                    const isActive = selectedPurpose === purpose
                    return (
                      <button
                        key={purpose}
                        onClick={() => setSelectedPurpose(purpose)}
                        className={`group rounded-2xl border-2 p-4 text-left transition-all ${
                          isActive
                            ? "border-blue-600 bg-gradient-to-br from-blue-50 to-white shadow-sm"
                            : "border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/60"
                        }`}
                      >
                        <p className={`font-semibold ${isActive ? "text-blue-700" : "text-slate-900"}`}>{purpose}</p>
                        <p className="mt-1 text-xs text-slate-500">แตะเพื่อเลือกหัวข้อนี้</p>
                      </button>
                    )
                  })}
                </div>

                <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                  <p>สามารถลงทะเบียนซ้ำได้หากใช้ห้องสมุดด้วยเหตุผลอื่นในวันเดียวกัน</p>
                </div>

                <Button
                  onClick={handleSubmit}
                  disabled={!selectedPurpose || isSubmitting}
                  className="w-full rounded-2xl bg-blue-600 py-6 text-base font-semibold text-white hover:bg-blue-700"
                >
                  {isSubmitting ? "กำลังบันทึก..." : "ยืนยันลงทะเบียน"}
                </Button>
              </CardContent>
            </Card>
          </section>
        </div>
    </main>
  )
}
