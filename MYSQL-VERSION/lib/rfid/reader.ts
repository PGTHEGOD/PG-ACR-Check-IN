import { defaultRfidParser } from "./parsers"
import { BleTransport } from "./transports/ble-transport"
import { SerialTransport } from "./transports/serial-transport"
import type {
  RfidParser,
  RfidReaderEvents,
  RfidReaderOptions,
  RfidReaderState,
  RfidScan,
  RfidStatus,
  RfidTransport,
} from "./types"

const DEFAULTS = {
  cooldownMs: 5000,
  autoRearm: true,
  rearmDelayMs: 500,
  autoReconnectIntervalMs: 5000,
}

function buildTransport(options: RfidReaderOptions, logger: (m: string) => void): RfidTransport {
  if (typeof options.transport !== "string") {
    options.transport.setLogger(logger)
    return options.transport
  }
  return options.transport === "ble"
    ? new BleTransport({ ...options.ble, logger })
    : new SerialTransport({ ...options.serial, logger })
}

/**
 * Framework-agnostic RFID reader controller.
 *
 * Wraps any {@link RfidTransport} with the cross-cutting scan logic — frame
 * buffering, parsing, same-card cooldown, auto re-arm, silent auto-reconnect —
 * and exposes a small event API. The React hook is a thin binding over this;
 * non-React projects can use it directly.
 *
 * @example
 * const reader = new RfidReader({ transport: "ble" })
 * reader.on("scan", ({ id }) => console.log("scanned", id))
 * await reader.connect()   // from a click handler
 * reader.startScan()
 */
export class RfidReader {
  readonly transport: RfidTransport

  private readonly parser: RfidParser
  private readonly cooldownMs: number
  private readonly autoRearm: boolean
  private readonly rearmDelayMs: number
  private readonly autoReconnectIntervalMs: number

  private buffer = ""
  private listeners: { [K in keyof RfidReaderEvents]: Set<RfidReaderEvents[K]> } = {
    state: new Set(),
    scan: new Set(),
    error: new Set(),
    log: new Set(),
  }

  private lastId: string | null = null
  private lastIdAt = 0
  private rearmTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectTimer: ReturnType<typeof setInterval> | null = null
  private readingStarted = false
  private destroyed = false

  private state: RfidReaderState = {
    status: "idle",
    isConnected: false,
    isScanning: false,
    lastScan: null,
    error: null,
  }

  constructor(options: RfidReaderOptions) {
    const log = (m: string) => this.emit("log", m)
    this.parser = options.parser ?? defaultRfidParser
    this.cooldownMs = options.cooldownMs ?? DEFAULTS.cooldownMs
    this.autoRearm = options.autoRearm ?? DEFAULTS.autoRearm
    this.rearmDelayMs = options.rearmDelayMs ?? DEFAULTS.rearmDelayMs
    this.autoReconnectIntervalMs = options.autoReconnectIntervalMs ?? DEFAULTS.autoReconnectIntervalMs
    this.transport = buildTransport(options, (m) => {
      log(m)
      options.logger?.(m)
    })

    this.transport.onDisconnect(() => {
      this.readingStarted = false
      this.setState({ status: "idle", isConnected: false, isScanning: false })
    })
  }

  // ---- events -------------------------------------------------------------

  on<K extends keyof RfidReaderEvents>(event: K, handler: RfidReaderEvents[K]): () => void {
    this.listeners[event].add(handler)
    return () => this.listeners[event].delete(handler)
  }

  getState(): RfidReaderState {
    return this.state
  }

  isSupported(): boolean {
    return this.transport.isSupported()
  }

  private emit<K extends keyof RfidReaderEvents>(event: K, ...args: Parameters<RfidReaderEvents[K]>) {
    this.listeners[event].forEach((handler) => {
      ;(handler as (...a: unknown[]) => void)(...args)
    })
  }

  private setState(patch: Partial<RfidReaderState>) {
    this.state = { ...this.state, ...patch }
    this.emit("state", this.state)
  }

  private setStatus(status: RfidStatus) {
    this.setState({ status })
  }

  // ---- connection ---------------------------------------------------------

  /** Prompt the user to pick a device and connect. Call from a user gesture. */
  async connect(): Promise<void> {
    this.setState({ status: "connecting", error: null })
    try {
      await this.transport.connect()
      this.setState({ status: "connected", isConnected: true, error: null })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.setState({ status: "error", error: message })
      this.emit("error", message)
      throw err
    }
  }

  /** Silent reconnect to a remembered device. Returns true if connected. */
  async autoConnect(): Promise<boolean> {
    if (this.state.isConnected) return true
    try {
      const ok = await this.transport.autoConnect()
      if (ok) this.setState({ status: "connected", isConnected: true, error: null })
      return ok
    } catch (err) {
      this.emit("log", `Auto-connect failed: ${err instanceof Error ? err.message : String(err)}`)
      return false
    }
  }

  /**
   * Start retrying silent auto-connect on an interval until connected. Returns a
   * stop function. No-op if `autoReconnectIntervalMs` is 0.
   */
  startAutoReconnect(): () => void {
    if (this.reconnectTimer || this.autoReconnectIntervalMs <= 0) return () => {}
    if (typeof setInterval === "undefined") return () => {}

    const tick = () => {
      if (this.destroyed || this.state.isConnected) return
      void this.autoConnect()
    }
    void tick()
    this.reconnectTimer = setInterval(tick, this.autoReconnectIntervalMs)
    return () => this.stopAutoReconnect()
  }

  stopAutoReconnect(): void {
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  // ---- scanning -----------------------------------------------------------

  /** Begin (or re-trigger) scanning. Subscribes to the stream once, then arms. */
  async startScan(): Promise<void> {
    if (!this.state.isConnected) {
      const message = "ยังไม่ได้เชื่อมต่อเครื่องอ่าน"
      this.setState({ error: message })
      this.emit("error", message)
      return
    }
    this.buffer = ""
    this.setState({ status: "scanning", isScanning: true, error: null })

    if (!this.readingStarted) {
      this.readingStarted = true
      try {
        await this.transport.startReading((chunk) => this.ingest(chunk))
      } catch (err) {
        this.readingStarted = false
        const message = err instanceof Error ? err.message : String(err)
        this.setState({ status: "error", isScanning: false, error: message })
        this.emit("error", message)
        return
      }
    }
    await this.transport.arm()
  }

  /** Stop scanning. Leaves the connection open. */
  async stopScan(): Promise<void> {
    this.clearRearm()
    this.setState({ isScanning: false, status: this.state.isConnected ? "connected" : "idle" })
  }

  async disconnect(): Promise<void> {
    this.clearRearm()
    this.readingStarted = false
    await this.transport.stopReading().catch(() => {})
    await this.transport.disconnect().catch(() => {})
    this.setState({ status: "idle", isConnected: false, isScanning: false })
  }

  /** Tear down timers + reading. Call on unmount. */
  async destroy(): Promise<void> {
    this.destroyed = true
    this.stopAutoReconnect()
    this.clearRearm()
    await this.transport.stopReading().catch(() => {})
    ;(Object.keys(this.listeners) as (keyof RfidReaderEvents)[]).forEach((k) => this.listeners[k].clear())
  }

  // ---- internals ----------------------------------------------------------

  private clearRearm() {
    if (this.rearmTimer) {
      clearTimeout(this.rearmTimer)
      this.rearmTimer = null
    }
  }

  private scheduleRearm() {
    if (!this.autoRearm) return
    this.clearRearm()
    // Wrapped in a timer so it runs after the current detection settles.
    this.rearmTimer = setTimeout(() => {
      this.emit("log", "Auto re-arm")
      void this.transport.arm()
    }, this.rearmDelayMs)
  }

  private ingest(chunk: string) {
    this.buffer += chunk
    const { scans, errors, rest } = this.parser(this.buffer)
    this.buffer = rest

    for (const message of errors) {
      this.emit("log", `⚠ Scan failed: ${message}`)
      this.emit("error", "สแกนไม่สำเร็จ กรุณาแตะบัตรอีกครั้ง")
      this.setState({ isScanning: true, error: "สแกนไม่สำเร็จ กรุณาแตะบัตรอีกครั้ง" })
      this.scheduleRearm()
    }

    for (const scan of scans) {
      if (this.acceptScan(scan)) {
        this.emit("log", `✓ Detected id: ${scan.id}`)
        this.emit("scan", scan)
        this.setState({ isScanning: false, lastScan: scan.id, error: null })
        this.scheduleRearm()
      }
    }
  }

  // Same-card cooldown: drop a repeat of the last id within the cooldown window.
  private acceptScan(scan: RfidScan): boolean {
    const now = this.monotonicNow()
    const isRepeat = scan.id === this.lastId && now - this.lastIdAt < this.cooldownMs
    if (isRepeat) return false
    this.lastId = scan.id
    this.lastIdAt = now
    return true
  }

  private monotonicNow(): number {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
      return performance.now()
    }
    // Fallback for environments without performance.now.
    return new Date().getTime()
  }
}
