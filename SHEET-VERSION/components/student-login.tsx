"use client"

import type React from "react"
import Image from "next/image"
import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { BookOpen } from "lucide-react"

interface StudentLoginProps {
  onLogin: (studentId: string) => void
}

export default function StudentLogin({ onLogin }: StudentLoginProps) {
  const [studentId, setStudentId] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)
    try {
      const trimmedId = studentId.trim()
      const response = await fetch(`/api/students/${trimmedId}`)
      if (!response.ok) throw new Error("ไม่พบเลขประจำตัวนักเรียนนี้ในระบบ")

      onLogin(trimmedId)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full bg-gradient-to-b flex justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-8 animate-fade-in">
        
        {/* Header Badge */}
        <div className="flex justify-center">
          <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-blue-700 shadow-sm">
            <BookOpen className="h-4 w-4" />
            ACR Library Check-In
          </div>
        </div>

        {/* Logo */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="relative h-20 w-20 overflow-hidden rounded-2xl bg-white shadow">
            <Image
              src="/assumption-rayoung.png"
              alt="Assumption College Rayong logo"
              fill
              className="object-contain p-2"
              priority
            />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              Assumption College Rayong
            </h1>
            <p className="text-sm text-slate-500">
            ลงทะเบียนเข้าใช้ห้องสมุด เพียงกรอกเลขประจำตัวนักเรียน
            </p>
          </div>
        </div>

        {/* Login Card */}
        <Card className="border border-slate-200 shadow-md rounded-2xl">
          <CardHeader className="text-center">
            <CardTitle className="text-xl text-slate-900">เข้าสู่ระบบนักเรียน</CardTitle>
            <CardDescription>กรอกเลขประจำตัวเพื่อบันทึกการเข้าใช้</CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">

              <div className="text-left">
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  เลขประจำตัวนักเรียน
                </label>
                <Input
                  type="text"
                  placeholder="เช่น 24732"
                  value={studentId}
                  onChange={(e) => {
                    setStudentId(e.target.value)
                    setError("")
                  }}
                  disabled={isLoading}
                  className="h-11"
                />
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={!studentId || isLoading}
                className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700"
              >
                {isLoading ? "กำลังตรวจสอบ..." : "เข้าสู่ระบบ"}
              </Button>
            </form>

            <button
              onClick={() => {
                setStudentId("")
                setError("")
              }}
              className="mt-4 w-full text-sm font-medium text-blue-600 hover:text-blue-700"
              type="button"
            >
              ล้างเลขประจำตัว
            </button>
          </CardContent>
        </Card>

   
      </div>
    </div>
  )
}
