# Our Bible Journey 📖

A 730-day shared Bible reading tracker for Hannah and Prince. React front end, tiny Node server, **no database** — everything lives in JSON files in `server/data/`.

## Run it

```bash
npm install
npm run dev        # development: app on http://localhost:5173
```

For everyday use (one server, one port):

```bash
npm run build
npm start          # http://localhost:3001
```

Open it from your phones on the same Wi-Fi with `http://<your-computer-ip>:3001`, or host it anywhere that runs Node.

## Logins

First run creates `server/data/users.json` with starter passwords:

| User   | Password    |
|--------|-------------|
| hannah | hannah123   |
| prince | prince123   |

**Change them right away:**

```bash
npm run set-password -- hannah MyNewPassword
npm run set-password -- prince TheirNewPassword
```

Passwords are stored hashed (scrypt), not as plain text.

## Password changes and recovery

- On or after October 26, 2026, each person must sign in with their current password and choose a new password before continuing. Passwords must be at least 8 characters.
- Use **Forgot password?** on the login screen to request a reset. The other person must sign in and approve or decline the request within 24 hours.
- If approved, the requester has 24 hours to set a new password on their own device. The approving partner never sees the new password.
- If declined or not approved before expiry, the existing password remains unchanged.

## The rules the app enforces

- Each person checks off **only their own** reading. The server takes the user from the signed login token, so it is impossible to check for the other person.
- Each person can **see** whether the other has read (Today card, and the two dots on every day tile).
- You can't check off days that haven't arrived yet.
- Before October 26, 2026, check-offs are disabled and any progress is cleared daily.
- Starting October 26, check-offs are permanent and cannot be undone.

## Files

| File | What it holds |
|------|---------------|
| `server/data/users.json` | logins (hashed passwords) |
| `server/data/progress.json` | who read which day, and when |
| `server/data/config.json` | `startDate` (Day 1) and `finePerMissedDay` |
| `server/data/password-resets.json` | pending and completed password reset requests |
| `src/plan.json` | the full 730-day plan, taken from your PDF |

**Official start date:** Day 1 begins October 26, 2026. Check-offs are disabled before then, and any reading progress present before the start is cleared once per day. Starting October 26, check-offs are permanent and cannot be undone. To change the date, edit `startDate` (YYYY-MM-DD) in `server/data/config.json`.

**Back up** `server/data/progress.json` now and then — it is your whole history.
