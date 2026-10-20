import express from 'express'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { hashPassword, makeToken, readToken, verifyLogin, readUsers, usersFile } from './auth.js'
import './seed.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(here, 'data')
const progressFile = path.join(dataDir, 'progress.json')
const configFile = path.join(dataDir, 'config.json')
const passwordResetsFile = path.join(dataDir, 'password-resets.json')
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'))
const write = (f, data) => fs.writeFileSync(f, JSON.stringify(data, null, 2))

const app = express()
app.use(express.json())

function requireUser(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '')
  const username = readToken(token)
  const user = username && readUsers().find((u) => u.username === username)
  if (!user) return res.status(401).json({ error: 'Please sign in again.' })
  req.user = user
  next()
}

function currentDay(startDate) {
  const start = new Date(startDate + 'T00:00:00Z')
  const now = new Date()
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  return Math.floor((today - start) / 86400000) + 1
}

function ensurePrestartProgressReset() {
  const config = read(configFile)
  const today = new Date().toISOString().slice(0, 10)
  if (today >= config.startDate || config.prestartProgressResetDate === today) return

  const progress = read(progressFile)
  for (const username of Object.keys(progress)) progress[username] = {}
  fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2))
  config.prestartProgressResetDate = today
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2))
}

function updateExpiredPasswordResets(resets) {
  const now = Date.now()
  let changed = false
  for (const reset of resets) {
    const expiresAt = reset.status === 'approved' ? reset.resetExpiresAt : reset.expiresAt
    if (['pending', 'approved'].includes(reset.status) && Date.parse(expiresAt) <= now) {
      reset.status = 'expired'
      changed = true
    }
  }
  if (changed) write(passwordResetsFile, resets)
  return resets
}

function needsOfficialPasswordChange(user, startDate) {
  return !user.passwordChangedAt || user.passwordChangedAt.slice(0, 10) < startDate
}

ensurePrestartProgressReset()
const prestartResetTimer = setInterval(ensurePrestartProgressReset, 60 * 1000)
prestartResetTimer.unref()

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {}
  const user = verifyLogin(username || '', password || '')
  if (!user) return res.status(401).json({ error: 'Wrong name or password.' })
  const config = read(configFile)
  const resets = updateExpiredPasswordResets(read(passwordResetsFile))
  const pendingReset = resets.find((reset) => reset.approver === user.username && reset.status === 'pending')
  const requester = pendingReset && readUsers().find((u) => u.username === pendingReset.requester)
  res.json({
    token: makeToken(user.username),
    user: { username: user.username, displayName: user.displayName },
    mustChangePassword: new Date().toISOString().slice(0, 10) >= config.startDate && needsOfficialPasswordChange(user, config.startDate),
    pendingResetApproval: pendingReset ? {
      id: pendingReset.id,
      requester: pendingReset.requester,
      requesterName: requester?.displayName || pendingReset.requester,
      expiresAt: pendingReset.expiresAt,
    } : null,
  })
})

app.post('/api/password-reset/request', (req, res) => {
  const username = String(req.body?.username || '').toLowerCase()
  const users = readUsers()
  const requester = users.find((user) => user.username === username)
  if (!requester) return res.status(400).json({ error: 'Choose the account that needs a password reset.' })

  const now = Date.now()
  const resets = updateExpiredPasswordResets(read(passwordResetsFile))
  const existing = resets.find((reset) =>
    reset.requester === username && ['pending', 'approved'].includes(reset.status)
      && Date.parse(reset.status === 'approved' ? reset.resetExpiresAt : reset.expiresAt) > now)
  if (existing) return res.json({ requestId: existing.id, status: existing.status })

  const approver = users.find((user) => user.username !== username)
  const reset = {
    id: crypto.randomUUID(),
    requester: username,
    approver: approver.username,
    status: 'pending',
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
  }
  resets.push(reset)
  write(passwordResetsFile, resets)
  res.json({ requestId: reset.id, status: reset.status })
})

app.get('/api/password-reset/status/:id', (req, res) => {
  const resets = updateExpiredPasswordResets(read(passwordResetsFile))
  const reset = resets.find((item) => item.id === req.params.id)
  if (!reset) return res.status(404).json({ error: 'Password reset request not found.' })
  res.json({ status: reset.status })
})

app.post('/api/password-reset/decision', requireUser, (req, res) => {
  const resets = updateExpiredPasswordResets(read(passwordResetsFile))
  const reset = resets.find((item) => item.id === req.body?.id)
  if (!reset || reset.approver !== req.user.username) return res.status(404).json({ error: 'Password reset request not found.' })
  if (reset.status !== 'pending') return res.status(400).json({ error: 'This password reset request is no longer pending.' })

  if (req.body?.approve) {
    reset.status = 'approved'
    reset.approvedAt = new Date().toISOString()
    reset.resetExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  } else {
    reset.status = 'denied'
    reset.deniedAt = new Date().toISOString()
  }
  write(passwordResetsFile, resets)
  res.json({ status: reset.status })
})

app.post('/api/password-reset/complete', (req, res) => {
  const password = String(req.body?.password || '')
  if (password.length < 8) return res.status(400).json({ error: 'Choose a password with at least 8 characters.' })

  const resets = updateExpiredPasswordResets(read(passwordResetsFile))
  const reset = resets.find((item) => item.id === req.body?.requestId)
  if (!reset || reset.status !== 'approved') return res.status(400).json({ error: 'This password reset has not been approved or has expired.' })
  const users = readUsers()
  const user = users.find((item) => item.username === reset.requester)
  if (!user) return res.status(404).json({ error: 'Account not found.' })

  Object.assign(user, hashPassword(password), { passwordChangedAt: new Date().toISOString() })
  write(usersFile, users)
  reset.status = 'completed'
  reset.completedAt = new Date().toISOString()
  write(passwordResetsFile, resets)
  res.json({ success: true })
})

app.post('/api/password/change', requireUser, (req, res) => {
  const password = String(req.body?.password || '')
  if (password.length < 8) return res.status(400).json({ error: 'Choose a password with at least 8 characters.' })
  const config = read(configFile)
  if (new Date().toISOString().slice(0, 10) < config.startDate) {
    return res.status(400).json({ error: 'Password changes for the official start are not open yet.' })
  }
  const users = readUsers()
  const user = users.find((item) => item.username === req.user.username)
  Object.assign(user, hashPassword(password), { passwordChangedAt: new Date().toISOString() })
  write(usersFile, users)
  res.json({ success: true })
})

app.get('/api/state', requireUser, (req, res) => {
  ensurePrestartProgressReset()
  const config = read(configFile)
  const progress = read(progressFile)
  const allUsers = readUsers()
  const users = allUsers.map((u) => ({ username: u.username, displayName: u.displayName }))
  const resets = updateExpiredPasswordResets(read(passwordResetsFile))
  const pendingReset = resets.find((reset) => reset.approver === req.user.username && reset.status === 'pending')
  const requester = pendingReset && allUsers.find((u) => u.username === pendingReset.requester)
  res.json({
    me: req.user.username,
    users,
    config,
    today: currentDay(config.startDate),
    mustChangePassword: new Date().toISOString().slice(0, 10) >= config.startDate && needsOfficialPasswordChange(req.user, config.startDate),
    pendingResetApproval: pendingReset ? {
      id: pendingReset.id,
      requester: pendingReset.requester,
      requesterName: requester?.displayName || pendingReset.requester,
      expiresAt: pendingReset.expiresAt,
    } : null,
    // each value: { "<day>": "<ISO time checked>" }
    progress,
  })
})

// A user can only ever change THEIR OWN checks — the username comes from the signed token, never the request body.
app.post('/api/check', requireUser, (req, res) => {
  ensurePrestartProgressReset()
  const day = Number(req.body?.day)
  const done = !!req.body?.done
  const config = read(configFile)
  if (!Number.isInteger(day) || day < 1 || day > 730) return res.status(400).json({ error: 'Invalid day.' })
  if (day > currentDay(config.startDate)) return res.status(400).json({ error: "That day hasn't come yet." })
  const progress = read(progressFile)
  const mine = (progress[req.user.username] ||= {})
  if (!done && mine[day] && currentDay(config.startDate) >= 1) {
    return res.status(400).json({ error: 'Reading logs are permanent after the official start date.' })
  }
  if (done) mine[day] = new Date().toISOString()
  else delete mine[day]
  fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2))
  res.json({ progress })
})

const dist = path.join(here, '..', 'dist')
if (fs.existsSync(dist)) {
  app.use(express.static(dist))
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

const port = process.env.PORT || 3001
app.listen(port, () => console.log(`Bible Journey server on http://localhost:${port}`))
