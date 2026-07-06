# Changelog

All notable changes to the Barangay Management System are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
(`MAJOR.MINOR.PATCH`).

> **The `version` in [package.json](package.json) is the single source of truth.**
> It is what `electron-updater` compares to decide whether an installed app
> should update. On every release, move the notes under `[Unreleased]` into a new
> `## [x.y.z] - YYYY-MM-DD` section and bump `package.json` to the same number.
> Full routine: [RELEASING.md](RELEASING.md).

## [Unreleased]

### Changed
- Consolidated the duplicate electron-builder configuration into a single
  [electron-builder.yml](electron-builder.yml) and removed the conflicting
  `build` block from `package.json`, so the two can no longer disagree. The app
  `appId` is now fixed at `ph.barangay.management` and must not change across
  releases (it is the identity Windows uses to apply updates in place).

### Added
- **AI Assistant (optional)** — drafts certificate/document templates from a
  plain-language description, using the correct `{{placeholders}}`. Works with any
  OpenAI-compatible provider (Google Gemini free tier, Groq, OpenRouter, or local
  Ollama), configured in **Settings → AI Assistant**. Only placeholder tokens and
  the instruction are sent — never resident data. Runs on low-spec laptops because
  hosted providers do the compute. See [AI-SETUP.md](AI-SETUP.md).
- **Local-AI lag protection** — when a local model (Ollama) is used, the app
  monitors response time, main-process event-loop delay, and free memory; if it
  detects the computer is lagging it aborts the request and automatically turns
  the AI Assistant off to protect performance. Hosted providers are unaffected.
- **Update resilience** — the auto-updater now retries the download on flaky
  internet (with backoff), surfaces a clear "try again" prompt if it still fails,
  and relies on electron-updater's SHA-512 verification so a partial/corrupt
  download is never installed. See the resilience section in [RELEASING.md](RELEASING.md).
- This `CHANGELOG.md` to track versions over time.

## [1.0.0] - 2026-06-24

Initial release — an offline-first desktop app (Electron + Next.js + local
SQLite) for Philippine barangays.

### Added
- **Resident registry** — RBI Form 8 fields, households, family/spouse links,
  photos, and a permanent per-resident UID with QR codes.
- **Certificate & document editor** — rich-text template editor using
  `{{variable}}`, `{{input:...}}`, and `{{signatory:...}}` tokens, with prebuilt
  Philippine templates (Barangay Clearance, Certificate of Residency, Indigency,
  Business Clearance, First-Time Jobseekers RA 11261, OSY, 4Ps) and Bisaya
  Katarungang Pambarangay forms.
- **Barangay cases / Katarungang Pambarangay** — complaints, multi-party cases,
  summons, mediation minutes, and resident issue flags.
- **Businesses** — registry with both resident and outside owners.
- **Officials & signatories** — auto-filled into generated documents.
- **CSV import** with batch rollback.
- **Backup & restore** of the local database.
- **LAN / mobile companion API** — opt-in read-only API for the mobile app.
- **Security** — role-based access (admin/staff), forced password change off the
  default, audit log, recovery-code password reset, and PWD (RA 10754) support.
- **Auto-update** over the internet via private GitHub Releases.
- **Localization** — English, Filipino, and Bisaya.

[Unreleased]: https://github.com/mmmsss211/barangay-management/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/mmmsss211/barangay-management/releases/tag/v1.0.0
