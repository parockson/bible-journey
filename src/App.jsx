import { useCallback, useEffect, useMemo, useState } from 'react'
import plan from './plan.json'

const BLOCK_SIZE = 60
const TOTAL_DAYS = 730

const blocks = Array.from({ length: Math.ceil(TOTAL_DAYS / BLOCK_SIZE) }, (_, i) => {
  const start = i * BLOCK_SIZE + 1
  const end = Math.min(start + BLOCK_SIZE - 1, TOTAL_DAYS)
  const bookOf = (day) => plan[day - 1].readings[0].replace(/\s+\d+$/, '')
  const lastBookOf = (day) => {
    const r = plan[day - 1].readings
    return r[r.length - 1].replace(/\s+\d+$/, '')
  }
  const first = bookOf(start)
  const last = lastBookOf(end)
  return { index: i, start, end, label: first === last ? first : `${first} → ${last}` }
})

async function api(path, token, body) {
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || 'Something went wrong.')
    err.status = res.status
    throw err
  }
  return data
}

function dateForDay(startDate, day) {
  const d = new Date(startDate + 'T00:00:00')
  d.setDate(d.getDate() + day - 1)
  return d
}

const fmtDate = (d) => d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
const fmtTime = (iso) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

/* ---------- Login ---------- */
function Login({ onLogin }) {
  const [who, setWho] = useState(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const data = await api('/api/login', null, { username: who, password })
      onLogin(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login">
      <div className="login-card">
        <div className="cross" aria-hidden="true">✝</div>
        <h1>Our Bible Journey</h1>
        <p className="sub">730 days. Two hearts. One Word.</p>

        <div className="who">
          {['hannah', 'prince'].map((u) => (
            <button
              key={u}
              type="button"
              className={`who-btn u-${u} ${who === u ? 'selected' : ''}`}
              onClick={() => { setWho(u); setError('') }}
            >
              <span className="avatar">{u[0].toUpperCase()}</span>
              {u[0].toUpperCase() + u.slice(1)}
            </button>
          ))}
        </div>
        {who && (
          <form onSubmit={submit}>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
            {error && <p className="error">{error}</p>}
            <button className="primary" disabled={busy || !password}>
              {busy ? 'Signing in…' : 'Enter'}
            </button>
          </form>
        )}
        <p className="verse">“Your word is a lamp to my feet and a light to my path.” — Psalm 119:105</p>
      </div>
    </main>
  )
}

const covenantRules = [
  {
    title: 'Daily Commitment',
    text: 'We will read the assigned chapter(s) each day together or individually and then discuss them. Ideal time: mornings or evenings when both are free. If one reads earlier, we still share reflections that same day.',
  },
  {
    title: 'No Abandonment — Even in Conflict',
    text: 'Even if we have a disagreement, argument, or temporary distance, we will NOT abandon this reading plan. The Word of God remains our priority above temporary feelings. Reading continues regardless of relational tension.',
  },
  {
    title: 'Accountability Fine System',
    text: 'If either of us misses a full day’s reading without a valid reason (illness, travel emergency, or prior mutual agreement), a fine of $5 (or an agreed amount) is owed to a shared "Bible Journey Fund." This fund will be reviewed every 60 days (or monthly if preferred). At each review we decide together whether to: (a) donate the balance to a church or charity, (b) use it for a shared date/activity, or (c) roll it forward. The fine is about accountability and grace, not punishment.',
  },
  {
    title: 'Grace for Catch-Up',
    text: 'If we fall behind by 1–3 days, we catch up within the next 5 days. If more than 5 days behind, we skip ahead to the current day’s reading and note the missed chapters to read later (weekends or buffer days). Guilt is not the goal — consistency is.',
  },
  {
    title: 'Shared Reflection',
    text: 'After reading, we each share one insight, question, or application. This can be brief (2–5 minutes). We listen without interrupting or correcting theology in the moment; deeper discussion can happen later.',
  },
  {
    title: 'Prayer Together',
    text: 'We close each reading session with a short prayer — thanking God for what we read and asking for strength to live it out, especially in our relationship.',
  },
  {
    title: 'Regular Review',
    text: 'Every 60 days (or at the end of each month if preferred), we review progress, discuss the fine fund, celebrate consistency, and adjust the plan if needed (e.g., reading time, fine amount).',
  },
  {
    title: 'Encouragement Over Criticism',
    text: 'We speak life to each other. If one is struggling, the other offers help and encouragement, not shame. We are teammates, not judges.',
  },
  {
    title: 'Flexibility with Life',
    text: 'Travel, family events, work seasons, or unexpected busyness may require temporary adjustments. We communicate in advance and agree on a catch-up plan. Silence or avoidance is not an option.',
  },
  {
    title: 'Year 1 & Year 2 Milestones + Final Celebration',
    text: 'At the end of Year 1 (~Day 365) we will pause to celebrate progress (a special meal or small gift). On Day 730 we will celebrate finishing the entire Bible together in a meaningful way we choose in advance.',
  },
]

function CovenantModal({ onContinue }) {
  return (
    <div className="overlay covenant-overlay">
      <section
        className="modal covenant-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="covenant-title"
      >
        <span className="eyebrow">Our Bible Journey</span>
        <h2 id="covenant-title">GROUND RULES &amp; COVENANT</h2>
        <p className="covenant-intro">
          We enter this 2-year (730-day) Bible reading journey together as partners who intend to build our future marriage on the foundation of God&apos;s Word. These rules are our mutual covenant.
        </p>
        <ol className="covenant-rules">
          {covenantRules.map((rule) => (
            <li key={rule.title}>
              <strong>{rule.title}</strong>
              <p>{rule.text}</p>
            </li>
          ))}
        </ol>
        <button className="primary covenant-continue" onClick={onContinue}>
          Continue
        </button>
      </section>
    </div>
  )
}

/* ---------- Small pieces ---------- */
function Ring({ pct, user, size = 84 }) {
  const r = (size - 10) / 2
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} className={`ring u-${user}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} className="ring-bg" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        className="ring-fg"
        strokeDasharray={c}
        strokeDashoffset={c - (c * pct) / 100}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="ring-text">
        {Math.round(pct)}%
      </text>
    </svg>
  )
}

function StatCard({ person, progress, today, isMe }) {
  const days = progress[person.username] || {}
  const done = Object.keys(days).length
  let missed = 0
  for (let d = 1; d < today; d++) if (!days[d]) missed++
  let streak = 0
  for (let d = days[today] ? today : today - 1; d >= 1 && days[d]; d--) streak++
  return (
    <div className={`stat u-${person.username}`}>
      <Ring pct={(done / TOTAL_DAYS) * 100} user={person.username} />
      <div>
        <h3>
          {person.displayName} {isMe && <span className="you">you</span>}
        </h3>
        <p>
          <strong>{done}</strong> of {TOTAL_DAYS} days
        </p>
        <p className="muted">
          🔥 {streak}-day streak · {missed} missed
        </p>
      </div>
    </div>
  )
}

function PersonStatus({ person, day, progress, isMe, canCheck, permanent, onToggle, busy }) {
  const at = (progress[person.username] || {})[day]
  return (
    <div className={`status u-${person.username} ${at ? 'is-done' : ''}`}>
      <span className="avatar">{person.displayName[0]}</span>
      <div className="status-text">
        <strong>{isMe ? 'You' : person.displayName}</strong>
        <span>{at ? `Read ✓ · ${fmtTime(at)}` : 'Not yet'}</span>
      </div>
      {isMe && at && permanent ? (
        <span className="badge yes">Permanently logged</span>
      ) : isMe ? (
        <button className={at ? 'ghost' : 'check'} disabled={!canCheck || busy} onClick={() => onToggle(day, !at)}>
          {at ? 'Undo' : canCheck ? 'I’ve read it' : 'Not open yet'}
        </button>
      ) : (
        <span className={`badge ${at ? 'yes' : 'no'}`}>{at ? 'Done' : 'Waiting'}</span>
      )}
    </div>
  )
}

function ReadingChips({ day }) {
  return (
    <div className="chips">
      {plan[day - 1].readings.map((r) => (
        <span className="chip" key={r}>
          {r}
        </span>
      ))}
    </div>
  )
}

/* ---------- Main app ---------- */
export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('bj-token'))
  const [state, setState] = useState(null)
  const [openDay, setOpenDay] = useState(null)
  const [openBlocks, setOpenBlocks] = useState({})
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [showCovenant, setShowCovenant] = useState(false)

  const logout = useCallback(() => {
    localStorage.removeItem('bj-token')
    setToken(null)
    setState(null)
  }, [])

  const load = useCallback(async () => {
    if (!token) return
    try {
      const data = await api('/api/state', token)
      setState(data)
    } catch (err) {
      if (err.status === 401) logout()
    }
  }, [token, logout])

  useEffect(() => {
    load()
    const t = setInterval(load, 30000) // pick up your partner's check-offs
    return () => clearInterval(t)
  }, [load])

  const today = state?.today ?? 1
  const todayBlock = Math.min(Math.max(Math.floor((today - 1) / BLOCK_SIZE), 0), blocks.length - 1)
  const isBlockOpen = (i) => (i in openBlocks ? openBlocks[i] : i === todayBlock)

  async function toggle(day, done) {
    setBusy(true)
    try {
      const data = await api('/api/check', token, { day, done })
      setState((s) => ({ ...s, progress: data.progress }))
      if (done) setToast(`Day ${day} checked off. Well done! 🙌`)
    } catch (err) {
      setToast(err.message)
    } finally {
      setBusy(false)
      setTimeout(() => setToast(''), 2600)
    }
  }

  const people = state?.users ?? []
  const me = people.find((p) => p.username === state?.me)
  const partner = people.find((p) => p.username !== state?.me)
  const progress = state?.progress ?? {}

  const fund = useMemo(() => {
    if (!state) return 0
    let missed = 0
    for (const p of people) for (let d = 1; d < today; d++) if (!(progress[p.username] || {})[d]) missed++
    return missed * (state.config.finePerMissedDay ?? 5)
  }, [state, people, progress, today])

  if (!token) {
    return (
      <Login
        onLogin={(data) => {
          localStorage.setItem('bj-token', data.token)
          setToken(data.token)
          setShowCovenant(true)
        }}
      />
    )
  }
  if (!state || !me) {
    return (
      <>
        <div className="loading">Loading your journey…</div>
        {showCovenant && <CovenantModal onContinue={() => setShowCovenant(false)} />}
      </>
    )
  }

  const journeyStarted = today >= 1
  const shownDay = Math.min(Math.max(today, 1), TOTAL_DAYS)
  const finished = today > TOTAL_DAYS

  return (
    <div className="app">
      <header className="top">
        <div>
          <h1>Our Bible Journey</h1>
          <p className="muted">
            {journeyStarted ? `Day ${shownDay} of ${TOTAL_DAYS}` : `Begins ${fmtDate(dateForDay(state.config.startDate, 1))}`}
          </p>
        </div>
        <div className="top-right">
          <span className={`avatar u-${me.username}`}>{me.displayName[0]}</span>
          <button className="ghost" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      {journeyStarted && (
        <section className="today">
          <div className="today-head">
            <span className="eyebrow">{finished ? 'You finished the whole Bible' : "Today's reading"}</span>
            <span className="muted">{fmtDate(dateForDay(state.config.startDate, shownDay))}</span>
          </div>
          <h2>Day {shownDay}</h2>
          <ReadingChips day={shownDay} />
          <div className="status-grid">
            <PersonStatus
              person={me}
              day={shownDay}
              progress={progress}
              isMe
              canCheck={shownDay <= today}
              permanent={today >= 1}
              onToggle={toggle}
              busy={busy}
            />
            {partner && <PersonStatus person={partner} day={shownDay} progress={progress} />}
          </div>
        </section>
      )}

      <section className="stats">
        <StatCard person={me} progress={progress} today={today} isMe />
        {partner && <StatCard person={partner} progress={progress} today={today} />}
        <div className="stat fund">
          <div className="coin" aria-hidden="true">$</div>
          <div>
            <h3>Journey Fund</h3>
            <p>
              <strong>${fund}</strong>
            </p>
            <p className="muted">${state.config.finePerMissedDay} per missed day</p>
          </div>
        </div>
      </section>

      <section className="blocks">
        <div className="blocks-head">
          <h2>The Journey</h2>
          <div className="legend">
            <span><i className="dot u-hannah" /> Hannah</span>
            <span><i className="dot u-prince" /> Prince</span>
          </div>
        </div>

        {blocks.map((b) => {
          const count = (u) => {
            let n = 0
            for (let d = b.start; d <= b.end; d++) if ((progress[u] || {})[d]) n++
            return n
          }
          const size = b.end - b.start + 1
          const open = isBlockOpen(b.index)
          return (
            <article key={b.index} className={`block ${open ? 'open' : ''} ${b.index === todayBlock ? 'current' : ''}`}>
              <button className="block-head" onClick={() => setOpenBlocks((o) => ({ ...o, [b.index]: !open }))}>
                <div>
                  <span className="block-num">Block {b.index + 1}</span>
                  <strong>
                    Days {b.start}–{b.end}
                  </strong>
                  <span className="muted books">{b.label}</span>
                </div>
                <div className="block-bars">
                  {people.map((p) => (
                    <div key={p.username} className={`bar u-${p.username}`} title={`${p.displayName}: ${count(p.username)}/${size}`}>
                      <div style={{ width: `${(count(p.username) / size) * 100}%` }} />
                    </div>
                  ))}
                </div>
                <span className="chev">{open ? '▾' : '▸'}</span>
              </button>

              {open && (
                <div className="tiles">
                  {Array.from({ length: size }, (_, i) => b.start + i).map((day) => {
                    const h = !!(progress.hannah || {})[day]
                    const p = !!(progress.prince || {})[day]
                    const cls = [
                      'tile',
                      day === today ? 'today' : '',
                      day > today ? 'future' : '',
                      h && p ? 'both' : '',
                      day < today && !(h && p) ? 'gap' : '',
                    ].join(' ')
                    return (
                      <button key={day} className={cls} onClick={() => setOpenDay(day)}>
                        <span className="tile-num">{day}</span>
                        <span className="tile-dots">
                          <i className={`dot u-hannah ${h ? 'on' : ''}`} />
                          <i className={`dot u-prince ${p ? 'on' : ''}`} />
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </article>
          )
        })}
      </section>

      <footer className="foot">
        <p>“Your word is a lamp to my feet and a light to my path.” — Psalm 119:105</p>
      </footer>

      {openDay && (
        <div className="overlay" onClick={() => setOpenDay(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setOpenDay(null)} aria-label="Close">
              ×
            </button>
            <span className="eyebrow">{fmtDate(dateForDay(state.config.startDate, openDay))}</span>
            <h2>Day {openDay}</h2>
            <ReadingChips day={openDay} />
            <div className="status-grid">
              <PersonStatus
                person={me}
                day={openDay}
                progress={progress}
                isMe
                canCheck={openDay <= today}
                permanent={today >= 1}
                onToggle={toggle}
                busy={busy}
              />
              {partner && <PersonStatus person={partner} day={openDay} progress={progress} />}
            </div>
            <p className="note">You can only check off your own reading — you can see whether {partner?.displayName} has read, but not mark it for them.</p>
          </div>
        </div>
      )}

      {showCovenant && <CovenantModal onContinue={() => setShowCovenant(false)} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
