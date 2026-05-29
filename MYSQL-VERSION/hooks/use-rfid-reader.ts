"use client"

// Backward-compatible shim. The RFID logic now lives in the reusable library at
// `lib/rfid` (supports both USB/serial and BLE). Existing imports of
// `@/hooks/use-rfid-reader` keep working unchanged — they default to the serial
// transport. To use BLE, import from `@/lib/rfid` and pass `{ transport: "ble" }`.
export { useRfidReader } from "@/lib/rfid"
export type { UseRfidReaderOptions, UseRfidReaderResult } from "@/lib/rfid"
