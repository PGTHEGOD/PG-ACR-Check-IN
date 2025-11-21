const ACCESS_COOKIE = "acr_device_access"
const accessCode = process.env.LIBRARY_ACCESS_CODE?.trim() || ""
const sessionToken =
  process.env.LIBRARY_ACCESS_SESSION_TOKEN?.trim() || (accessCode ? `acr-session-${accessCode}` : "")

export function isAccessEnabled(): boolean {
  return Boolean(accessCode && sessionToken)
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
  return code === accessCode
}
