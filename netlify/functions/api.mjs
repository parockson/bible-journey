import crypto from 'node:crypto'
import { connectLambda, getStore } from '@netlify/blobs'
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
      const password = env[`${username.toUpperCase()}_INITIAL_PASSWORD`]
      if (!password || password.length < 8) {
        throw new ApiError(503, `Set ${username.toUpperCase()}_INITIAL_PASSWORD in Netlify environment variables (at least 8 characters) to initialize the account.`)
      }
      const existingUser = await readJson(`user:${username}`)
      if (!existingUser) {
        await writeJson(`user:${username}`, {
          username,
          displayName,
          ...hashPassword(password),
        }, { onlyIfNew: true })
        continue
      }

      const currentHash = hashPassword(password, existingUser.salt).hash
      if (currentHash !== existingUser.hash) {
        await writeJson(`user:${username}`, {
          ...existingUser,
          ...hashPassword(password),
        })
      }
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

      return jsonResponse(200, {
        token: makeSignedToken(user.username, env.AUTH_SECRET),
        user: { username: user.username, displayName: user.displayName },
      })
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
      return jsonResponse(200, {
        me: user.username,
        users,
        config,
        today: currentDay(config.startDate),
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
  connectLambda(event)
  return createApiHandler(getStore(STORE_NAME))(event)
}
