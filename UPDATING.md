# Pushing Updates — Quick Reference

This project ships as **two apps** with **two independent update channels**:

| App | How it updates | Cost | Who triggers |
|-----|----------------|------|--------------|
| **Desktop** (Electron) | GitHub Releases + `electron-updater` | Free | App auto-checks on launch; user clicks *Update* |
| **Mobile** (Expo) | EAS Update (OTA) / new APK build | Free tier | Downloads on launch, or *Account → Check for Updates* |

Neither update ever touches barangay **data** — the SQLite database lives in the
app-data folder on the desktop PC, and the phone is only a client.

Detailed guides: **desktop → [RELEASING.md](RELEASING.md)**,
**mobile → [mobile/OTA-UPDATES.md](mobile/OTA-UPDATES.md)**.

---

## Desktop app — push an update (Windows + Mac, automatic)

Pushing a **version tag** makes GitHub build BOTH the Windows and Mac installers in
the cloud and publish them to a GitHub Release. You don't build anything yourself
and you don't need a personal token — GitHub Actions handles it
(`.github/workflows/release.yml`).

**The whole flow — edit → push → done:**

```bash
# 1. Edit files (locally in your editor, or on github.com with the pencil ✏️ button).

# 2. Bump the version in package.json — this is what triggers the update.
#    "version": "1.0.0"  ->  "1.1.0"     (must be HIGHER than what's installed)
#    Also move CHANGELOG.md [Unreleased] notes under "## [1.1.0] - YYYY-MM-DD".

# 3. Commit and push, then create the matching version tag:
git add -A
git commit -m "Release 1.1.0"
git push
git tag v1.1.0
git push origin v1.1.0        # ⟵ THIS launches the build
```

Then watch **GitHub → Actions**: two jobs (Windows + macOS) build and publish to a
Release named **v1.1.0** — the `.exe` + `latest.yml` and the `.dmg` + `.zip` +
`latest-mac.yml`. That's it.

- **Installed Windows PCs**: silent auto-update — they see "Update / Later" ~10 s
  after launch, download in the background, install on restart.
- **Installed Macs**: show "A new version is available → Download", which opens the
  release page. Drag the new app into Applications, replacing the old one. **Data is
  preserved** — the database lives outside the app, so the update only replaces the
  software. (Silent Mac auto-update would need a paid Apple Developer ID; not used.)

**Prefer clicking?** On github.com: bump the version in package.json (✏️ → Commit),
then **Releases → Draft a new release → choose a new tag `v1.1.0` → Publish**.
Creating the tag triggers the same build.

- **Test a build locally without publishing:** `npm run dist:win` (on Windows) or
  `npm run dist:mac` (on a Mac).
- **Check what's live:** GitHub → Releases (top published release = what devices see);
  GitHub → Actions shows the build status.
- **Roll back a bad release:** you can't ship a *lower* version — fix it, bump
  *higher* (1.1.0 → 1.1.1), push the new tag, and delete the bad release on GitHub.
- **Before shipping DB changes:** follow the additive-migration checklist in
  [RELEASING.md](RELEASING.md) §3 so existing installs keep their data.

> **Private-repo notes.** Installed apps still need the read-only `update-token.txt`
> to *download* updates (one-time per PC — see [RELEASING.md](RELEASING.md) §1). A
> personal read/write token is only needed if you ever build locally with
> `npm run release`; the automated workflow above uses GitHub's own token.
> macOS runner minutes on a private repo count against your free CI quota — fine for
> the occasional release.

---

## Mobile app — push an update

**Decide first: OTA or new build?**

| Change you made | How to ship it |
|-----------------|----------------|
| JS/TS only — screens, styling, logic, API calls, bug fixes | **OTA** (`eas update`) — instant, no reinstall |
| Native — new package, `app.json` plugin/permission change, Expo SDK upgrade | **New APK** (`eas build`) + bump `version` in `app.json` |

### Everyday case — OTA (JavaScript changes)

```bash
cd mobile
eas update --branch preview --message "Describe the change"
```

Phones apply it on next open (downloads in background, applies on the following
restart) or immediately via **Account → Check for Updates → Restart now**.

`runtimeVersion` is pinned to the app version, so an OTA published from `1.0.0`
only reaches phones running the `1.0.0` build — an incompatible phone simply keeps
working and never receives it.

### Native change — rebuild the APK

```bash
cd mobile
# bump "version" in app.json first (e.g. 1.0.0 -> 1.1.0)
eas build --platform android --profile preview   # cloud build → APK link → reinstall on phones
```

### Check update status

```bash
cd mobile
eas update:list --branch preview     # history of pushed OTA updates
```

In-app: **Account → App updates** shows the running version
(`v1.0.0 · embedded` → `· OTA <id>` after an OTA lands).

- **Roll back:** `eas update:republish` a previous update, or just `eas update`
  again with the fix.
- **Expo Go / `npx expo start` ignore OTA** — OTA only applies to built APKs; in
  dev the Account card shows "dev".

**One-time setup** (once ever, needs a free expo.dev account):

```bash
npm install -g eas-cli
cd mobile
eas login
eas init                # links the app, writes projectId
eas update:configure    # writes the update URL + channels into app.json
git add -A && git commit -m "Configure EAS Update"
```

Until this is done, `eas update`/`eas build` won't work. See
[mobile/OTA-UPDATES.md](mobile/OTA-UPDATES.md).

---

## Cheat sheet

```bash
# DESKTOP — release Windows + Mac automatically (bump package.json version first)
git commit -am "Release 1.1.0" && git push
git tag v1.1.0 && git push origin v1.1.0     # → GitHub Actions builds + publishes both

# MOBILE — push a JS change to phones already installed
cd mobile && eas update --branch preview --message "what changed"

# MOBILE — ship a native/SDK change (reinstall required)
cd mobile && eas build --platform android --profile preview   # bump app.json version first
```
