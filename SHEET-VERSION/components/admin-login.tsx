"use client"

import type React from "react"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { loginAdmin } from "@/lib/admin-auth"
import { Shield } from "lucide-react"

interface AdminLoginProps {
  onLoginSuccess: () => void
  onBack: () => void
}

export default function AdminLogin({ onLoginSuccess, onBack }: AdminLoginProps) {
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)
    try {
      await loginAdmin(password)
      setPassword("")
      onLoginSuccess()
    } catch (err) {
      setError((err as Error).message || "เข้าสู่ระบบไม่สำเร็จ")
      setPassword("")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Shield className="w-10 h-10 text-amber-600" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">ผู้ดูแลระบบ</h1>
          <p className="text-slate-600">เข้าสู่ระบบจัดการ</p>
        </div>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-slate-900">ป้อนรหัสผ่าน</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">รหัสผ่านผู้ดูแลระบบ</label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    setError("")
                  }}
                  disabled={isLoading}
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{error}</div>
              )}

              <Button
                type="submit"
                disabled={!password || isLoading}
                className="w-full bg-amber-600 hover:bg-amber-700"
              >
                {isLoading ? "กำลังตรวจสอบ..." : "เข้าสู่ระบบ"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <button onClick={onBack} className="w-full mt-4 text-sm text-slate-600 hover:text-slate-900 font-medium">
          ย้อนกลับ
        </button>
      </div>
    </div>
  )
}
