// Reusable RFID reader library — supports both Web Serial (USB) and Web
// Bluetooth (BLE-UART) readers behind one API.
//
// Quick start (React):
//   import { useRfidReader } from "@/lib/rfid"
//   const rfid = useRfidReader({ enabled, transport: "ble" })   // or "serial"
//
// Quick start (framework-agnostic):
//   import { RfidReader } from "@/lib/rfid"
//   const reader = new RfidReader({ transport: "ble" })
//   reader.on("scan", ({ id }) => ...)
//   await reader.connect()   // from a user gesture
//   reader.startScan()
//
// Advanced: build a transport yourself, swap the parser, add BLE profiles.

export { RfidReader } from "./reader"
export { useRfidReader } from "./use-rfid-reader"
export type { UseRfidReaderOptions, UseRfidReaderResult } from "./use-rfid-reader"

export { SerialTransport } from "./transports/serial-transport"
export { BleTransport, DEFAULT_BLE_PROFILES } from "./transports/ble-transport"

export { createRfidParser, defaultRfidParser } from "./parsers"
export type { DefaultParserOptions } from "./parsers"

export type {
  BleTransportOptions,
  BleUartProfile,
  BaseTransportOptions,
  RfidParser,
  RfidReaderEvents,
  RfidReaderOptions,
  RfidReaderState,
  RfidScan,
  RfidStatus,
  RfidTransport,
  RfidTransportType,
  SerialTransportOptions,
} from "./types"
