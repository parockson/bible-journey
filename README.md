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

Set the fixed account passwords as environment variables before starting a fresh local server:

```powershell
$env:HANNAH_INITIAL_PASSWORD = "<Hannah's configured password>"
$env:PRINCE_INITIAL_PASSWORD = "<Prince's configured password>"
npm run dev
```

The first run creates local accounts in `server/data/users.json` with scrypt-hashed passwords. Password changes and recovery are disabled in the app. To update the Netlify accounts to the configured passwords, update the environment variables and deploy; existing progress and settings are preserved.

Do not put actual passwords or account files in Git. The Netlify API creates its accounts from private environment variables the first time it runs; local account files are not deployed.

## Deploying on Netlify

`netlify.toml` builds the frontend and routes `/api/*` to the Netlify Function. The function stores accounts, progress, and settings in the persistent `bible-journey` Netlify Blobs store.

In your Netlify site, add these environment variables under **Project configuration → Environment variables**. Keep them private; do not put their values in source files or commit them.

| Variable | Value |
|----------|-------|
| `AUTH_SECRET` | A random secret of at least 32 characters. Generate one with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` |
| `HANNAH_INITIAL_PASSWORD` | Hannah's fixed password (at least 8 characters) |
| `PRINCE_INITIAL_PASSWORD` | Prince's fixed password (at least 8 characters) |

After adding or updating the variables, trigger a new Netlify deploy. On the next API request, accounts are created or their stored password hashes are synchronized to these values. Existing progress and settings are preserved.

Local JSON data in `server/data/` is not automatically copied to Netlify. Keep that directory out of Git.

### One-time Netlify data reset

To erase all Netlify Blobs data for a fresh start, add `RESET_BIBLE_JOURNEY_DATA=true` to the production environment variables and deploy. The next API request deletes the site's stored accounts, progress, and settings, then initializes accounts from the configured passwords. Remove `RESET_BIBLE_JOURNEY_DATA` and deploy again after the reset. The reset is guarded by a persistent one-time marker, so leaving the variable set will not repeat it.

These are shared, fixed passwords and cannot be changed or recovered through the app. Use distinct passwords that are not reused elsewhere, and share them only with the intended account holders.

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
| `src/plan.json` | the full 730-day plan, taken from your PDF |

**Official start date:** Day 1 begins October 26, 2026. Check-offs are disabled before then, and any reading progress present before the start is cleared once per day. Starting October 26, check-offs are permanent and cannot be undone. To change the date, edit `startDate` (YYYY-MM-DD) in `server/data/config.json`.

**Back up** `server/data/progress.json` now and then — it is your whole history.
