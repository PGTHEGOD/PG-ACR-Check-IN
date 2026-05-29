import type { BleTransportOptions, BleUartProfile, RfidTransport } from "../types"

// Minimal Web Bluetooth surface (the DOM lib ships these as experimental and
// they're often missing). We type only what we use.
interface BleCharacteristic extends EventTarget {
  value?: DataView
  writeValue(data: BufferSource): Promise<void>
  writeValueWithoutResponse?(data: BufferSource): Promise<void>
  startNotifications(): Promise<BleCharacteristic>
  stopNotifications(): Promise<BleCharacteristic>
}
interface BleService {
  getCharacteristic(uuid: string): Promise<BleCharacteristic>
}
interface BleServer {
  connected: boolean
  connect(): Promise<BleServer>
  disconnect(): void
  getPrimaryService(uuid: string): Promise<BleService>
}
interface BleDevice extends EventTarget {
  id?: string
  name?: string
  gatt?: BleServer
}
interface BleRequestOptions {
  optionalServices?: string[]
  acceptAllDevices?: boolean
  filters?: Array<{ namePrefix?: string }>
}
interface BluetoothApi {
  requestDevice(options: BleRequestOptions): Promise<BleDevice>
  getDevices?(): Promise<BleDevice[]>
}

/**
 * Common BLE-UART profiles, probed in order. Most readers expose one of these;
 * the first whose service + characteristics resolve wins. Add your own via the
 * `profiles` option for proprietary firmware.
 */
export const DEFAULT_BLE_PROFILES: BleUartProfile[] = [
  {
    name: "Nordic UART (NUS)",
    service: "6e400001-b5a3-f393-e0a9-e50e24dcca9e",
    writeChar: "6e400002-b5a3-f393-e0a9-e50e24dcca9e",
    notifyChar: "6e400003-b5a3-f393-e0a9-e50e24dcca9e",
  },
  {
    name: "HM-10 / FFE0",
    service: "0000ffe0-0000-1000-8000-00805f9b34fb",
    writeChar: "0000ffe1-0000-1000-8000-00805f9b34fb",
    notifyChar: "0000ffe1-0000-1000-8000-00805f9b34fb",
  },
  {
    name: "Microchip Transparent UART",
    service: "49535343-fe7d-4ae5-8fa9-9fafd205e455",
    writeChar: "49535343-8841-43f4-a8d4-ecbe34729bb3",
    notifyChar: "49535343-1e4d-4bd9-ba61-23c647249616",
  },
]

const DEFAULTS = {
  storageKey: "rfid-ble-key",
  armCommand: "read_card",
  commandTerminator: "\r\n",
}

// Default BLE ATT_MTU is 23 bytes; minus the 3-byte ATT header leaves 20 bytes
// of payload, so we chunk writes to stay safely under it.
const CHUNK_SIZE = 20

/**
 * Web Bluetooth (BLE-UART) transport for RFID readers.
 *
 * Push-based: {@link startReading} subscribes to the notify characteristic and
 * emits decoded chunks. {@link arm} sends the configured arm command. Framing
 * and parsing live in the reader controller.
 */
export class BleTransport implements RfidTransport {
  readonly type = "ble" as const

  private readonly storageKey: string
  private readonly armCommand: string
  private readonly terminator: string
  private readonly profiles: BleUartProfile[]
  private readonly namePrefix?: string
  private logger: (m: string) => void

  private device: BleDevice | null = null
  private writeChar: BleCharacteristic | null = null
  private notifyChar: BleCharacteristic | null = null
  private notifyHandler: ((e: Event) => void) | null = null
  private disconnectHandler: (() => void) | null = null
  private reading = false

  constructor(options: BleTransportOptions = {}) {
    this.storageKey = options.storageKey ?? DEFAULTS.storageKey
    this.armCommand = options.armCommand ?? DEFAULTS.armCommand
    this.terminator = options.commandTerminator ?? DEFAULTS.commandTerminator
    this.profiles = options.profiles ?? DEFAULT_BLE_PROFILES
    this.namePrefix = options.namePrefix
    this.logger = options.logger ?? (() => {})
  }

  setLogger(logger: (message: string) => void) {
    this.logger = logger
  }

  private get bluetooth(): BluetoothApi | undefined {
    if (typeof navigator === "undefined") return undefined
    return (navigator as any).bluetooth
  }

  isSupported(): boolean {
    return !!this.bluetooth
  }

  isConnected(): boolean {
    return !!this.device?.gatt?.connected && !!this.writeChar
  }

  async connect(): Promise<void> {
    const bt = this.bluetooth
    if (!bt) {
      throw new Error("เบราว์เซอร์นี้ไม่รองรับการเชื่อมต่อ Bluetooth (Web Bluetooth)")
    }

    // Most BLE-UART bridges don't advertise their service UUID, so we accept all
    // devices (or narrow by name prefix) and probe known profiles after connect.
    const requestOptions: BleRequestOptions = {
      optionalServices: this.profiles.map((p) => p.service),
    }
    if (this.namePrefix) {
      requestOptions.filters = [{ namePrefix: this.namePrefix }]
    } else {
      requestOptions.acceptAllDevices = true
    }

    const device = await bt.requestDevice(requestOptions)
    if (device.id) {
      localStorage.setItem(this.storageKey, device.id)
      this.logger(`Device saved: ${device.id} (${device.name || "unnamed"})`)
    }
    await this.attach(device)
  }

  async autoConnect(): Promise<boolean> {
    const bt = this.bluetooth
    // getDevices() is gated behind a Chrome flag and is undefined otherwise.
    if (!bt?.getDevices || this.isConnected()) return this.isConnected()
    const savedKey = localStorage.getItem(this.storageKey)
    if (!savedKey) return false

    const devices = await bt.getDevices()
    const match = devices.find((d) => d.id === savedKey)
    if (!match) return false

    this.logger(`Auto-connecting to saved device: ${match.name || match.id}`)
    await this.attach(match)
    return true
  }

  // Connect GATT and probe profiles until one resolves.
  private async attach(device: BleDevice): Promise<void> {
    if (!device.gatt) throw new Error("GATT not available on this device")

    const server = device.gatt.connected ? device.gatt : await device.gatt.connect()
    this.logger(`GATT connected: ${device.name || device.id}`)

    let resolved: { profile: BleUartProfile; writeChar: BleCharacteristic; notifyChar: BleCharacteristic } | null = null
    for (const profile of this.profiles) {
      try {
        const service = await server.getPrimaryService(profile.service)
        const writeChar = await service.getCharacteristic(profile.writeChar)
        const notifyChar =
          profile.writeChar === profile.notifyChar ? writeChar : await service.getCharacteristic(profile.notifyChar)
        resolved = { profile, writeChar, notifyChar }
        this.logger(`Matched profile: ${profile.name}`)
        break
      } catch (e) {
        this.logger(`Profile ${profile.name} not available — ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    if (!resolved) {
      try {
        if (device.gatt?.connected) device.gatt.disconnect()
      } catch {
        /* ignore */
      }
      throw new Error(`อุปกรณ์นี้ไม่ใช่ BLE-UART ที่รองรับ (ลองแล้ว: ${this.profiles.map((p) => p.name).join(", ")})`)
    }

    this.device = device
    this.writeChar = resolved.writeChar
    this.notifyChar = resolved.notifyChar

    const handleDisconnect = () => {
      this.logger("Device disconnected")
      this.device = null
      this.writeChar = null
      this.notifyChar = null
      this.reading = false
      this.disconnectHandler?.()
    }
    device.addEventListener("gattserverdisconnected", handleDisconnect)
  }

  async write(command: string): Promise<void> {
    const writeChar = this.writeChar
    if (!writeChar) {
      this.logger(`Cannot write "${command}": not connected`)
      return
    }
    try {
      const buffer = new TextEncoder().encode(command + this.terminator)
      for (let i = 0; i < buffer.byteLength; i += CHUNK_SIZE) {
        const chunk = buffer.slice(i, i + CHUNK_SIZE)
        // Prefer write-without-response for stream-like UART traffic.
        if (writeChar.writeValueWithoutResponse) {
          await writeChar.writeValueWithoutResponse(chunk)
        } else {
          await writeChar.writeValue(chunk)
        }
      }
      this.logger(`TX: ${command}`)
    } catch (err) {
      this.logger(`TX error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async arm(): Promise<void> {
    await this.write(this.armCommand)
  }

  async startReading(onChunk: (text: string) => void): Promise<void> {
    const notifyChar = this.notifyChar
    if (!notifyChar || this.reading) return
    this.reading = true

    const handler = (event: Event) => {
      const value = (event.target as BleCharacteristic).value
      if (!value) return
      onChunk(new TextDecoder().decode(value))
    }
    this.notifyHandler = handler
    notifyChar.addEventListener("characteristicvaluechanged", handler)

    try {
      await notifyChar.startNotifications()
      this.logger("BLE notifications started")
    } catch (err) {
      this.reading = false
      notifyChar.removeEventListener("characteristicvaluechanged", handler)
      this.notifyHandler = null
      this.logger(`Notify error: ${err instanceof Error ? err.message : String(err)}`)
      throw err
    }
  }

  async stopReading(): Promise<void> {
    const notifyChar = this.notifyChar
    if (notifyChar && this.notifyHandler) {
      notifyChar.removeEventListener("characteristicvaluechanged", this.notifyHandler)
      await notifyChar.stopNotifications().catch(() => {})
    }
    this.notifyHandler = null
    this.reading = false
  }

  async disconnect(): Promise<void> {
    await this.stopReading()
    try {
      if (this.device?.gatt?.connected) this.device.gatt.disconnect()
    } catch {
      /* ignore */
    }
    this.device = null
    this.writeChar = null
    this.notifyChar = null
  }

  onDisconnect(handler: () => void): void {
    this.disconnectHandler = handler
  }
}
