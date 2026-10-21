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

const usersFile = path.join(dir, 'users.json')
if (!fs.existsSync(usersFile)) {
  const passwords = {
    hannah: process.env.HANNAH_INITIAL_PASSWORD,
    prince: process.env.PRINCE_INITIAL_PASSWORD,
  }
  if (Object.values(passwords).some((password) => !password || password.length < 8)) {
    throw new Error('Set HANNAH_INITIAL_PASSWORD and PRINCE_INITIAL_PASSWORD to values at least 8 characters long before first run.')
  }
  write('users.json', [
    { username: 'hannah', displayName: 'Hannah', ...hashPassword(passwords.hannah) },
    { username: 'prince', displayName: 'Prince', ...hashPassword(passwords.prince) },
  ])
}
write('progress.json', { hannah: {}, prince: {} })
write('password-resets.json', [])
write('config.json', {
  startDate: '2026-10-26',
  prestartProgressResetDate: '',
  finePerMissedDay: 5,
})
