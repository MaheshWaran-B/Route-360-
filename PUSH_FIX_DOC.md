# Git Push Error & Solution — Route 360

## 1. The Error

When trying to push code to GitHub with:

```bash
git push origin main
```

You received an error like this:

```
! [rejected]        main -> main (fetch first)
error: failed to push some refs to 'https://github.com/MaheshWaran-B/Route-360-'
hint: Updates were rejected because the remote contains work that you do not
hint: have locally.
```

After running `git pull origin main --rebase`, the next push produced this second error:

```
remote: error: GH013: Repository rule violations found for refs/heads/main.
remote:
remote: - GITHUB PUSH PROTECTION
remote:     Resolve the following violations before pushing again
remote:
remote:     - Push cannot contain secrets
remote:
remote:       —— Openweather API Key
remote:
remote:        locations:
remote:          - commit: 5f7764c5cccfba9593101483ea8f41332cc72b90
remote:            path: script.js:20
remote:
 ! [remote rejected] main -> main (push declined due to repository rule violations)
```

## 2. Root Causes

There were **two separate problems** in sequence:

### Problem A — Remote has commits you don't have locally
GitHub's remote `main` branch contained commits (like a README or an initial commit created on GitHub) that your local repository did not have. Git refuses to push when the histories have diverged.

### Problem B — Push Protection detected a secret
The real blocker was **GitHub Push Protection** (part of GitHub Secret Scanning). It scans the code being pushed for known API keys / secrets. It found your **hardcoded OpenWeather API key** in `script.js`:

```js
const OPENWEATHER_API_KEY = "YOUR_OPENWEATHER_API_KEY_HERE";   // (the real key was exposed)
```

GitHub automatically blocks any push containing a detected secret — and it scans the **entire commit history**, not just the latest commit. So even after the code was updated, the old commit that contained the key still triggered the block.

## 3. The Solution (How It Works)

### Step 1 — Remove secrets from the code
Instead of hardcoding API keys in tracked source files, the keys are now loaded from a **gitignored** config file.

New files added:

- **`config.js`** — contains the real API keys. **This file is gitignored**, so it is never pushed to GitHub.
- **`config.example.js`** — a template with placeholder values (`YOUR_TOMTOM_API_KEY_HERE`, etc.). This is committed so other developers know what keys are needed.

`script.js` was changed to read the keys from the global config:

```js
// Before (hardcoded — exposed secret)
const OPENWEATHER_API_KEY = "YOUR_OPENWEATHER_API_KEY_HERE";

// After (loaded from gitignored config.js)
const TOMTOM_API_KEY = window.CONFIG?.TOMTOM_API_KEY || "";
const OPENWEATHER_API_KEY = window.CONFIG?.OPENWEATHER_API_KEY || "";
```

The backend `backend/src/services/apiClients.ts` was changed to read keys from environment variables (via a gitignored `.env` file) instead of hardcoded fallback values:

```ts
// Before
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY || "YOUR_OPENWEATHER_API_KEY_HERE";

// After
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY || "";
```

A `backend/.env.example` template was added, and `backend/.env` is gitignored.

### Step 2 — Add a `.gitignore` file
A new `.gitignore` was created to make sure secret files are never committed:

```
.env
.env.local
config.js
node_modules/
dist/
```

### Step 3 — Purge the secret from git history
Because the secret existed in an **old commit** (`5f7764c`), GitHub would still block the push even with the code fixed. The secret had to be removed from the history using:

```bash
git filter-branch --force --tree-filter \
  "sed -i 's/YOUR_REAL_OPENWEATHER_API_KEY/YOUR_OPENWEATHER_API_KEY_HERE/g' script.js" \
  HEAD
```

This rewrites every commit to replace the real key with a placeholder, removing it from the entire history.

### Step 4 — Push with `--force-with-lease`
Since history was rewritten, a normal push would be rejected (diverged histories). A force push was needed. `--force-with-lease` is safer than `--force` because it aborts if someone else has pushed in the meantime:

```bash
git push --force-with-lease origin main
```

This succeeded and pushed all the Route 360 enhancements.

## 4. Complete Sequence of Commands Used

```bash
# Problem A: pull the remote commits first
git pull origin main --rebase

# Problem B fix: rewrite history to purge the API key
git filter-branch --force --tree-filter \
  "sed -i 's/YOUR_REAL_OPENWEATHER_API_KEY/YOUR_OPENWEATHER_API_KEY_HERE/g; s/YOUR_REAL_TOMTOM_API_KEY/YOUR_TOMTOM_API_KEY_HERE/g' script.js" \
  HEAD

# Stage, commit the fixed code
git add -A
git commit -m "Enhance Route 360 with risk engine, ML model, backend, and secure config handling"

# Push the rewritten history
git push --force-with-lease origin main
```

## 5. IMPORTANT Security Actions (your responsibility)

Because the API keys were **publicly committed** to GitHub, they should be considered **compromised**:

1. **Rotate / revoke** the exposed keys (OpenWeather, TomTom, and the Mapbox token were all in the pushed code).
   - OpenWeatherMap: https://home.openweathermap.org/api_keys → delete old key, create a new one.
   - TomTom: https://developer.tomtom.com → regenerate the key.
   - Mapbox: https://account.mapbox.com/access-tokens → invalidate the token.
2. **Recreate your local `config.js`** from `config.example.js` and paste your **new** keys into it. Because `config.js` is gitignored, your new keys will never be pushed.
3. Put backend keys in `backend/.env` (gitignored), using `backend/.env.example` as a template.

## 6. How It Works Going Forward

- Your real keys live only in `config.js` (frontend) and `.env` (backend), both gitignored.
- The committed repo contains only placeholder examples, so GitHub Push Protection will not flag anything.
- The `.gitignore` file protects `config.js`, `.env`, `node_modules`, and build output from ever being committed.

---

### Quick Reference: Setup for a New Clone

```bash
# 1. Clone the repo
git clone https://github.com/MaheshWaran-B/Route-360-.git
cd Route-360-

# 2. Create your local config from the template
cp config.example.js config.js
# (open config.js and paste your real keys)

# 3. Create your backend env
cp backend/.env.example backend/.env
# (fill in real keys and DB URI)

# 4. Run the app
#   - Frontend: open index.html in a browser
#   - Backend:  cd backend && npm install && npm run dev
```
