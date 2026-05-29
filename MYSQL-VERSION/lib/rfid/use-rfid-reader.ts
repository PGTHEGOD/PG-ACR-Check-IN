"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { RfidReader } from "./reader"
import type { RfidReaderOptions, RfidScan, RfidTransportType } from "./types"

export interface UseRfidReaderOptions extends Partial<Omit<RfidReaderOptions, "transport">> {
  /** Gate scanning. When false, scanning stops (connection is kept). Default true. */
  enabled?: boolean
  /** Which transport to use. Default "serial" (matches the original behavior). */
  transport?: RfidTransportType
  /** Called whenever a card is scanned (in addition to `lastStudentId`). */
  onScan?: (scan: RfidScan) => void
}

export interface UseRfidReaderResult {
  isConnected: boolean
  isScanning: boolean
  /** Most recent scanned id, or null after the consumer clears it. */
  lastStudentId: string | null
  error: string | null
  /** Whether the active transport's Web API is available in this browser. */
  isSupported: boolean
  /** Prompt the user to pick + connect a device. Call from a click handler. */
  connect: () => Promise<void>
  /** Begin scanning (subscribes + arms the reader). */
  startScan: () => void
  /** Stop scanning (keeps the connection). */
  stopScan: () => void
  /** Clear or override the last scanned id (consumer calls `setLastStudentId(null)`). */
  setLastStudentId: (id: string | null) => void
  /** The underlying controller, for advanced use. */
  reader: RfidReader | null
}

function normalize(arg?: boolean | UseRfidReaderOptions): UseRfidReaderOptions {
  if (typeof arg === "boolean") return { enabled: arg }
  return arg ?? {}
}

/**
 * React binding for {@link RfidReader}. Backward compatible with the original
 * serial-only hook: `useRfidReader(enabled)` still works and defaults to the
 * USB (serial) transport. Pass an options object to select BLE or tune behavior:
 *
 * @example
 * const rfid = useRfidReader({ enabled: onLoginPage, transport: "ble" })
 */
export function useRfidReader(arg?: boolean | UseRfidReaderOptions): UseRfidReaderResult {
  const options = normalize(arg)
  const enabled = options.enabled ?? true
  const transport = options.transport ?? "serial"

  const [isConnected, setIsConnected] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastStudentId, setLastStudentId] = useState<string | null>(null)
  const [isSupported, setIsSupported] = useState(false)

  const readerRef = useRef<RfidReader | null>(null)
  // Keep the latest options visible to the reader's event handlers without
  // forcing a reader rebuild on every render.
  const onScanRef = useRef(options.onScan)
  onScanRef.current = options.onScan
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled

  // Build (and rebuild on transport change) the controller + wire its events.
  useEffect(() => {
    const reader = new RfidReader({
      transport,
      serial: options.serial,
      ble: options.ble,
      parser: options.parser,
      cooldownMs: options.cooldownMs,
      autoRearm: options.autoRearm,
      rearmDelayMs: options.rearmDelayMs,
      autoReconnectIntervalMs: options.autoReconnectIntervalMs,
      logger: options.logger,
    })
    readerRef.current = reader
    setIsSupported(reader.isSupported())

    const offState = reader.on("state", (state) => {
      setIsConnected(state.isConnected)
      setIsScanning(state.isScanning)
      setError(state.error)
    })
    const offScan = reader.on("scan", (scan) => {
      setLastStudentId(scan.id)
      onScanRef.current?.(scan)
    })

    // Retry silent reconnect so a reader powered on after page load still binds.
    const stopReconnect = reader.startAutoReconnect()

    return () => {
      offState()
      offScan()
      stopReconnect()
      void reader.destroy()
      readerRef.current = null
    }
    // Rebuild only when the transport changes; other options are read via refs
    // or only matter at construction time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transport])

  // Stop scanning when disabled (e.g. navigating away from the login page).
  useEffect(() => {
    if (!enabled) {
      void readerRef.current?.stopScan()
    }
  }, [enabled])

  const connect = useCallback(async () => {
    await readerRef.current?.connect()
  }, [])

  const startScan = useCallback(() => {
    if (!enabledRef.current) return
    void readerRef.current?.startScan()
  }, [])

  const stopScan = useCallback(() => {
    void readerRef.current?.stopScan()
  }, [])

  return {
    isConnected,
    isScanning,
    lastStudentId,
    error,
    isSupported,
    connect,
    startScan,
    stopScan,
    setLastStudentId,
    reader: readerRef.current,
  }
}
