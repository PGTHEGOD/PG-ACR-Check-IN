// Shared types for the transport-agnostic RFID reader library.
//
// The library splits responsibilities into three layers so it can be reused
// across projects (and across both Web Serial USB readers and BLE-UART readers):
//   1. Transport  — owns the physical connection + raw byte IO (serial / ble)
//   2. Reader      — framework-agnostic controller: scan lifecycle, framing, cooldown
//   3. useRfidReader — thin React binding over Reader (keeps the legacy hook API)

export type RfidTransportType = "serial" | "ble"

/** A decoded scan result produced by a parser. */
export interface RfidScan {
  /** The extracted card/student identifier. */
  id: string
  /** The raw frame the id was parsed from (useful for debugging). */
  raw: string
}

/**
 * Drains complete frames out of a rolling text buffer.
 *
 * Implementations should:
 *   - consume only complete frames and return the unconsumed remainder in `rest`
 *   - push every detected id into `scans` (in arrival order)
 *   - push any reader-reported error strings into `errors`
 *
 * Keeping this pure (no side effects) makes it trivial to unit-test and to
 * swap per firmware/protocol.
 */
export type RfidParser = (buffer: string) => {
  scans: RfidScan[]
  errors: string[]
  rest: string
}

/** One BLE-UART service/characteristic profile to probe after connecting. */
export interface BleUartProfile {
  name: string
  /** Primary service UUID. */
  service: string
  /** Characteristic used to send commands to the reader. */
  writeChar: string
  /** Characteristic that emits reader output (may equal writeChar). */
  notifyChar: string
}

/**
 * Transport abstraction. A transport owns the connection and raw text IO only;
 * it knows nothing about the scan protocol or how ids are parsed.
 */
export interface RfidTransport {
  readonly type: RfidTransportType

  /** Whether the underlying Web API exists in this environment. */
  isSupported(): boolean

  /** Whether a live connection is currently established. */
  isConnected(): boolean

  /** Prompt the user to pick + open a device. Requires a user gesture. */
  connect(): Promise<void>

  /**
   * Silently reconnect to a previously-authorized device, if one is remembered.
   * Returns true if a connection was (re)established. Never prompts the user.
   */
  autoConnect(): Promise<boolean>

  /** Close the connection and release resources. */
  disconnect(): Promise<void>

  /** Send a command to the reader. The transport appends its own terminator. */
  write(command: string): Promise<void>

  /**
   * Arm the reader for a single scan.
   *
   * Push-based transports (BLE) send their configured arm command here; the
   * controller also calls this to re-arm after each scan. Pull-based transports
   * (serial) arm themselves inside their read loop, so this is a no-op for them.
   */
  arm(): Promise<void>

  /**
   * Begin streaming incoming reader output. `onChunk` is called with decoded
   * text as it arrives. Safe to call once per connection.
   */
  startReading(onChunk: (text: string) => void): Promise<void>

  /** Stop streaming incoming output. */
  stopReading(): Promise<void>

  /** Register a handler invoked on unexpected disconnects. */
  onDisconnect(handler: () => void): void

  /** Attach a logging sink for diagnostics (TX/RX traces, probe errors, ...). */
  setLogger(logger: (message: string) => void): void
}

/** Options shared by the serial and BLE transports. */
export interface BaseTransportOptions {
  /** localStorage key used to remember the device for auto-reconnect. */
  storageKey?: string
  /** Command sent to arm/trigger a scan (per firmware). */
  armCommand?: string
  /** Terminator appended to every written command. */
  commandTerminator?: string
  /** Optional logging sink. */
  logger?: (message: string) => void
}

export interface SerialTransportOptions extends BaseTransportOptions {
  baudRate?: number
  /** Per-read timeout before re-arming the reader, in ms. */
  readTimeoutMs?: number
  /** Command sent to cancel/reset a pending read on timeout. */
  cancelCommand?: string
}

export interface BleTransportOptions extends BaseTransportOptions {
  /** UART profiles to probe, in priority order. */
  profiles?: BleUartProfile[]
  /** Only show devices whose name starts with this prefix in the chooser. */
  namePrefix?: string
}

/** Options for the framework-agnostic reader controller. */
export interface RfidReaderOptions {
  /** Which transport to use, or a ready-made transport instance. */
  transport: RfidTransportType | RfidTransport
  /** Per-transport configuration (ignored when a transport instance is passed). */
  serial?: SerialTransportOptions
  ble?: BleTransportOptions
  /** Frame parser. Defaults to {@link defaultRfidParser}. */
  parser?: RfidParser
  /** Ignore the same id if re-scanned within this window, in ms. Default 5000. */
  cooldownMs?: number
  /** Auto re-arm after each successful scan so the reader stays hot. Default true. */
  autoRearm?: boolean
  /** Delay before re-arming after a scan, in ms. Default 500. */
  rearmDelayMs?: number
  /** Retry silent auto-connect on this interval while disconnected, in ms. 0 disables. Default 5000. */
  autoReconnectIntervalMs?: number
  /** Optional logging sink for diagnostics. */
  logger?: (message: string) => void
}

/** Connection/scan status emitted by the reader. */
export type RfidStatus = "idle" | "connecting" | "connected" | "scanning" | "error"

/** Snapshot of the reader's observable state. */
export interface RfidReaderState {
  status: RfidStatus
  isConnected: boolean
  isScanning: boolean
  /** The most recently scanned id (consumer clears it via the hook setter). */
  lastScan: string | null
  error: string | null
}

/** Events the reader controller emits. */
export interface RfidReaderEvents {
  state: (state: RfidReaderState) => void
  scan: (scan: RfidScan) => void
  error: (message: string) => void
  log: (message: string) => void
}
