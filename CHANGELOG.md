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

### BIMS-readiness (P2 — full subsystem parity, v1.3.0)

Final wave of DILG LGUSS-BIMS alignment (migration `030`, additive), adding the remaining subsystems
as records modules under a new **Governance** section in the sidebar:

- **Assets & Property (BAMS)** — inventory of barangay-owned property (category, quantity, acquisition
  date/cost, location, condition, custodian).
- **Financial Records (BFMS)** — budget / appropriations / obligations / disbursements / income ledger
  with per-category totals.
- **Development Plan (BDP)** — barangay development projects (sector, budget, funding source, status,
  timeline).
- **GAD Plan & Budget (BGADPBMS)** — Gender-and-Development programs with total vs. GAD-attributed budget
  and accomplishments.
- **Disaster Preparedness (BDRIS)** — hazards, plans, drills, incidents, and response resources.
- **Barangay-Based Institutions (BBI)** — SK, BHW/BNS, Tanod, Lupon, committees, cooperatives, etc.

This brings the app to functional parity with BIMS's subsystem set. *The public **Barangay Website**
subsystem is intentionally out of scope — it is a separate public web deployment, not part of this
offline-first desktop app.*

### Fixed (v1.2.1)

- **Template page-scoping.** Templates seeded before the `pages_json` column existed (Barangay Clearance,
  Business Clearance, KP forms, etc.) defaulted to "visible on every page," so business templates appeared
  on the Deceased page and resident certificates appeared on the Businesses/Cases pages. Migration `029`
  scopes each seeded default to where it belongs — **Business Clearance → Businesses; Sumbong / Pagtawag /
  Minutas → Cases; resident certificates → the person registries + Generator.** Only templates still at the
  default (unset) scope are adjusted, so any template you've already scoped in the Templates page is left
  as-is. You can change any template's pages anytime on the Templates page. (Note: "Certification for Loan"
  is now scoped to the person pages since it certifies a resident; re-add it to Businesses there if you
  prefer.)

### BIMS-readiness (P1 — extended modules, v1.2.0)

Second wave of DILG LGUSS-BIMS alignment (migrations `026`–`028`, additive). Built in verified batches
by face; all printables remain editable templates.

- **Business permits (Face H).** Businesses now track permit number, issue/expiry dates, and fee, with a
  live **valid / expiring / expired** badge in the list.
- **Ordinances & Resolutions — BORIS (Face F).** New **Ordinances & Resolutions** page: a repository of
  barangay ordinances, resolutions, and executive orders (type, reference no., date, author, status, full
  text) with search, type filter, and print/PDF (letterhead-wrapped).
- **Graphing (Face I).** The **Reports** page adds a **population pyramid** (age × sex) and a **12-month
  new-resident trend line** (recharts), plus **Excel (.xlsx) export** of the RBI Form C counts.
- **Blotter & VAW Desk (Face G).** New **Blotter** page: an incident/complaint registry with auto entry
  numbers, and a dedicated **VAWC** category that serves as the VAW desk view. Also fixed the
  `case_number` generator to use max-suffix+1 (no collisions after deletion) and added `nature` /
  `kp_stage` fields to cases (backend-ready).
  - *Deferred to a focused follow-up (needs a live run against the cases module):* the full three-stage KP
    lifecycle UI, Pangkat panel roster, and non-resident case parties. The KP forms (Certificate to File
    Action, Amicable Settlement) already shipped in P0.

### BIMS-readiness (P0 — DILG LGUSS-BIMS alignment)

This app now explicitly references and aligns with the Philippine DILG **LGUSS-BIMS**
(Barangay Information Management System, `bims.dilg.gov.ph`). BIMS is free, government-hosted,
online-only, and mandatory (DILG MC 2025-104). Our product is positioned as an **offline-first,
one-stop barangay input area**: a barangay works locally (fast, no internet required), and its
data can be **exported from our app and uploaded into DILG BIMS**. Because DILG offers no
third-party API, the sanctioned bridge is a prescribed-Excel-template export. This makes the app
a reusable product that can be sold to many barangays / LGUs. Roadmap: [BIMS-READINESS-PLAN.md](BIMS-READINESS-PLAN.md).

Built in verified batches, grouped by "face" (migrations `020`–`025`, all additive; existing records,
templates, and features are unaffected). All new printables are **editable templates** on the Templates
page using `{{variables}}` — never hard-coded.

- **Face A — Residents / RBI fields.**
  - Place of birth (`{{birthPlace}}`).
  - Sectoral tags: **Solo Parent (RA 8972), Out-of-School Youth, OFW, Indigenous Person + ethnicity**,
    plus **labor-force status**, **residency status/date**, and **structured PWD** (disability type +
    PWD ID no.). All available as template variables.
  - New sectoral registry pages (Solo Parents, OSY, OFW, Indigenous People) with search, filter, and
    print, mirroring the existing PWD/4Ps registries.
- **Face B — Households (RBI Form A).** New **Households** page: create households, assign members, set
  the household head and each member's relationship to head, and print a household roster. Residents can
  be assigned to a household from the resident form.
- **Face C — Issuance.** Automatic **certificate control numbers** (`{{controlNumber}}`, per-year
  sequence, allocated only for templates that use the variable) recorded in an **issuance register**
  (Saved Documents now shows the control number and supports **Void** instead of only delete). Seeded
  editable KP templates: **Certificate to File Action** and **Amicable Settlement (KP Form 16)**.
- **Face D — Reports.** New **Reports** page generating the statutory **RBI Form C (Semestral Summary)**;
  counts are injected into an editable template as `{{count:*}}` variables, then printed or exported to PDF.
- **Face E — Export to BIMS.** New **Export to BIMS** page: a dry-run data check (flags residents missing
  BIMS-required fields) and a one-click **RBI-aligned `.xlsx` export** for manual upload into DILG BIMS.
  The column mapping lives in one file (`main/utils/bimsTemplate.ts`) to reconcile with the barangay's
  official DILG template.

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
