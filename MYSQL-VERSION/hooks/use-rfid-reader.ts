"use client"

import { useState, useEffect, useCallback, useRef } from "react"

export function useRfidReader(enabled: boolean = true) {
    const [isConnected, setIsConnected] = useState(false)
    const [isScanning, setIsScanning] = useState(false)
    const [lastStudentId, setLastStudentId] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const portRef = useRef<any>(null)
    const readerRef = useRef<ReadableStreamDefaultReader | null>(null)
    const keepReadingRef = useRef(true)
    const isReadingRef = useRef(false)
    const isConnectingRef = useRef(false)
    const isScanningRef = useRef(false)
    const enabledRef = useRef(enabled)
    const lastProcessedIdRef = useRef<string | null>(null)
    const lastProcessedTimeRef = useRef<number>(0)
    const COOLDOWN_MS = 2000 // 2 seconds cooldown for the same card
    const MAX_BUFFER_SIZE = 1024

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

        console.log("Starting RFID sequential read loop...")
        let s = ""
        const decoder = new TextDecoder()
        setIsScanning(true)
        isScanningRef.current = true

        try {
            while (port.readable && keepReadingRef.current && isScanningRef.current && enabledRef.current) {
                // 1. Send Command (strictly one time before waiting)
                await write("disable_card")

                const reader = port.readable.getReader()
                readerRef.current = reader

                try {
                    let timeoutId: any
                    const timeoutPromise = new Promise((_, reject) => {
                        timeoutId = setTimeout(() => reject(new Error("RFID_TIMEOUT")), 3500)
                    })

                    try {
                        // 2. Wait for response chunk or timeout
                        const result: any = await Promise.race([reader.read(), timeoutPromise])
                        clearTimeout(timeoutId)

                        if (result.done) break
                        if (result.value) {
                            const chunk = decoder.decode(result.value)
                            s += chunk

                            if (s.length > MAX_BUFFER_SIZE) {
                                s = s.slice(-MAX_BUFFER_SIZE)
                            }

                            while (s.includes("*")) {
                                const starIndex = s.indexOf("*")
                                const message = s.substring(0, starIndex)
                                s = s.substring(starIndex + 1)

                                if (message) {
                                    console.log("RFID Message:", message)
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

                                                setIsScanning(false)
                                                isScanningRef.current = false
                                                return
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    } catch (err: any) {
                        if (err.message === "RFID_TIMEOUT") {
                            console.log("RFID Timeout - Re-triggering...")
                            await reader.cancel().catch(() => { })
                            await write("cancel")
                            await new Promise(r => setTimeout(r, 500))
                        } else {
                            throw err
                        }
                    }
                } finally {
                    reader.releaseLock()
                    readerRef.current = null
                }
            }
        } catch (err) {
            console.error("RFID fatal error:", err)
        } finally {
            isReadingRef.current = false
            setIsScanning(false)
            isScanningRef.current = false
            console.log("RFID loop stopped")
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
            // Removed automatic read(port) call
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
            if (isReadingRef.current || isConnectingRef.current) return

            isConnectingRef.current = true
            try {
                const ports = await (navigator as any).serial.getPorts()
                const savedKey = localStorage.getItem(STORAGE_KEY)

                const port = ports.find((p: any) => {
                    const info = p.getInfo()
                    return `${info.usbProductId}-${info.usbVendorId}` === savedKey
                })

                if (port) {
                    try {
                        try {
                            await port.open({ baudRate: 115200 })
                        } catch (err: any) {
                            if (!err.message.includes("already open")) throw err
                        }

                        portRef.current = port
                        setIsConnected(true)
                        // Removed automatic read(port) call
                    } catch (err) {
                        console.error("Failed to auto-connect port:", err)
                    }
                }
            } catch (err) {
                console.log("Auto-connect check failed:", err)
            } finally {
                isConnectingRef.current = false
            }
        }

        autoConnect()

        timer = setInterval(() => {
            if (!isReadingRef.current && localStorage.getItem(STORAGE_KEY)) {
                autoConnect()
            }
        }, 5000)

        return () => {
            keepReadingRef.current = false
            if (readerRef.current) {
                readerRef.current.cancel().catch(console.error)
            }
            clearInterval(timer)
        }
    }, [])

    const startScan = useCallback(() => {
        if (isConnected && portRef.current) {
            read(portRef.current)
        } else if (!isConnected) {
            setError("โปรดเชื่อมต่อเครื่องสแกนก่อน")
        }
    }, [isConnected, read])

    const stopScan = useCallback(() => {
        setIsScanning(false)
        isScanningRef.current = false
    }, [])

    return { isConnected, isScanning, lastStudentId, error, connect, startScan, stopScan, setLastStudentId }
}
