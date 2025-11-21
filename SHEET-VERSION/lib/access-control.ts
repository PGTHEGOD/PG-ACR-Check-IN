import { createHash } from "crypto"

const ACCESS_COOKIE = "acr_device_access"
const accessCode = process.env.LIBRARY_ACCESS_CODE?.trim() || ""
const accessCodeHash = process.env.LIBRARY_ACCESS_CODE_HASH?.trim() || ""
const sessionTokenEnv = process.env.LIBRARY_ACCESS_SESSION_TOKEN?.trim() || ""
const sessionToken = sessionTokenEnv || (accessCode ? `acr-session-${accessCode}` : "")

function hashCode(code: string) {
  return createHash("sha256").update(code).digest("hex")
}

export function isAccessEnabled(): boolean {
  return Boolean(sessionToken && (accessCode || accessCodeHash))
}

export function isAuthorizedCookie(value?: string): boolean {
  if (!isAccessEnabled()) return true
  return value === sessionToken
}

export function getAccessCookieName() {
  return ACCESS_COOKIE
}

export function getSessionToken() {
  return sessionToken
}

export function verifyAccessCode(code: string): boolean {
  if (!isAccessEnabled()) return true
  const trimmed = code.trim()
  if (accessCodeHash) {
    return hashCode(trimmed) === accessCodeHash
  }
  return trimmed === accessCode
}
