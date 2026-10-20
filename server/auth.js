import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data')
export const usersFile = path.join(dir, 'users.json')
const secretFile = path.join(dir, 'secret.txt')

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return { salt, hash }
}

export function readUsers() {
  return JSON.parse(fs.readFileSync(usersFile, 'utf8'))
}

export function verifyLogin(username, password) {
  const user = readUsers().find((u) => u.username === String(username).toLowerCase())
  if (!user) return null
  const { hash } = hashPassword(String(password), user.salt)
  const a = Buffer.from(hash, 'hex')
  const b = Buffer.from(user.hash, 'hex')
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? user : null
}

function secret() {
  if (!fs.existsSync(secretFile)) fs.writeFileSync(secretFile, crypto.randomBytes(32).toString('hex'))
  return fs.readFileSync(secretFile, 'utf8')
}

const sign = (body) => crypto.createHmac('sha256', secret()).update(body).digest('base64url')

export function makeToken(username) {
  const body = Buffer.from(JSON.stringify({ u: username, exp: Date.now() + 1000 * 60 * 60 * 24 * 90 })).toString('base64url')
  return `${body}.${sign(body)}`
}

export function readToken(token) {
  if (!token) return null
  const [body, sig] = token.split('.')
  if (!body || !sig || sign(body) !== sig) return null
  const data = JSON.parse(Buffer.from(body, 'base64url').toString())
  return data.exp > Date.now() ? data.u : null
}
