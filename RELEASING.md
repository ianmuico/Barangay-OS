# Releasing Updates Over the Internet

> **Easiest path (recommended): push a version tag and let GitHub build both
> Windows and Mac for you.** See [UPDATING.md](UPDATING.md) — the automated
> workflow in `.github/workflows/release.yml` needs no personal token and no local
> build. The manual steps below (§2) are the fallback for building on your own
> machine, and §3 (database safety) applies to **every** release either way.

How to ship a new version of the Barangay Management System to barangays that
already have it installed — safely, for free, using GitHub Releases. Installed
apps check GitHub on startup, ask the user to update, download in the
background, and install on restart. **The barangay's database is never touched
by an update** — it lives in the app data folder, outside the installed app.

**Windows** gets full silent auto-update. **Mac** (built unsigned, to stay free)
notifies the user and opens the download page — installing the new `.dmg` over the
old app keeps all data, since the database lives outside the app. Silent Mac
auto-update would require a paid Apple Developer ID.

---

## 1. One-time setup (do this once)

### a. GitHub token for the private repo
Installed apps need a token to read releases from the private repo
`mmmsss211/barangay-management`:

1. GitHub → Settings → Developer settings → **Fine-grained personal access tokens** → Generate new token.
2. Repository access: **only** `barangay-management`. Permissions: **Contents: Read-only**. Expiration: 1 year (set a calendar reminder to rotate it).
3. Save the token text into a file named **`update-token.txt`** — you will copy this file to each barangay PC (see §4). The app looks for it in:
   - the app's `resources` folder (e.g. `C:\Users\<user>\AppData\Local\Programs\Barangay Management System\resources\update-token.txt`), or
   - the app data folder (`%APPDATA%\barangay-management\update-token.txt`).

> Why a file and not baked into the app? You can rotate or revoke a leaked
> token per-PC without rebuilding the app.

### b. Publishing token (your machine only)
Create a second token with **Contents: Read and write** on the same repo.
This one stays on YOUR computer only, as an environment variable when publishing:

```powershell
# Windows PowerShell
$env:GH_TOKEN = "github_pat_XXXX"
```

### c. Build machine
Windows installers must be built **on Windows** (a Windows PC or VM).
Install Node.js 20 LTS, then in the project folder: `npm install`
(this compiles the SQLite native module for Windows automatically via electron-rebuild).

---

## 2. Releasing a new version — the routine

```powershell
# 1. Bump the version in package.json — THIS IS WHAT TRIGGERS THE UPDATE.
#    "version": "1.4.0"  ->  "1.5.0"
#    Installed apps update only when the release version is HIGHER than theirs.

# 1b. Update CHANGELOG.md — move the [Unreleased] notes under a new
#     "## [1.5.0] - YYYY-MM-DD" heading so every shipped version is tracked.

# 2. Run the pre-release safety checklist (see §3). Seriously.

# 3. Build and publish in one step:
$env:GH_TOKEN = "your-publishing-token"
npm run release
```

`npm run release` builds the renderer + main process, packages the NSIS
installer (`release/BarangayManagement-Setup-1.5.0.exe`), uploads it to a
GitHub Release **draft** along with `latest.yml` (the file installed apps poll).

4. Go to GitHub → Releases → edit the draft → write what changed in plain
   language (the barangay staff may read it) → **Publish release**.

Installed apps check ~10 seconds after launch. The user sees
"A new version (1.5.0) is available — Update / Later". Nothing is forced.

To build a test installer WITHOUT publishing: `npm run dist:win`.

---

## 3. Making sure existing installs keep working ⚠️

The app you ship must upgrade a database created by ANY older version. The
migration system handles this automatically **if you follow these rules**:

### Database rules
1. **Never edit an existing migration** (the `MIGRATION_001..N` constants in
   `main/database/connection.ts`). They already ran on customer machines —
   editing them does nothing there and breaks fresh installs differently.
2. **Only add new migrations** at the end of the list (`013_...`, `014_...`).
3. **Additive changes only**: `CREATE TABLE`, `ALTER TABLE ... ADD COLUMN`,
   `CREATE INDEX`. Never `DROP TABLE`, never `DROP COLUMN`, never rename —
   old data must survive. If a column is obsolete, just stop using it.
4. New columns must be **nullable or have a DEFAULT** so existing rows stay valid.
5. The app auto-backs up the database to `upgrade-backups/` before applying
   migrations, and refuses to start if a migration fails — so a bad migration
   is recoverable, but don't rely on it.

### Compatibility rules
6. **Don't repurpose settings keys** — old values will be sitting in the
   `settings` table with their old meaning.
7. **Keep template tags working**: `{{fullName}}`, `{{input:...}}`,
   `{{signatory:...}}`, `{{official:...}}`, `{{header}}` are stored inside the
   barangay's own saved templates. Renaming a tag breaks their documents.
8. Old `generated_reports` rows contain finished HTML — they must still render.
9. If you change the Online Mode API, only **add** endpoints/fields.

### Pre-release checklist
- [ ] Version bumped in `package.json`
- [ ] `CHANGELOG.md` updated — [Unreleased] notes moved under the new version + date
- [ ] New migrations are additive and appended at the end of the list
- [ ] **Upgrade test**: install the PREVIOUS release in a Windows VM, add a few
      residents/cases/templates, then install the new build over it. Confirm:
      app opens, data intact, new features work, a certificate prints.
- [ ] **Fresh-install test**: uninstall completely, install the new build,
      run the setup wizard.
- [ ] `npm run dist:win` completed without errors and the installer runs.

### Rolling back a bad release
You can't ship a lower version (apps ignore it). Instead: fix the bug — or
revert the code — bump the version HIGHER again (1.5.0 broken → ship 1.5.1),
and publish. Delete the bad release on GitHub so no one new downloads it.

---

## 4. Setting up a new barangay PC (Windows)

1. Run `BarangayManagement-Setup-<version>.exe` (one-click install, no admin needed).
2. Copy `update-token.txt` into `%APPDATA%\barangay-management\`
   (create the folder if the app hasn't been opened yet, or open the app once first).
3. Open the app, finish the setup wizard, change the default admin password.
4. Done — it will offer updates automatically whenever you publish one.

### Windows notes
- **SmartScreen**: unsigned installers show "Windows protected your PC" →
  More info → Run anyway. To remove this permanently you need a code-signing
  certificate (paid, ~$100+/yr; Azure Trusted Signing is the cheapest route).
  Auto-UPDATES are unaffected — SmartScreen only gates the first manual install.
- The SQLite native module is compiled per-platform at build time; that's why
  Windows installers must be built on Windows.
- Database location on Windows: `%APPDATA%\barangay-management\barangay.db`
  (also where `upgrade-backups/`, `photos/`, `avatars/` live).

---

## 5. How the update flow works (reference)

```
You publish v1.5.0 on GitHub Releases (installer + latest.yml)
        │
Barangay PC opens the app (any version < 1.5.0)
        │  ~10s after launch, electron-updater reads latest.yml
        │  using the token from update-token.txt
        ▼
"Update available" dialog → user clicks Update → downloads in background
        ▼
"Restart Now / Later" → on restart the new version installs
        ▼
First launch of v1.5.0: backs up the DB, applies any new migrations, opens
```

Relevant code: `main/utils/updater.ts` (update checks + token),
`main/database/connection.ts` (migrations + auto-backup),
`electron-builder.yml` (installer + publish config — single source of truth).

---

## 6. Resilience & security on bad internet ⚠️

Barangay internet is often slow or drops out. The update system is built so a bad
connection can **never** produce a half-installed or corrupted app.

### How the app guarantees a complete, correct update

1. **Checksum verification (built in).** Every release publishes a SHA-512 hash of
   the installer inside `latest.yml`. After downloading, the app checks the file
   against that hash. **If even one byte is missing or wrong, the update is
   rejected and never installed** — the barangay keeps running the current version,
   untouched. This is the core guarantee that "all the files needed are there."
2. **Auto-retry / redo on failure.** The download runs in the background while
   staff keep working. If it fails (dropped Wi-Fi, timeout), the app automatically
   retries up to 5 times with an increasing delay, re-fetching what's missing
   until a complete, verified file is ready. The initial update *check* also
   retries a few times if the connection is flaky at startup.
3. **Manual retry if it still fails.** After the auto-retries, the app shows
   *"Update download failed — your internet may be unstable. Nothing was changed.
   Try again / Later."* Choosing **Try again** restarts the download.
4. **Atomic install on restart.** The new version is only applied when the app
   restarts, all at once. There is no in-between state where some files are old
   and some are new. If the user picks **Later**, the verified update installs the
   next time they quit the app (`autoInstallOnAppQuit`).
5. **The database is never touched.** Updates only replace the program files in the
   install folder. The barangay's data lives in a separate app-data folder, so
   even a failed or interrupted update cannot harm it (see §3).

**Net effect:** the worst a bad connection can do is *delay* an update. It can
never break the installed app or its data.

### Security measures

- **Private releases + token.** Only PCs that have your `update-token.txt`
  (Contents: Read-only, see §1) can download updates. Rotate the token yearly or
  if a PC is lost — you can revoke it on GitHub without rebuilding the app.
- **Stable app identity.** The `appId` in `electron-builder.yml` is fixed
  (`ph.barangay.management`). Never change it, or Windows will treat a new release
  as a different app and install it alongside the old one instead of upgrading.
- **Code signing (optional, recommended later).** Installers are currently
  unsigned, so the *first* manual install shows a Windows SmartScreen warning
  (More info → Run anyway). Auto-updates are unaffected. A code-signing
  certificate (paid) removes the warning — Azure Trusted Signing is the cheapest
  route.
- **Token expiry watch-out.** When the read-only token expires (you set ~1 year in
  §1), deployed apps quietly stop receiving updates. Set a calendar reminder to
  rotate it and redistribute `update-token.txt`.

### Quick test you can do yourself

To confirm resilience before a real rollout: start an update download, then turn
off Wi-Fi for ~20 seconds and turn it back on. The download should resume/redo and
finish; the app should still open normally throughout.
