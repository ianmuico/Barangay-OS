# Running Locally for Testing

This is an **offline-first desktop app**: an [Electron](https://www.electronjs.org/) shell
(the `main/` process, TypeScript) wrapping a [Next.js 14](https://nextjs.org/) UI
(the `renderer/` process, React 18 + Tailwind). Data lives in a local **SQLite**
database (`better-sqlite3`) — no external server or internet connection is required.

---

## 1. Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| **Node.js** | 18 LTS or 20 LTS | Next.js 14 needs ≥ 18.17. |
| **npm** | 9+ | Ships with Node. |
| **Native build tools** | — | Required to compile `better-sqlite3`. See below. |

`better-sqlite3` is a native module that gets recompiled against Electron's
Node version (via the `postinstall` → `electron-rebuild` step). You need a working
C/C++ toolchain:

- **macOS:** `xcode-select --install`
- **Windows:** Install the "Desktop development with C++" workload from Visual
  Studio Build Tools (Python 3 is bundled with recent npm).
- **Linux:** `sudo apt install build-essential python3`

---

## 2. Install dependencies

There are **two** `package.json` files — install in both.

```bash
# From the project root
npm install

# Then the Next.js renderer
cd renderer
npm install
cd ..
```

> The root `npm install` automatically runs `electron-rebuild` (the `postinstall`
> script) to compile `better-sqlite3` for Electron. If you ever switch Electron
> versions or see a `NODE_MODULE_VERSION` mismatch error at launch, re-run it:
> `npx electron-rebuild`.

---

## 3. Run in development

From the project root:

```bash
npm run dev
```

This runs two processes concurrently (see [package.json](package.json)):

1. **`dev:next`** — Next.js dev server on **http://localhost:3000**
2. **`dev:electron`** — waits for port 3000, compiles `main/` TypeScript
   (`tsc -p tsconfig.main.json`), then launches Electron with
   `NODE_ENV=development`.

The Electron window opens automatically once the renderer is ready. Edits to
`renderer/` hot-reload. **Edits to `main/` require restarting `npm run dev`**
(the main process is compiled, not watched).

---

## 4. First login

The database is seeded with a default admin account
(see [main/database/connection.ts](main/database/connection.ts)):

- **Username:** `admin`
- **Password:** `admin123`

On first login with the default password the app forces you to set a new one.

---

## 5. Where the data lives (and how to reset it)

The SQLite database, uploaded photos, and pre-upgrade backups are stored in
Electron's per-user `userData` directory — **not** in the repo:

| OS | Path |
|----|------|
| macOS | `~/Library/Application Support/Barangay Management System/` |
| Windows | `%APPDATA%\Barangay Management System\` |
| Linux | `~/.config/Barangay Management System/` |

The main files are `barangay.db` (+ `barangay.db-wal` / `-shm`), `photos/`,
`avatars/`, and `upgrade-backups/`.

**To start from a clean slate**, quit the app and delete `barangay.db`
(and the `-wal`/`-shm` files). It will be recreated and re-seeded on next launch.

---

## 6. Optional: the LAN / mobile companion API

The app can expose a read API over the local network for the mobile companion
(see [MOBILE-APP.md](MOBILE-APP.md)). It is **not** started automatically — you
turn it on from inside the app's Settings. It listens on `0.0.0.0:3001` by
default (configurable) and requires the API key shown in Settings.

---

## 7. Building a production package (optional)

Dev mode is enough for testing. To produce installable artifacts:

```bash
npm run build          # builds renderer (static export) + compiles main
npm run pack           # unpacked app in release/ (fast sanity check)
npm run dist           # full installer for the current OS
npm run dist:win       # Windows NSIS installer (no publish)
```

Output goes to the `release/` (or `dist/`) directory. See
[RELEASING.md](RELEASING.md) for signing and auto-update details.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `NODE_MODULE_VERSION` / `better-sqlite3` won't load | Run `npx electron-rebuild` from the root. |
| Electron window is blank or stuck on splash | Make sure the Next.js server on :3000 is up; check the terminal for errors. |
| Port 3000 already in use | Stop the other process, or change the port in the `dev:next` / `dev:electron` scripts. |
| Want a fresh database | Quit the app and delete `barangay.db` from the `userData` path in §5. |
| Forgot the password after changing it | Delete `barangay.db` to reset to the `admin` / `admin123` seed. |
