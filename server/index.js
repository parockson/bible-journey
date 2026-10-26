import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeToken, readToken, verifyLogin, readUsers } from './auth.js'
import './seed.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(here, 'data')
const progressFile = path.join(dataDir, 'progress.json')
const configFile = path.join(dataDir, 'config.json')
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'))

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

ensurePrestartProgressReset()
const prestartResetTimer = setInterval(ensurePrestartProgressReset, 60 * 1000)
prestartResetTimer.unref()

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {}
  const user = verifyLogin(username || '', password || '')
  if (!user) return res.status(401).json({ error: 'Wrong name or password.' })
  res.json({
    token: makeToken(user.username),
    user: { username: user.username, displayName: user.displayName },
  })
})

app.get('/api/state', requireUser, (req, res) => {
  ensurePrestartProgressReset()
  const config = read(configFile)
  const progress = read(progressFile)
  const users = readUsers().map((u) => ({ username: u.username, displayName: u.displayName }))
  res.json({
    me: req.user.username,
    users,
    config,
    today: currentDay(config.startDate),
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
