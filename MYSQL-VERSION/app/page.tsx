"use client"

import Image from "next/image"
import { useState, useEffect, type ReactNode } from "react"
import StudentLogin from "@/components/student-login"
import StudentRegister from "@/components/student-register"
import AdminLogin from "@/components/admin-login"
import AdminStudentManagement from "@/components/admin-student-management"
import { checkAdminSession } from "@/lib/admin-auth"

type Page = "student-login" | "student-register" | "admin-login" | "admin-dashboard"

export default function Home() {
  const [currentPage, setCurrentPage] = useState<Page>("student-login")
  const [studentId, setStudentId] = useState("")
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    let ignore = false
    const verifySession = async () => {
      const authenticated = await checkAdminSession()
      if (!ignore && authenticated) {
        setCurrentPage("admin-dashboard")
      }
    }
    verifySession()
    return () => {
      ignore = true
    }
  }, [])

  if (!mounted) return null

  const showAdminShortcut = currentPage !== "admin-dashboard"

  let content: ReactNode = null
  if (currentPage === "student-login") {
    content = (
<div className="flex justify-center items-start md:items-center min-h-[calc(100vh-160px)] px-4 py-10 
bg-gradient-to-b from-blue-50 via-white to-white">        <StudentLogin
          onLogin={(id) => {
            setStudentId(id)
            setCurrentPage("student-register")
          }}
        />
      </div>
    )
  } else if (currentPage === "student-register") {
    content = (
      <div className="">
        <StudentRegister
          studentId={studentId}
          onSuccess={() => {
            setCurrentPage("student-login")
            setStudentId("")
          }}
        />
      </div>
    )
  } else if (currentPage === "admin-login") {
    content = (
      <AdminLogin
        onLoginSuccess={() => setCurrentPage("admin-dashboard")}
        onBack={() => setCurrentPage("student-login")}
      />
    )
  } else if (currentPage === "admin-dashboard") {
    content = <AdminStudentManagement onLogout={() => setCurrentPage("student-login")} />
  }

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="border-b border-slate-100 bg-white px-4 py-4">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative h-12 w-12 overflow-hidden rounded-xl bg-blue-50">
              <Image src="/assumption-rayoung.png" alt="Assumption College Rayong" fill className="object-contain p-2" priority />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-blue-500">Assumption College Rayong</p>
              <p className="text-lg font-semibold text-slate-900">ระบบลงทะเบียนเข้าใช้ห้องสมุด</p>
            </div>
          </div>
          {showAdminShortcut && (
            <button
              onClick={() => setCurrentPage("admin-login")}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              ผู้ดูแลระบบ
            </button>
          )}
        </div>
      </header>

      <main className="flex-1">{content}</main>
      <footer className="mt-auto border-t border-slate-100 px-4 py-3 text-center text-xs text-slate-500 shrink-0">
      © {new Date().getFullYear()} Assumption College Rayong Library · Developed by Akarapach Yootsukprasert (Park)
      </footer>
    </div>
  )
}
