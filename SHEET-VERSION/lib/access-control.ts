const ACCESS_COOKIE = "acr_device_access"
const accessCode = process.env.LIBRARY_ACCESS_CODE?.trim() || ""
const accessCodeHash = process.env.LIBRARY_ACCESS_CODE_HASH?.trim() || ""
const sessionTokenEnv = process.env.LIBRARY_ACCESS_SESSION_TOKEN?.trim() || ""
const sessionSeed = sessionTokenEnv || accessCode || accessCodeHash
const sessionToken = sessionSeed ? encodeToken(sessionSeed) : ""

function encodeToken(value: string) {
  if (!value) return ""
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "utf8").toString("base64url")
  }
  if (typeof btoa !== "undefined") {
    return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
  }
  return value
}

async function hashCode(value: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(value)
  const subtle = globalThis.crypto?.subtle
  if (!subtle) {
    const { webcrypto } = await import("node:crypto")
    const digest = await webcrypto.subtle.digest("SHA-256", data)
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")
  }
  const digest = await subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
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

export async function verifyAccessCode(code: string): Promise<boolean> {
  if (!isAccessEnabled()) return true
  const trimmed = code.trim()
  if (accessCodeHash) {
    const hashed = await hashCode(trimmed)
    return hashed === accessCodeHash
  }
  return trimmed === accessCode
}
