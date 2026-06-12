// Extract the user ID from the JWT payload.
// The gateway (verify_jwt: true) has already verified the signature,
// so the sub claim can be trusted here.
export function getUserId(req: Request): string | null {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const token = authHeader.slice(7)
  try {
    const [, payloadB64] = token.split('.')
    const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')))
    return (payload.sub as string) ?? null
  } catch {
    return null
  }
}
