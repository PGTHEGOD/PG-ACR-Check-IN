import type { RfidParser, RfidScan } from "./types"

// Frame terminators emitted by the supported firmwares. Different readers use
// different framing: the USB reader ends frames with "*", many BLE-UART
// firmwares use CR/LF, so we accept any of them.
const FRAME_TERMINATORS = /[*\r\n]/

// Reader-side error frames look like "500:rfid_read_fail;" or contain "fail".
const ERROR_FRAME = /^[45]\d\d:|fail/i

export interface DefaultParserOptions {
  /** Expected id length in digits. Default 5. */
  idLength?: number
  /**
   * If true, also accept a bare run of `idLength` digits left in the buffer
   * with no terminator (some firmwares emit ids without framing). Default true.
   */
  acceptUnframed?: boolean
}

/**
 * Builds a parser that understands the frame formats used by both the USB and
 * BLE readers in this project:
 *   - comma format from the USB reader:        "rfid,12345*"
 *   - bare id from BLE firmwares:              "12345\r\n"
 *   - Mifare block dump from BLE firmwares:    "Block 26: 12345|...."
 *   - error frames:                            "500:rfid_read_fail;"
 *
 * Tune `idLength` for cards that aren't 5 digits.
 */
export function createRfidParser(options: DefaultParserOptions = {}): RfidParser {
  const idLength = options.idLength ?? 5
  const acceptUnframed = options.acceptUnframed ?? true

  const idRun = new RegExp(`\\b(\\d{${idLength}})\\b`)
  const blockRe = /Block\s*26:\s*([^|]+)/i

  const extractId = (frame: string): string | null => {
    // 1. Bare / embedded run of exactly idLength digits.
    const direct = frame.match(idRun)
    if (direct) return direct[1]

    // 2. Mifare "Block 26: 12345|..." dump.
    const block = frame.match(blockRe)
    if (block) {
      const candidate = block[1].split("|")[0]?.trim().replace(/\D/g, "")
      if (candidate && candidate.length === idLength) return candidate
    }

    // 3. Comma format "<tag>,<id>" from the USB reader (id may be any length).
    const parts = frame.split(",")
    if (parts.length > 1) {
      const m = parts[1].match(/\d+/)
      if (m) return m[0]
    }

    return null
  }

  return (buffer: string) => {
    const scans: RfidScan[] = []
    const errors: string[] = []
    let rest = buffer

    // Drain every complete frame (anything up to the next terminator).
    while (FRAME_TERMINATORS.test(rest)) {
      const match = rest.match(FRAME_TERMINATORS)
      if (!match || match.index === undefined) break
      const frame = rest.slice(0, match.index)
      rest = rest.slice(match.index + 1)

      const trimmed = frame.trim()
      if (!trimmed) continue

      if (ERROR_FRAME.test(trimmed)) {
        errors.push(trimmed)
        continue
      }

      const id = extractId(trimmed)
      if (id) scans.push({ id, raw: trimmed })
    }

    // Unframed fallback: a bare id left in the buffer with no terminator.
    if (acceptUnframed && scans.length === 0) {
      const m = rest.match(idRun)
      if (m) {
        scans.push({ id: m[1], raw: rest })
        rest = ""
      }
    }

    // Guard against unbounded growth if junk never terminates.
    if (rest.length > 1024) rest = rest.slice(-1024)

    return { scans, errors, rest }
  }
}

/** Default parser: 5-digit ids, all supported frame formats. */
export const defaultRfidParser: RfidParser = createRfidParser()
