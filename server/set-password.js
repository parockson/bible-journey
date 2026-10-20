// Usage: npm run set-password -- hannah newPassword
import fs from 'node:fs'
import './seed.js'
import { hashPassword, readUsers, usersFile } from './auth.js'

const [name, password] = process.argv.slice(2)
if (!name || !password) {
  console.log('Usage: npm run set-password -- <hannah|prince> <newPassword>')
  process.exit(1)
}
const users = readUsers()
const user = users.find((u) => u.username === name.toLowerCase())
if (!user) {
  console.log('Unknown user. Use hannah or prince.')
  process.exit(1)
}
Object.assign(user, hashPassword(password))
fs.writeFileSync(usersFile, JSON.stringify(users, null, 2))
console.log(`Password updated for ${user.displayName}.`)
