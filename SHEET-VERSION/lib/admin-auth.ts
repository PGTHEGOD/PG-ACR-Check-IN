export async function loginAdmin(password: string): Promise<void> {
  const response = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error || "เข้าสู่ระบบไม่สำเร็จ")
  }
}

export async function logoutAdmin(): Promise<void> {
  await fetch("/api/admin/logout", { method: "POST" })
}

export async function checkAdminSession(): Promise<boolean> {
  try {
    const response = await fetch("/api/admin/session")
    if (!response.ok) return false
    const data = await response.json().catch(() => ({ authenticated: false }))
    return Boolean(data.authenticated)
  } catch {
    return false
  }
}
