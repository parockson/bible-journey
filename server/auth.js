import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { hashPassword, makeSignedToken, readSignedToken } from './auth-core.js'

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data')
export const usersFile = path.join(dir, 'users.json')
const secretFile = path.join(dir, 'secret.txt')

export { hashPassword }

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

export function makeToken(username) {
  return makeSignedToken(username, secret())
}

export function readToken(token) {
  return readSignedToken(token, secret())
}
