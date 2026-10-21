import assert from 'node:assert/strict'
import test from 'node:test'
import { createApiHandler } from '../netlify/functions/api.mjs'

function createMemoryStore() {
  const values = new Map()
  return {
    async get(key) {
      return values.has(key) ? structuredClone(values.get(key)) : null
    },
    async setJSON(key, value, options = {}) {
      if (options.onlyIfNew && values.has(key)) return { modified: false }
      values.set(key, structuredClone(value))
      return { modified: true }
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
