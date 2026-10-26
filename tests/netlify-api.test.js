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

test('Netlify API initializes fixed-password accounts and rejects password changes and recovery', async () => {
  const handler = createApiHandler(createMemoryStore(), {
    AUTH_SECRET: 'test-secret-that-is-at-least-thirty-two-characters-long',
    HANNAH_INITIAL_PASSWORD: 'hannah-fixed-test-password',
    PRINCE_INITIAL_PASSWORD: 'prince-fixed-test-password',
    JOURNEY_START_DATE: '2026-01-01',
  })

  const firstLogin = await request(handler, 'POST', '/api/login', {
    username: 'hannah',
    password: 'hannah-fixed-test-password',
  })
  assert.equal(firstLogin.statusCode, 200)
  assert.equal('mustChangePassword' in firstLogin.body, false)
  assert.equal('pendingResetApproval' in firstLogin.body, false)
  assert.equal((await request(handler, 'POST', '/api/password/change', {
    password: 'replacement-password',
  }, firstLogin.body.token)).statusCode, 404)
  assert.equal((await request(handler, 'POST', '/api/password-reset/request', {
    username: 'hannah',
  })).statusCode, 404)
  assert.equal((await request(handler, 'POST', '/api/login', {
    username: 'prince',
    password: 'prince-fixed-test-password',
  })).statusCode, 200)
})

test('Netlify API syncs configured passwords to existing accounts without resetting progress', async () => {
  const oldCredentials = hashPassword('old-password', 'old-salt')
  const store = createMemoryStore([
    ['user:hannah', { username: 'hannah', displayName: 'Hannah', ...oldCredentials }],
    ['progress:hannah', { 1: 'saved-progress' }],
  ])
  const env = {
    AUTH_SECRET: 'test-secret-that-is-at-least-thirty-two-characters-long',
    HANNAH_INITIAL_PASSWORD: 'hannah-fixed-test-password',
    PRINCE_INITIAL_PASSWORD: 'prince-fixed-test-password',
  }
  const handler = createApiHandler(store, env)

  const newLogin = await request(handler, 'POST', '/api/login', {
    username: 'hannah',
    password: 'hannah-fixed-test-password',
  })
  assert.equal(newLogin.statusCode, 200)
  assert.equal((await request(handler, 'POST', '/api/login', {
    username: 'hannah',
    password: 'old-password',
  })).statusCode, 401)

  const state = await request(handler, 'GET', '/api/state', null, newLogin.body.token)
  assert.deepEqual(state.body.progress.hannah, { 1: 'saved-progress' })
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
  })).statusCode, 401)
  assert.equal((await request(secondHandler, 'POST', '/api/login', {
    username: 'hannah',
    password: 'another-initial-pass',
  })).statusCode, 200)
})
