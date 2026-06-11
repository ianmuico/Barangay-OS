# Releasing Updates Over the Internet

How to ship a new version of the Barangay Management System to barangays that
already have it installed — safely, for free, using GitHub Releases. Installed
apps check GitHub on startup, ask the user to update, download in the
background, and install on restart. **The barangay's database is never touched
by an update** — it lives in the app data folder, outside the installed app.

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
`package.json` → `"build"` (installer + publish config).
