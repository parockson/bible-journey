# Our Bible Journey 📖

A 730-day shared Bible reading tracker for Hannah and Prince. The React app runs on Netlify with a serverless API and persistent Netlify Blobs storage. For local development, the Node server stores data in JSON files under `server/data/`.

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

For a fresh local install, set private initial passwords before starting the server for the first time:

```powershell
$env:HANNAH_INITIAL_PASSWORD = "choose-a-private-password"
$env:PRINCE_INITIAL_PASSWORD = "choose-another-private-password"
npm run dev
```

The first run creates local accounts in `server/data/users.json` with hashed passwords. That data directory is excluded from Git. For an already initialized local install, change a password with:

```bash
npm run set-password -- hannah MyNewPassword
npm run set-password -- prince TheirNewPassword
```

Passwords are stored hashed (scrypt), not as plain text.

Do not put actual passwords or account files in Git. The Netlify API creates its accounts from private environment variables the first time it runs; local account files are not deployed.

## Deploying on Netlify

`netlify.toml` builds the frontend and routes `/api/*` to the Netlify Function. The function stores accounts, progress, settings, and password-reset requests in the persistent `bible-journey` Netlify Blobs store.

In your Netlify site, add these environment variables under **Project configuration → Environment variables**. Keep them private; do not put their values in source files or commit them.

| Variable | Value |
|----------|-------|
| `AUTH_SECRET` | A random secret of at least 32 characters. Generate one with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` |
| `HANNAH_INITIAL_PASSWORD` | A private initial password for Hannah (at least 8 characters) |
| `PRINCE_INITIAL_PASSWORD` | A private initial password for Prince (at least 8 characters) |

After adding the variables, trigger a new Netlify deploy. The accounts are initialized on the first API request. The initial passwords are only used if the account does not already exist in Blobs; subsequent password changes are stored there and survive new deploys.

Local JSON data in `server/data/` is not automatically copied to Netlify. Keep that directory out of Git.

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
| `server/data/users.json` | local-development logins (hashed passwords; excluded from Git) |
| `server/data/progress.json` | local-development reading progress (excluded from Git) |
| `server/data/config.json` | local-development settings (excluded from Git) |
| `server/data/password-resets.json` | local-development password reset requests (excluded from Git) |
| `src/plan.json` | the full 730-day plan, taken from your PDF |

**Official start date:** Day 1 begins October 26, 2026. Check-offs are disabled before then, and any reading progress present before the start is cleared once per day. Starting October 26, check-offs are permanent and cannot be undone. To change the date, edit `startDate` (YYYY-MM-DD) in `server/data/config.json`.

**Back up** `server/data/progress.json` now and then — it is your whole history.
