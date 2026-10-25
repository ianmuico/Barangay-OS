# Releasing Updates Over the Internet

> **Easiest path (recommended): push a version tag and let GitHub build both
> Windows and Mac for you.** See [UPDATING.md](UPDATING.md) — the automated
> workflow in `.github/workflows/release.yml` needs no personal token and no local
> build — it is the only publishing path (local builds, §1c/§2, are for testing).
> Do the one-time signing-key setup in §1b first, and §3 (database safety) applies
> to **every** release.

How to ship a new version of the Barangay Management System to barangays that
already have it installed — safely, for free, using GitHub Releases. Installed
apps check GitHub on startup, ask the user to update, download in the
background, and install on restart. **The barangay's database is never touched
by an update** — it lives in the app data folder, outside the installed app.

**Windows and Mac** both get in-app auto-update (download in the background,
install on restart). The Mac build stays unsigned (to stay free) — Tauri can still
update it in place from the signed `.app.tar.gz` bundle. If that ever fails on a
Mac, the app falls back to opening the download page — installing the new `.dmg`
over the old app keeps all data, since the database lives outside the app.

---

## 1. One-time setup (do this once)

### a. GitHub token (only if the repo is private)
`ianmuico/Barangay-OS` is currently **public**, so installed apps read
releases without any token — skip this step. If you ever make the repo
private, installed apps need a token to read its releases:

1. GitHub → Settings → Developer settings → **Fine-grained personal access tokens** → Generate new token.
2. Repository access: **only** `barangay-management`. Permissions: **Contents: Read-only**. Expiration: 1 year (set a calendar reminder to rotate it).
3. Save the token text into a file named **`update-token.txt`** — you will copy this file to each barangay PC (see §4). The app looks for it in:
   - the app's `resources` folder (e.g. `C:\Users\<user>\AppData\Local\Barangay Management System\resources\update-token.txt`), or
   - the app data folder (`%APPDATA%\barangay-management\update-token.txt` on Windows,
     `~/Library/Application Support/barangay-management/update-token.txt` on Mac).
     **Prefer this one** — an update replaces the install folder (and the whole
     `.app` on Mac), so a token in `resources` can be wiped by the next update.
   - (For testing, a `GH_TOKEN` environment variable also works.)

> Why a file and not baked into the app? You can rotate or revoke a leaked
> token per-PC without rebuilding the app.

### b. Update signing key (once, keep it forever)
Tauri refuses to install an update that isn't signed with YOUR key. Generate the
key pair once, on your own computer:

```bash
npx tauri signer generate -w ~/.tauri/barangay-management.key
```

It asks for a password and writes two files:
- `barangay-management.key` — the **private** key. Never commit it.
- `barangay-management.key.pub` — the **public** key.

Then:
1. Paste the **contents** of the `.pub` file into `src-tauri/tauri.conf.json` →
   `plugins.updater.pubkey` (replacing `REPLACE_WITH_TAURI_SIGNER_PUBLIC_KEY`), and
   commit that. Every build ships with it baked in.
2. GitHub → repo → Settings → Secrets and variables → **Actions** → add:
   - `TAURI_SIGNING_PRIVATE_KEY` = the **contents** of the private key file
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` = the password you chose
3. **Back up the private key + password** somewhere safe (password manager).

> ⚠️ If you lose the private key, installed apps can never accept another update —
> every PC would need a manual reinstall with a build carrying a new public key.
> Don't regenerate it "just because"; only the original key matches deployed apps.

No personal read/write GitHub token is needed to publish: the workflow uses
GitHub's own token.

### c. Build machine (only for local test builds)
The GitHub workflow builds everything, so you normally don't need one. To build
locally: Windows installers must be built **on Windows** (a Windows PC or VM), Mac
builds on a Mac. Install Node.js 20 LTS and Rust (https://rustup.rs), then in the
project folder: `npm install && npm install --prefix renderer`
(SQLite is compiled into the app itself — there is no native-module rebuild step).

---

## 2. Releasing a new version — the routine

```powershell
# 1. Bump the version in package.json — THIS IS WHAT TRIGGERS THE UPDATE.
#    "version": "1.4.0"  ->  "1.5.0"
#    Installed apps update only when the release version is HIGHER than theirs.

# 1b. Update CHANGELOG.md — move the [Unreleased] notes under a new
#     "## [1.5.0] - YYYY-MM-DD" heading so every shipped version is tracked.

# 2. Run the pre-release safety checklist (see §3). Seriously.

# 3. Commit, push, then tag — the tag MUST match package.json's version:
git tag v1.5.0
git push origin v1.5.0        # ⟵ this launches .github/workflows/release.yml
```

The workflow builds the renderer + Rust app on Windows and macOS, signs the
update bundles with your key (§1b), and uploads to the GitHub Release `v1.5.0`:
the NSIS installer (`…_1.5.0_x64-setup.exe`), the Mac `.dmg` + `.app.tar.gz`,
their `.sig` signatures, and `latest.json` (the file installed apps poll).
The release is published as soon as the first job starts, and apps only see the
update once `latest.json` is uploaded.

4. Go to GitHub → Releases → edit `v1.5.0` → write what changed in plain
   language (the barangay staff may read it) → **Update release**.

Installed apps check ~10 seconds after launch. The user sees
"A new version (1.5.0) is available — Update / Later". Nothing is forced.

To build a test installer WITHOUT publishing: `npm run build` (output in
`src-tauri/target/release/bundle/`). Because update bundles are signed, set the
key first or the build fails at the signing step:
`$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content ~/.tauri/barangay-management.key -Raw`
(plus `$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD`).

---

## 3. Making sure existing installs keep working ⚠️

The app you ship must upgrade a database created by ANY older version. The
migration system handles this automatically **if you follow these rules**:

### Database rules
1. **Never edit an existing migration** (the `src-tauri/src/db/sql/0xx_*.sql`
   files listed in `src-tauri/src/db/migrations.rs`). They already ran on customer machines —
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
- [ ] The release workflow finished green for **both** Windows and macOS, the
      installer runs, and the release has a `latest.json` listing both platforms.

### Rolling back a bad release
You can't ship a lower version (apps ignore it). Instead: fix the bug — or
revert the code — bump the version HIGHER again (1.5.0 broken → ship 1.5.1),
and publish. Delete the bad release on GitHub so no one new downloads it.

---

## 4. Setting up a new barangay PC (Windows)

1. Run `Barangay.Management.System_<version>_x64-setup.exe` (per-user install, no admin needed).
2. Copy `update-token.txt` into `%APPDATA%\barangay-management\`
   (create the folder if the app hasn't been opened yet, or open the app once first).
3. Open the app, finish the setup wizard, change the default admin password.
4. Done — it will offer updates automatically whenever you publish one.

### Windows notes
- **SmartScreen**: unsigned installers show "Windows protected your PC" →
  More info → Run anyway. To remove this permanently you need a code-signing
  certificate (paid, ~$100+/yr; Azure Trusted Signing is the cheapest route).
  Auto-UPDATES are unaffected — SmartScreen only gates the first manual install.
- The app is native code compiled per-platform; that's why the workflow builds
  Windows installers on a Windows runner.
- Database location on Windows: `%APPDATA%\barangay-management\barangay.db`
  (also where `upgrade-backups/`, `photos/`, `avatars/` live).

---

## 5. How the update flow works (reference)

```
You push tag v1.5.0 → the workflow publishes installers + .sig + latest.json
        │
Barangay PC opens the app (any version < 1.5.0)
        │  ~10s after launch, the updater asks the GitHub API for the latest
        │  release (with the token from update-token.txt) and reads latest.json
        ▼
"Update available" dialog → user clicks Update → downloads in background
        │  the download is checked against its signature (your public key)
        ▼
"Restart Now / Later" → on restart the new version installs
        ▼
First launch of v1.5.0: backs up the DB, applies any new migrations, opens
```

Relevant code: `src-tauri/src/ipc/updater.rs` (update checks + token),
`src-tauri/src/db/migrations.rs` (migrations + auto-backup),
`src-tauri/tauri.conf.json` (installer config + `plugins.updater` pubkey/endpoint),
`.github/workflows/release.yml` (build + publish).

---

## 6. Resilience & security on bad internet ⚠️

Barangay internet is often slow or drops out. The update system is built so a bad
connection can **never** produce a half-installed or corrupted app.

### How the app guarantees a complete, correct update

1. **Signature verification (built in).** Every release publishes a signature of
   each update bundle inside `latest.json`, made with your private key (§1b). After
   downloading, the app checks the file against that signature and the public key
   built into the app. **If even one byte is missing, wrong, or tampered with, the
   update is rejected and never installed** — the barangay keeps running the current
   version, untouched. This is the core guarantee that "all the files needed are there."
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
   next time they quit the app.
5. **The database is never touched.** Updates only replace the program files in the
   install folder. The barangay's data lives in a separate app-data folder, so
   even a failed or interrupted update cannot harm it (see §3).

**Net effect:** the worst a bad connection can do is *delay* an update. It can
never break the installed app or its data.

### Security measures

- **Private releases + token.** Only PCs that have your `update-token.txt`
  (Contents: Read-only, see §1) can download updates. Rotate the token yearly or
  if a PC is lost — you can revoke it on GitHub without rebuilding the app.
- **Signed updates.** Only bundles signed with your private key (kept in GitHub
  Secrets, §1b) are accepted, so even someone with write access to the release
  can't push a fake update without the key.
- **Stable app identity.** The `identifier` (`ph.barangay.management`) and
  `productName` in `src-tauri/tauri.conf.json` are fixed. Never change them, or
  Windows will treat a new release as a different app and install it alongside the
  old one instead of upgrading.
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
