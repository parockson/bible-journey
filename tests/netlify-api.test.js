import assert from 'node:assert/strict'
import test from 'node:test'
import { createApiHandler } from '../netlify/functions/api.mjs'
import { hashPassword } from '../server/auth-core.js'

function createMemoryStore(initialValues = []) {
  const values = new Map(initialValues)
  return {
    async get(key) {
      return values.has(key) ? structuredClone(values.get(key)) : null
    },
    async setJSON(key, value, options = {}) {
      if (options.onlyIfNew && values.has(key)) return { modified: false }
      values.set(key, structuredClone(value))
      return { modified: true }
    },
    async list() {
      return { blobs: Array.from(values.keys(), (key) => ({ key })) }
    },
    async delete(key) {
      values.delete(key)
    },
  }
}

function event(method, path, body, token) {
  return {
    httpMethod: method,
    path,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: body ? JSON.stringify(body) : null,
  }
}

async function request(handler, method, path, body, token) {
  const response = await handler(event(method, path, body, token))
  return { statusCode: response.statusCode, body: JSON.parse(response.body) }
}

test('Netlify API initializes private accounts and supports partner-approved password recovery', async () => {
  const handler = createApiHandler(createMemoryStore(), {
    AUTH_SECRET: 'test-secret-that-is-at-least-thirty-two-characters-long',
    HANNAH_INITIAL_PASSWORD: 'hannah-initial-pass',
    PRINCE_INITIAL_PASSWORD: 'prince-initial-pass',
    JOURNEY_START_DATE: '2026-01-01',
  })

  const firstLogin = await request(handler, 'POST', '/api/login', {
    username: 'hannah',
    password: 'hannah-initial-pass',
  })
  assert.equal(firstLogin.statusCode, 200)
  assert.equal(firstLogin.body.mustChangePassword, true)

  const changePassword = await request(handler, 'POST', '/api/password/change', {
    password: 'hannah-new-password',
  }, firstLogin.body.token)
  assert.equal(changePassword.statusCode, 200)
  assert.equal((await request(handler, 'POST', '/api/login', {
    username: 'hannah',
    password: 'hannah-new-password',
  })).body.mustChangePassword, false)

  const resetRequest = await request(handler, 'POST', '/api/password-reset/request', { username: 'hannah' })
  assert.equal(resetRequest.statusCode, 200)
  const princeLogin = await request(handler, 'POST', '/api/login', {
    username: 'prince',
    password: 'prince-initial-pass',
  })
  assert.equal(princeLogin.body.pendingResetApproval.id, resetRequest.body.requestId)

  const approval = await request(handler, 'POST', '/api/password-reset/decision', {
    id: resetRequest.body.requestId,
    approve: true,
  }, princeLogin.body.token)
  assert.equal(approval.body.status, 'approved')
  assert.equal((await request(handler, 'GET', `/api/password-reset/status/${resetRequest.body.requestId}`)).body.status, 'approved')

  const resetComplete = await request(handler, 'POST', '/api/password-reset/complete', {
    requestId: resetRequest.body.requestId,
    password: 'hannah-reset-password',
  })
  assert.equal(resetComplete.statusCode, 200)
  assert.equal((await request(handler, 'POST', '/api/login', {
    username: 'hannah',
    password: 'hannah-reset-password',
  })).statusCode, 200)

  const deniedRequest = await request(handler, 'POST', '/api/password-reset/request', { username: 'prince' })
  const hannahLogin = await request(handler, 'POST', '/api/login', {
    username: 'hannah',
    password: 'hannah-reset-password',
  })
  const denied = await request(handler, 'POST', '/api/password-reset/decision', {
    id: deniedRequest.body.requestId,
    approve: false,
  }, hannahLogin.body.token)
  assert.equal(denied.body.status, 'denied')
  assert.equal((await request(handler, 'POST', '/api/login', {
    username: 'prince',
    password: 'prince-initial-pass',
  })).statusCode, 200)
})

test('Netlify API performs a guarded one-time fresh data reset', async () => {
  const { hash } = hashPassword('old-password', 'old-salt')
  const store = createMemoryStore([
    ['user:hannah', { username: 'hannah', displayName: 'Hannah', salt: 'old-salt', hash }],
    ['progress:hannah', { 1: 'old-progress' }],
    ['config', { startDate: '2026-01-01', finePerMissedDay: 99 }],
    ['reset-active:hannah', 'old-request'],
    ['reset:old-request', { status: 'pending' }],
  ])
  const env = {
    AUTH_SECRET: 'test-secret-that-is-at-least-thirty-two-characters-long',
    HANNAH_INITIAL_PASSWORD: 'hannah-reset-pass',
    PRINCE_INITIAL_PASSWORD: 'prince-reset-pass',
    RESET_BIBLE_JOURNEY_DATA: 'true',
  }
  const handler = createApiHandler(store, env)

  const firstLogin = await request(handler, 'POST', '/api/login', {
    username: 'hannah',
    password: 'hannah-reset-pass',
  })
  assert.equal(firstLogin.statusCode, 200)
  assert.equal((await request(handler, 'POST', '/api/login', {
    username: 'hannah',
    password: 'old-password',
  })).statusCode, 401)

  const state = await request(handler, 'GET', '/api/state', null, firstLogin.body.token)
  assert.deepEqual(state.body.progress, { hannah: {}, prince: {} })
  assert.equal(state.body.config.finePerMissedDay, 5)
  assert.equal(await store.get('reset:old-request'), null)

  env.HANNAH_INITIAL_PASSWORD = 'another-initial-pass'
  const secondHandler = createApiHandler(store, env)
  assert.equal((await request(secondHandler, 'POST', '/api/login', {
    username: 'hannah',
    password: 'hannah-reset-pass',
  })).statusCode, 200)
  assert.equal((await request(secondHandler, 'POST', '/api/login', {
    username: 'hannah',
    password: 'another-initial-pass',
  })).statusCode, 401)
})
