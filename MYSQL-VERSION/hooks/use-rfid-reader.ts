"use client"

import { useState, useEffect, useCallback, useRef } from "react"

export function useRfidReader(enabled: boolean = true) {
    const [isConnected, setIsConnected] = useState(false)
    const [lastStudentId, setLastStudentId] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const portRef = useRef<any>(null)
    const readerRef = useRef<ReadableStreamDefaultReader | null>(null)
    const keepReadingRef = useRef(true)
    const isReadingRef = useRef(false)
    const enabledRef = useRef(enabled)
    const lastProcessedIdRef = useRef<string | null>(null)
    const lastProcessedTimeRef = useRef<number>(0)
    const COOLDOWN_MS = 2000 // 2 seconds cooldown for the same card

    useEffect(() => {
        enabledRef.current = enabled
        // Reset cooldown context when disabling/enabling to ensure fresh state
        lastProcessedIdRef.current = null
        lastProcessedTimeRef.current = 0
    }, [enabled])

    const STORAGE_KEY = "rfid-reader-key"

    const write = useCallback(async (msg: string) => {
        if (!portRef.current || !portRef.current.writable) return

        try {
            const writer = portRef.current.writable.getWriter()
            const encoder = new TextEncoder()
            const data = msg + "]"
            await writer.write(encoder.encode(data))
            writer.releaseLock()
        } catch (err) {
            console.error("Failed to write to serial port:", err)
        }
    }, [])

    const read = useCallback(async (port: any) => {
        if (isReadingRef.current) return
        isReadingRef.current = true
        keepReadingRef.current = true

        console.log("Starting RFID read loop...")
        let s = ""

        try {
            // Initial reader wakeup
            await write("disable_card")

            while (port.readable && keepReadingRef.current) {
                const reader = port.readable.getReader()
                readerRef.current = reader
                try {
                    while (true) {
                        const { value, done } = await reader.read()
                        if (done) break

                        if (value) {
                            const chunk = new TextDecoder().decode(value)
                            s += chunk

                            // Process all complete messages in the buffer
                            while (s.includes("*")) {
                                const starIndex = s.indexOf("*")
                                const message = s.substring(0, starIndex)
                                s = s.substring(starIndex + 1)

                                if (message && enabledRef.current) {
                                    console.log("RFID Message:", message)

                                    // Parse: 200:dis,19311|43239 -> 19311
                                    const parts = message.split(",")
                                    if (parts.length > 1) {
                                        const idMatch = parts[1].match(/\d+/)
                                        if (idMatch) {
                                            const id = idMatch[0]
                                            const now = Date.now()
                                            const isSameAsLast = id === lastProcessedIdRef.current
                                            const isWithinCooldown = (now - lastProcessedTimeRef.current) < COOLDOWN_MS

                                            if (!isSameAsLast || !isWithinCooldown) {
                                                console.log("Valid Scan - ID:", id)
                                                setLastStudentId(id)
                                                lastProcessedIdRef.current = id
                                                lastProcessedTimeRef.current = now
                                            } else {
                                                console.log("Duplicate Scan Ignored (Cooldown active):", id)
                                            }

                                            // Re-send "disable_card" to trigger the next potential scan
                                            await write("disable_card")
                                        }
                                    }
                                } else if (message && !enabledRef.current) {
                                    console.log("RFID Scan Ignored (Registration in progress)")
                                    await write("disable_card")
                                }
                            }
                        }
                    }
                } catch (readErr) {
                    console.error("Inner read error:", readErr)
                    break // Break inner and try to get a new reader
                } finally {
                    reader.releaseLock()
                    readerRef.current = null
                }

                // Small delay to prevent tight loop on repeat errors
                if (keepReadingRef.current) {
                    await new Promise(r => setTimeout(r, 100))
                }
            }
        } catch (err) {
            console.error("Serial read loop fatal error:", err)
            setIsConnected(false)
        } finally {
            isReadingRef.current = false
            console.log("RFID read loop stopped")
        }
    }, [write])

    const connect = useCallback(async () => {
        setError(null)
        if (!("serial" in navigator)) {
            setError("Browser ไม่รองรับ Web Serial API")
            return
        }

        try {
            const port = await (navigator as any).serial.requestPort()
            const { usbProductId, usbVendorId } = port.getInfo()
            localStorage.setItem(STORAGE_KEY, `${usbProductId}-${usbVendorId}`)

            try {
                await port.open({ baudRate: 115200 })
            } catch (err: any) {
                if (!err.message.includes("already open")) throw err
            }

            portRef.current = port
            setIsConnected(true)
            read(port)
        } catch (err) {
            console.error("Failed to connect to serial port:", err)
            setError("เชื่อมต่อไม่สำเร็จ")
            setIsConnected(false)
        }
    }, [read])

    useEffect(() => {
        let timer: any

        const autoConnect = async () => {
            if (!("serial" in navigator)) return
            if (isReadingRef.current) return

            try {
                const ports = await (navigator as any).serial.getPorts()
                const savedKey = localStorage.getItem(STORAGE_KEY)

                const port = ports.find((p: any) => {
                    const info = p.getInfo()
                    return `${info.usbProductId}-${info.usbVendorId}` === savedKey
                })

                if (port) {
                    try {
                        // Attempt to open, if already open it will throw but we catch it
                        try {
                            await port.open({ baudRate: 115200 })
                        } catch (err: any) {
                            if (!err.message.includes("already open")) throw err
                        }

                        portRef.current = port
                        setIsConnected(true)
                        read(port)
                    } catch (err) {
                        console.error("Failed to auto-connect port:", err)
                    }
                }
            } catch (err) {
                console.log("Auto-connect check failed:", err)
            }
        }

        autoConnect()

        // Periodic check to ensure we are still connected/reading
        timer = setInterval(() => {
            if (!isReadingRef.current && localStorage.getItem(STORAGE_KEY)) {
                autoConnect()
            }
        }, 5000)

        return () => {
            keepReadingRef.current = false
            clearInterval(timer)
        }
    }, [read])

    return { isConnected, lastStudentId, error, connect, setLastStudentId }
}
