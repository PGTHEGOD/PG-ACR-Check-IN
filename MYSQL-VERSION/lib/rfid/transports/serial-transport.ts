import type { RfidTransport, SerialTransportOptions } from "../types"

// Web Serial isn't in the TS DOM lib by default; we keep the surface we touch
// loosely typed rather than pulling in @types/w3c-web-serial.
type SerialPortLike = any

const DEFAULTS = {
  storageKey: "rfid-serial-key",
  armCommand: "disable_card",
  cancelCommand: "cancel",
  commandTerminator: "]",
  baudRate: 115200,
  readTimeoutMs: 3500,
}

/**
 * Web Serial (USB) transport for RFID readers.
 *
 * Pull-based: {@link startReading} runs a loop that arms the reader, waits for a
 * frame (with a timeout that re-triggers the reader so it never goes idle), and
 * emits decoded chunks. Framing/parsing lives in the reader controller.
 */
export class SerialTransport implements RfidTransport {
  readonly type = "serial" as const

  private readonly opts: Required<Omit<SerialTransportOptions, "logger">>
  private port: SerialPortLike | null = null
  private reader: ReadableStreamDefaultReader | null = null
  private keepReading = false
  private looping = false
  private logger: (m: string) => void

  constructor(options: SerialTransportOptions = {}) {
    this.opts = {
      storageKey: options.storageKey ?? DEFAULTS.storageKey,
      armCommand: options.armCommand ?? DEFAULTS.armCommand,
      cancelCommand: options.cancelCommand ?? DEFAULTS.cancelCommand,
      commandTerminator: options.commandTerminator ?? DEFAULTS.commandTerminator,
      baudRate: options.baudRate ?? DEFAULTS.baudRate,
      readTimeoutMs: options.readTimeoutMs ?? DEFAULTS.readTimeoutMs,
    }
    this.logger = options.logger ?? (() => {})
  }

  setLogger(logger: (message: string) => void) {
    this.logger = logger
  }

  isSupported(): boolean {
    return typeof navigator !== "undefined" && "serial" in navigator
  }

  isConnected(): boolean {
    return this.port !== null
  }

  private get serial(): any {
    return (navigator as any).serial
  }

  private async open(port: SerialPortLike) {
    try {
      await port.open({ baudRate: this.opts.baudRate })
    } catch (err: any) {
      // Re-opening an already-open port throws; treat that as success.
      if (!String(err?.message).includes("already open")) throw err
    }
  }

  async connect(): Promise<void> {
    if (!this.isSupported()) {
      throw new Error("เบราว์เซอร์นี้ไม่รองรับการเชื่อมต่อผ่าน USB (Web Serial)")
    }
    const port = await this.serial.requestPort()
    const info = port.getInfo?.() ?? {}
    if (info.usbProductId != null) {
      localStorage.setItem(this.opts.storageKey, `${info.usbProductId}-${info.usbVendorId}`)
    }
    await this.open(port)
    this.port = port
    this.logger(`Serial connected: ${info.usbVendorId}-${info.usbProductId}`)
  }

  async autoConnect(): Promise<boolean> {
    if (!this.isSupported() || this.port) return this.port !== null
    const savedKey = localStorage.getItem(this.opts.storageKey)
    if (!savedKey) return false

    const ports = await this.serial.getPorts()
    const match = ports.find((p: SerialPortLike) => {
      const info = p.getInfo?.() ?? {}
      return `${info.usbProductId}-${info.usbVendorId}` === savedKey
    })
    if (!match) return false

    await this.open(match)
    this.port = match
    this.logger("Serial auto-connected to saved device")
    return true
  }

  async write(command: string): Promise<void> {
    const port = this.port
    if (!port?.writable) return
    try {
      const writer = port.writable.getWriter()
      const data = new TextEncoder().encode(command + this.opts.commandTerminator)
      await writer.write(data)
      writer.releaseLock()
      this.logger(`TX: ${command}`)
    } catch (err) {
      this.logger(`TX error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  /** Serial arms itself inside the read loop, so explicit arming is a no-op. */
  async arm(): Promise<void> {
    /* handled by startReading loop */
  }

  async startReading(onChunk: (text: string) => void): Promise<void> {
    const port = this.port
    if (!port || this.looping) return

    this.looping = true
    this.keepReading = true
    const decoder = new TextDecoder()
    this.logger("Serial read loop started")

    try {
      while (port.readable && this.keepReading) {
        // Arm the reader once per cycle.
        await this.write(this.opts.armCommand)

        const reader = port.readable.getReader()
        this.reader = reader
        try {
          let timeoutId: any
          const timeout = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error("RFID_TIMEOUT")), this.opts.readTimeoutMs)
          })
          try {
            const result: any = await Promise.race([reader.read(), timeout])
            clearTimeout(timeoutId)
            if (result.done) break
            if (result.value) onChunk(decoder.decode(result.value))
          } catch (err: any) {
            if (err?.message === "RFID_TIMEOUT") {
              // Reader idled: cancel the pending read and reset before re-arming.
              await reader.cancel().catch(() => {})
              await this.write(this.opts.cancelCommand)
              await new Promise((r) => setTimeout(r, 500))
            } else {
              throw err
            }
          }
        } finally {
          try {
            reader.releaseLock()
          } catch {
            /* already released */
          }
          this.reader = null
        }
      }
    } catch (err) {
      this.logger(`Serial read error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      this.looping = false
      this.logger("Serial read loop stopped")
    }
  }

  async stopReading(): Promise<void> {
    this.keepReading = false
    if (this.reader) {
      await this.reader.cancel().catch(() => {})
    }
  }

  async disconnect(): Promise<void> {
    await this.stopReading()
    try {
      await this.port?.close?.()
    } catch {
      /* ignore */
    }
    this.port = null
  }

  // Web Serial fires disconnects on navigator.serial, not the port instance.
  onDisconnect(handler: () => void): void {
    if (!this.isSupported()) return
    this.serial.addEventListener?.("disconnect", (event: any) => {
      if (!this.port || event?.target === this.port) {
        this.port = null
        this.looping = false
        handler()
      }
    })
  }
}
