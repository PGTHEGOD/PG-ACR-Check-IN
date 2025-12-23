"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { BookOpen, Nfc, Keyboard, UserCircle, Settings2, ShieldCheck, AlertCircle } from "lucide-react"
import { useRfidReader } from "@/hooks/use-rfid-reader"

interface StudentLoginProps {
  onLogin: (studentId: string) => void
  rfid: ReturnType<typeof useRfidReader>
}

export default function StudentLogin({ onLogin, rfid }: StudentLoginProps) {
  const [studentId, setStudentId] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isManualMode, setIsManualMode] = useState(false)
  const { isConnected, lastStudentId, connect, setLastStudentId, error: rfidError } = rfid

  const handleSubmit = async (e?: React.FormEvent, idToSubmit?: string) => {
    if (e) e.preventDefault()
    setError("")
    setIsLoading(true)
    try {
      const id = idToSubmit || studentId.trim()
      if (!id) return

      const response = await fetch(`/api/students/${id}`)
      if (!response.ok) throw new Error("ไม่พบเลขประจำตัวนักเรียนนี้ในระบบ")

      onLogin(id)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsLoading(false)
    }
  }

  // Handle RFID scan
  useEffect(() => {
    if (lastStudentId && !isLoading) {
      setStudentId(lastStudentId)
      handleSubmit(undefined, lastStudentId)
      setLastStudentId(null)
    }
  }, [lastStudentId, isLoading, setLastStudentId])

  return (
    <div className="w-full flex justify-center px-4 py-8 md:py-12 min-h-[calc(100vh-200px)]">
      <div className="w-full max-w-[420px] space-y-6 md:space-y-8">

        {/* Header Badges */}
        {/* <div className="flex justify-center gap-2">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-blue-700 shadow-sm border border-blue-50"
          >
            <BookOpen className="h-3.5 w-3.5" />
            ACR Library Check-In
          </motion.div>

          <AnimatePresence>
            {isConnected && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700 shadow-sm border border-emerald-100"
              >
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                RFID Online
              </motion.div>
            )}
          </AnimatePresence>
        </div> */}

        {/* Logo & Intro */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="flex flex-col items-center text-center space-y-4"
        >
          <div className="relative h-20 w-20 md:h-24 md:w-24 overflow-hidden rounded-[2.5rem] bg-white shadow-2xl border-[6px] border-white group">
            <Image
              src="/assumption-rayoung.png"
              alt="Assumption College Rayong logo"
              fill
              className="object-contain p-2 transition-transform duration-500 group-hover:scale-110"
              priority
            />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
              ห้องสมุดอัสสัมชัญระยอง
            </h1>
            <p className="text-slate-400 text-sm font-medium">
              {isManualMode ? "เข้าระบบด้วยเลขประจำตัว" : "โปรดสแกนบัตรเพื่อลงทะเบียน"}
            </p>
          </div>
        </motion.div>

        {/* Device Setup Alert */}
        <AnimatePresence>
          {!isConnected && !isManualMode && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="p-4 rounded-3xl bg-amber-50/50 border border-amber-100/50 backdrop-blur-sm flex items-center justify-between gap-4 shadow-sm mb-2">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-100 rounded-xl text-amber-600">
                    <AlertCircle className="h-5 w-5" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-amber-900 leading-tight">ยังไม่ได้เชื่อมต่อ RFID</p>
                    <p className="text-[11px] text-amber-700/80 font-medium">โปรดตั้งค่าเครื่องสแกนก่อนใช้งาน</p>
                  </div>
                </div>
                <Button
                  onClick={connect}
                  variant="ghost"
                  size="sm"
                  className="rounded-xl bg-amber-100/50 text-amber-800 hover:bg-amber-100 border border-amber-200/50 font-bold text-xs"
                >
                  <Settings2 className="h-3.5 w-3.5 mr-1.5" />
                  ตั้งค่า
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Card */}
        <motion.div
          layout
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        >
          <Card className="border-none shadow-[0_20px_50px_rgba(0,0,0,0.08)] bg-white/90 backdrop-blur-md rounded-[2.5rem] overflow-hidden">
            <CardContent className="p-8 md:p-10">
              <AnimatePresence mode="wait">
                {!isManualMode ? (
                  <motion.div
                    key="rfid-mode"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="flex flex-col items-center justify-center space-y-10"
                  >
                    <div className="relative group cursor-pointer" onClick={connect}>
                      <motion.div
                        animate={{
                          scale: [1, 1.05, 1],
                          opacity: [0.3, 0.4, 0.3]
                        }}
                        transition={{ duration: 3, repeat: Infinity }}
                        className="absolute inset-0 bg-blue-400 rounded-full blur-3xl"
                      />
                      <div className="relative h-44 w-44 rounded-[3.5rem] bg-gradient-to-br from-blue-500 to-indigo-600 flex flex-col items-center justify-center shadow-[0_15px_35px_rgba(59,130,246,0.25)] border-[6px] border-white overflow-hidden">
                        <Nfc className={`h-16 w-16 text-white ${isConnected ? 'animate-pulse' : 'opacity-50'}`} />
                        <div className="mt-2 text-[10px] font-bold text-white/70 uppercase tracking-widest">
                          PG CARD
                        </div>

                        {/* Scanning wave effect */}
                        {isConnected && (
                          <motion.div
                            animate={{ y: [-60, 60] }}
                            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                            className="absolute left-0 right-0 h-1 bg-white/20 blur-[1px]"
                          />
                        )}
                      </div>

                      {isConnected && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="absolute -bottom-2 -right-2 p-2.5 bg-emerald-500 text-white rounded-2xl shadow-xl border-4 border-white"
                        >
                          <ShieldCheck className="h-5 w-5" />
                        </motion.div>
                      )}
                    </div>

                    <div className="w-full space-y-4">
                      <div className="text-center">
                        <h2 className={`text-xl font-bold transition-colors ${isConnected ? 'text-slate-900' : 'text-slate-300'}`}>
                          {isConnected ? 'พร้อมสแกนบัตร' : 'เครื่องสแกนไม่พร้อม'}
                        </h2>
                        <p className="text-slate-400 text-xs mt-1 font-medium">กรุณาวางบัตรเหนือเครื่องสแกน</p>
                      </div>

                      <div className="pt-2">
                        <Button
                          onClick={() => setIsManualMode(true)}
                          variant="ghost"
                          className="w-full h-14 rounded-2xl bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold text-sm flex items-center justify-center gap-3 transition-all active:scale-[0.98]"
                        >
                          <Keyboard className="h-5 w-5" />
                          ระบุเลขประจำตัวนักเรียน
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="manual-mode"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                  >
                    <form onSubmit={(e) => handleSubmit(e)} className="space-y-6">
                      <div className="text-left space-y-3">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 px-1">
                          <UserCircle className="h-4 w-4 text-blue-500" />
                          Student ID Number
                        </label>
                        <div className="relative">
                          <Input
                            type="text"
                            inputMode="numeric"
                            placeholder="00000"
                            value={studentId}
                            autoFocus
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, '').slice(0, 5)
                              setStudentId(val)
                              setError("")
                            }}
                            disabled={isLoading}
                            className="h-20 rounded-[1.5rem] bg-slate-50 border-none text-3xl text-center font-black tracking-[0.3em] transition-all focus:ring-4 focus:ring-blue-100 text-blue-900 placeholder:text-slate-200"
                          />
                          {studentId.length > 0 && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.5 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-blue-500/50 bg-white px-2 py-1 rounded-md"
                            >
                              {studentId.length}/5
                            </motion.div>
                          )}
                        </div>
                      </div>

                      <AnimatePresence>
                        {error && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="rounded-2xl bg-red-50 p-4 border border-red-100 flex items-center gap-3 text-red-600 font-bold text-[13px]"
                          >
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            {error}
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <div className="grid grid-cols-1 gap-4 pt-2">
                        <Button
                          type="submit"
                          disabled={studentId.length < 5 || isLoading}
                          className="w-full h-16 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-[0_10px_25px_rgba(59,130,246,0.3)] text-lg font-bold transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
                        >
                          {isLoading ? (
                            <div className="flex items-center gap-2">
                              <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              กำลังตรวจสอบ...
                            </div>
                          ) : "ยืนยันเข้าใช้ระบบ"}
                        </Button>

                        <button
                          onClick={() => {
                            setIsManualMode(false)
                            setStudentId("")
                            setError("")
                          }}
                          className="w-full py-4 text-xs font-bold text-slate-400 hover:text-blue-500 transition-colors flex items-center justify-center gap-2 uppercase tracking-wide group"
                          type="button"
                        >
                          <Nfc className="h-3.5 w-3.5 transition-transform group-hover:scale-110" />
                          กลับไปหน้าสแกนบัตร (RFID)
                        </button>
                      </div>
                    </form>
                  </motion.div>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>
        </motion.div>


      </div>
    </div>
  )
}
