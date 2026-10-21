import crypto from 'node:crypto'

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return { salt, hash }
}

export function makeSignedToken(username, secret) {
  const body = Buffer.from(JSON.stringify({ u: username, exp: Date.now() + 1000 * 60 * 60 * 24 * 90 })).toString('base64url')
  const signature = crypto.createHmac('sha256', secret).update(body).digest('base64url')
  return `${body}.${signature}`
}

export function readSignedToken(token, secret) {
  if (!token) return null
  const [body, signature] = token.split('.')
  if (!body || !signature) return null
  const expected = crypto.createHmac('sha256', secret).update(body).digest()
  const actual = Buffer.from(signature, 'base64url')
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null

  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString())
    return typeof data.u === 'string' && data.exp > Date.now() ? data.u : null
  } catch {
    return null
  }
}
