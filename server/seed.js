// Creates the data files on first run (logins, progress, config).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { hashPassword } from './auth.js'

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data')
fs.mkdirSync(dir, { recursive: true })

const write = (name, data) => {
  const file = path.join(dir, name)
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(data, null, 2))
}

// Starter passwords — change them with: npm run set-password -- hannah <newPassword>
write('users.json', [
  { username: 'hannah', displayName: 'Hannah', ...hashPassword('hannah123') },
  { username: 'prince', displayName: 'Prince', ...hashPassword('prince123') },
])
write('progress.json', { hannah: {}, prince: {} })
write('password-resets.json', [])
write('config.json', {
  startDate: '2026-10-26',
  prestartProgressResetDate: '',
  finePerMissedDay: 5,
})
