import crypto from 'node:crypto'
import { getStore } from '@netlify/blobs'
import { hashPassword, makeSignedToken, readSignedToken } from '../../server/auth-core.js'

const STORE_NAME = 'bible-journey'
const RESET_MARKER = 'admin:one-time-data-reset:v1'
const START_DATE = '2026-10-26'
const ACCOUNTS = {
  hannah: 'Hannah',
  prince: 'Prince',
}

class ApiError extends Error {
  constructor(statusCode, message) {
    super(message)
    this.statusCode = statusCode
  }
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

function routePath(event) {
  let pathname = event.path || new URL(event.rawUrl).pathname
  pathname = pathname.replace(/^\/\.netlify\/functions\/api(?=\/|$)/, '')
  if (pathname === '/api') return '/'
  if (pathname.startsWith('/api/')) pathname = pathname.slice(4)
  return pathname || '/'
}

function currentDay(startDate) {
  const start = new Date(`${startDate}T00:00:00Z`)
  const now = new Date()
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  return Math.floor((today - start) / 86400000) + 1
}

function needsOfficialPasswordChange(user, startDate) {
  return !user.passwordChangedAt || user.passwordChangedAt.slice(0, 10) < startDate
}

function parseBody(event) {
  if (!event.body) return {}
  try {
    return JSON.parse(event.body)
  } catch {
    throw new ApiError(400, 'Request body must be valid JSON.')
  }
}

export function createApiHandler(store, env = process.env) {
  async function readJson(key) {
    return store.get(key, { type: 'json' })
  }

  async function writeJson(key, value, options) {
    await store.setJSON(key, value, options)
  }

  async function resetDataOnce() {
    if (env.RESET_BIBLE_JOURNEY_DATA !== 'true') return

    const marker = await readJson(RESET_MARKER)
    if (marker?.status === 'complete') return
    if (marker) throw new ApiError(503, 'The one-time data reset is already in progress. Retry shortly.')

    const claim = await store.setJSON(RESET_MARKER, { status: 'in-progress' }, { onlyIfNew: true })
    if (!claim.modified) {
      const current = await readJson(RESET_MARKER)
      if (current?.status === 'complete') return
      throw new ApiError(503, 'The one-time data reset is already in progress. Retry shortly.')
    }

    try {
      const { blobs } = await store.list()
      for (const { key } of blobs) {
        if (key !== RESET_MARKER) await store.delete(key)
      }
      await writeJson(RESET_MARKER, { status: 'complete' })
    } catch (error) {
      await store.delete(RESET_MARKER)
      throw error
    }
  }

  async function ensureData() {
    await resetDataOnce()

    for (const [username, displayName] of Object.entries(ACCOUNTS)) {
      if (await readJson(`user:${username}`)) continue

      const password = env[`${username.toUpperCase()}_INITIAL_PASSWORD`]
      if (!password || password.length < 8) {
        throw new ApiError(503, `Set ${username.toUpperCase()}_INITIAL_PASSWORD in Netlify environment variables (at least 8 characters) to initialize the account.`)
      }
      await writeJson(`user:${username}`, {
        username,
        displayName,
        ...hashPassword(password),
      }, { onlyIfNew: true })
    }

    const config = await readJson('config')
    if (!config) {
      await writeJson('config', { startDate: env.JOURNEY_START_DATE || START_DATE, finePerMissedDay: 5 }, { onlyIfNew: true })
    }

    for (const username of Object.keys(ACCOUNTS)) {
      if (!(await readJson(`progress:${username}`))) {
        await writeJson(`progress:${username}`, {}, { onlyIfNew: true })
      }
    }
  }

  async function getConfig() {
    return (await readJson('config')) || { startDate: env.JOURNEY_START_DATE || START_DATE, finePerMissedDay: 5 }
  }

  async function getUser(username) {
    return readJson(`user:${username}`)
  }

  async function authorize(event) {
    const secret = env.AUTH_SECRET
    const token = (event.headers?.authorization || event.headers?.Authorization || '').replace(/^Bearer\s+/i, '')
    const username = readSignedToken(token, secret)
    if (!username || !ACCOUNTS[username]) throw new ApiError(401, 'Please sign in again.')
    const user = await getUser(username)
    if (!user) throw new ApiError(401, 'Please sign in again.')
    return user
  }

  async function readActiveReset(username) {
    const id = await readJson(`reset-active:${username}`)
    if (!id) return null
    const reset = await readJson(`reset:${id}`)
    if (!reset) return null

    const deadline = reset.status === 'approved' ? reset.resetExpiresAt : reset.expiresAt
    if (['pending', 'approved'].includes(reset.status) && Date.parse(deadline) <= Date.now()) {
      reset.status = 'expired'
      await writeJson(`reset:${id}`, reset)
    }
    return reset
  }

  async function findPendingApproval(approver) {
    for (const requester of Object.keys(ACCOUNTS)) {
      if (requester === approver) continue
      const reset = await readActiveReset(requester)
      if (reset?.status === 'pending' && reset.approver === approver) return reset
    }
    return null
  }

  async function handle(event) {
    const method = event.httpMethod
    const pathname = routePath(event)
    const body = parseBody(event)

    if (method === 'POST' && pathname === '/login') {
      const username = String(body.username || '').toLowerCase()
      const user = ACCOUNTS[username] && await getUser(username)
      if (!user) throw new ApiError(401, 'Wrong name or password.')
      const candidate = hashPassword(String(body.password || ''), user.salt).hash
      const actual = Buffer.from(candidate, 'hex')
      const expected = Buffer.from(user.hash, 'hex')
      if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
        throw new ApiError(401, 'Wrong name or password.')
      }

      const config = await getConfig()
      const pendingReset = await findPendingApproval(user.username)
      const requester = pendingReset && await getUser(pendingReset.requester)
      return jsonResponse(200, {
        token: makeSignedToken(user.username, env.AUTH_SECRET),
        user: { username: user.username, displayName: user.displayName },
        mustChangePassword: new Date().toISOString().slice(0, 10) >= config.startDate && needsOfficialPasswordChange(user, config.startDate),
        pendingResetApproval: pendingReset ? {
          id: pendingReset.id,
          requester: pendingReset.requester,
          requesterName: requester?.displayName || pendingReset.requester,
          expiresAt: pendingReset.expiresAt,
        } : null,
      })
    }

    if (method === 'POST' && pathname === '/password-reset/request') {
      const username = String(body.username || '').toLowerCase()
      if (!ACCOUNTS[username]) throw new ApiError(400, 'Choose the account that needs a password reset.')

      const existing = await readActiveReset(username)
      if (existing && ['pending', 'approved'].includes(existing.status)) {
        return jsonResponse(200, { requestId: existing.id, status: existing.status })
      }

      const approver = Object.keys(ACCOUNTS).find((account) => account !== username)
      const now = Date.now()
      const reset = {
        id: crypto.randomUUID(),
        requester: username,
        approver,
        status: 'pending',
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
      }
      await writeJson(`reset:${reset.id}`, reset)
      await writeJson(`reset-active:${username}`, reset.id)
      return jsonResponse(200, { requestId: reset.id, status: reset.status })
    }

    const resetStatusMatch = pathname.match(/^\/password-reset\/status\/([0-9a-f-]+)$/i)
    if (method === 'GET' && resetStatusMatch) {
      const reset = await readJson(`reset:${resetStatusMatch[1]}`)
      if (!reset) throw new ApiError(404, 'Password reset request not found.')
      await readActiveReset(reset.requester)
      const updated = await readJson(`reset:${reset.id}`)
      return jsonResponse(200, { status: updated.status })
    }

    if (method === 'POST' && pathname === '/password-reset/decision') {
      const user = await authorize(event)
      const reset = await readJson(`reset:${body.id}`)
      if (!reset || reset.approver !== user.username) throw new ApiError(404, 'Password reset request not found.')
      await readActiveReset(reset.requester)
      const current = await readJson(`reset:${reset.id}`)
      if (current.status !== 'pending') throw new ApiError(400, 'This password reset request is no longer pending.')

      if (body.approve) {
        current.status = 'approved'
        current.approvedAt = new Date().toISOString()
        current.resetExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      } else {
        current.status = 'denied'
        current.deniedAt = new Date().toISOString()
      }
      await writeJson(`reset:${current.id}`, current)
      return jsonResponse(200, { status: current.status })
    }

    if (method === 'POST' && pathname === '/password-reset/complete') {
      const password = String(body.password || '')
      if (password.length < 8) throw new ApiError(400, 'Choose a password with at least 8 characters.')
      const reset = await readJson(`reset:${body.requestId}`)
      if (!reset) throw new ApiError(400, 'This password reset has not been approved or has expired.')
      await readActiveReset(reset.requester)
      const current = await readJson(`reset:${reset.id}`)
      if (current.status !== 'approved') throw new ApiError(400, 'This password reset has not been approved or has expired.')

      const user = await getUser(current.requester)
      if (!user) throw new ApiError(404, 'Account not found.')
      await writeJson(`user:${user.username}`, {
        ...user,
        ...hashPassword(password),
        passwordChangedAt: new Date().toISOString(),
      })
      current.status = 'completed'
      current.completedAt = new Date().toISOString()
      await writeJson(`reset:${current.id}`, current)
      return jsonResponse(200, { success: true })
    }

    if (method === 'POST' && pathname === '/password/change') {
      const user = await authorize(event)
      const password = String(body.password || '')
      if (password.length < 8) throw new ApiError(400, 'Choose a password with at least 8 characters.')
      const config = await getConfig()
      if (new Date().toISOString().slice(0, 10) < config.startDate) {
        throw new ApiError(400, 'Password changes for the official start are not open yet.')
      }
      await writeJson(`user:${user.username}`, {
        ...user,
        ...hashPassword(password),
        passwordChangedAt: new Date().toISOString(),
      })
      return jsonResponse(200, { success: true })
    }

    if (method === 'GET' && pathname === '/state') {
      const user = await authorize(event)
      const config = await getConfig()
      const users = await Promise.all(Object.keys(ACCOUNTS).map(async (username) => {
        const account = await getUser(username)
        return { username, displayName: account.displayName }
      }))
      const progress = {}
      for (const username of Object.keys(ACCOUNTS)) {
        progress[username] = (await readJson(`progress:${username}`)) || {}
      }
      const pendingReset = await findPendingApproval(user.username)
      const requester = pendingReset && await getUser(pendingReset.requester)
      return jsonResponse(200, {
        me: user.username,
        users,
        config,
        today: currentDay(config.startDate),
        mustChangePassword: new Date().toISOString().slice(0, 10) >= config.startDate && needsOfficialPasswordChange(user, config.startDate),
        pendingResetApproval: pendingReset ? {
          id: pendingReset.id,
          requester: pendingReset.requester,
          requesterName: requester?.displayName || pendingReset.requester,
          expiresAt: pendingReset.expiresAt,
        } : null,
        progress,
      })
    }

    if (method === 'POST' && pathname === '/check') {
      const user = await authorize(event)
      const day = Number(body.day)
      const done = !!body.done
      const config = await getConfig()
      if (!Number.isInteger(day) || day < 1 || day > 730) throw new ApiError(400, 'Invalid day.')
      if (day > currentDay(config.startDate)) throw new ApiError(400, "That day hasn't come yet.")

      const progress = (await readJson(`progress:${user.username}`)) || {}
      if (!done && progress[day] && currentDay(config.startDate) >= 1) {
        throw new ApiError(400, 'Reading logs are permanent after the official start date.')
      }
      if (done && !progress[day]) progress[day] = new Date().toISOString()
      else if (!done) delete progress[day]
      await writeJson(`progress:${user.username}`, progress)

      const allProgress = {}
      for (const username of Object.keys(ACCOUNTS)) {
        allProgress[username] = username === user.username
          ? progress
          : (await readJson(`progress:${username}`)) || {}
      }
      return jsonResponse(200, { progress: allProgress })
    }

    throw new ApiError(404, 'API route not found.')
  }

  return async (event) => {
    try {
      if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) {
        throw new ApiError(503, 'Set AUTH_SECRET to a random value of at least 32 characters in Netlify environment variables.')
      }
      await ensureData()
      return await handle(event)
    } catch (error) {
      if (error instanceof ApiError) return jsonResponse(error.statusCode, { error: error.message })
      console.error('Bible Journey Netlify function failed:', error)
      return jsonResponse(500, { error: 'The server could not complete this request. Please try again.' })
    }
  }
}

export async function handler(event) {
  return createApiHandler(getStore(STORE_NAME))(event)
}
