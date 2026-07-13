# Barangay Management System

An **offline-first desktop application** for Philippine barangay operations: resident and
household records, certificates and clearances, Katarungang Pambarangay (KP) cases, business
registration, officials, and a live demographics dashboard. Built with Electron + Next.js 14 +
SQLite (`better-sqlite3`), with an optional LAN "Online Mode" and an Expo phone companion app.

> **Runs fully offline.** No internet or external server is required for day-to-day work. The
> local SQLite database is the single source of truth.

## Relationship to DILG BIMS (LGUSS-BIMS)

This product references and aligns with the Philippine DILG **LGUSS-BIMS** — the Barangay
Information Management System at [`bims.dilg.gov.ph`](https://bims.dilg.gov.ph). BIMS is free,
government-hosted, **online-only**, and mandatory for all barangays under DILG Memorandum
Circular 2025-104.

Our app is positioned as an **offline-first, one-stop input area** that complements BIMS rather
than competing with it:

- Barangays encode and manage their records **locally and fast**, even with no or poor internet.
- That data can then be **exported from our app and uploaded into DILG BIMS**. DILG offers no
  third-party API, so the sanctioned bridge is a **prescribed Excel-template export** (a staffer
  uploads the file into BIMS).
- Because every barangay faces the same BIMS mandate and the same connectivity gap, this is a
  **reusable product that can be sold to many barangays / LGUs** as their local staging system.

The alignment roadmap (RBI fields, RBI Form C, the BIMS export bridge, and more) is tracked in
[BIMS-READINESS-PLAN.md](BIMS-READINESS-PLAN.md).

## Features

- **Residents & sectoral registries** — full RBI profiles (PhilSys card no., place of birth, and
  sectoral tags: senior, youth, PWD w/ disability type + ID, 4Ps, indigent, **solo parent, OSY, OFW,
  indigenous people + ethnicity**), each with its own registry view; family tree; per-resident QR ID.
- **Households (RBI Form A)** — household records with head, member relationships, and printable roster.
- **Certificates & documents** — a WYSIWYG **Templates** engine. Every printable is an editable
  template using `{{variables}}` (resident, barangay, date, `{{signatory:role}}`, `{{input:...}}`,
  `{{controlNumber}}`), changeable anytime without a code change. Automatic **certificate control
  numbers** and an **issuance register** (with void).
- **Katarungang Pambarangay** — cases, parties, summons/hearings timeline, and KP documents including
  editable **Certificate to File Action** and **Amicable Settlement (KP-16)** templates.
- **Blotter & VAW Desk** — incident/complaint registry with auto entry numbers and a dedicated VAWC view.
- **Ordinances & Resolutions (BORIS)** — repository of ordinances, resolutions, and executive orders.
- **Businesses & officials** — business registration with multiple owners and **permit validity/renewal**
  tracking; officials directory that auto-fills document signatures.
- **Governance modules** — **Assets & property (BAMS)**, **financial records (BFMS)**, **development plan
  (BDP)**, **GAD plan & budget (BGADPBMS)**, **disaster preparedness (BDRIS)**, and **barangay-based
  institutions (BBI)**.
- **Reports & analytics** — the statutory **RBI Form C** (PDF or Excel), a **population pyramid**, and a
  new-resident **trend line**, plus the demographic **dashboard**.
- **Export to BIMS** — one-click RBI-aligned Excel export for manual upload into DILG BIMS (see above).
- **Data tools** — CSV/Excel import with rollback, backup/restore, and audit logging.

## Getting started

Prerequisites and full local-run instructions are in **[RUNNING.md](RUNNING.md)**. In short:

```bash
npm install      # postinstall recompiles better-sqlite3 for Electron
npm run dev      # Next.js (renderer) + Electron (main)
```

Build installers with `npm run dist` (see [RELEASING.md](RELEASING.md)); auto-update is documented
in [UPDATING.md](UPDATING.md).

## Settings guide

Open **Settings** in the app sidebar:

- **Barangay** — barangay name, address, municipality/province, and logo. These populate the
  document letterhead (`{{header}}`) and certificate variables.
- **Online Mode** — turn on the built-in LAN REST server so the phone app (and other devices on
  the same Wi-Fi) can connect. Shows the server URL/port and lets you manage the master API key
  and an optional internet tunnel. Leave **off** to stay fully offline.
- **Mobile App Users** — create app users and roles (search / read / create / delete permissions)
  and issue **per-device keys** for phones. Passwords are stored reversibly so an admin can reveal
  them. A global toggle can disable all phone logins.
- **Users** — desktop login accounts (admin / staff), with password reset via recovery codes.
- **AI Assistant** *(optional)* — connect an OpenAI-compatible provider to draft document
  templates. Only placeholder tokens are sent, never resident data. See [AI-SETUP.md](AI-SETUP.md).
- **Backup** — back up and restore the whole database, and view storage stats.
- **Notifications** — in-app reminders (e.g. upcoming summons/hearings).

## Phone companion app

The Expo/React Native app in [`mobile/`](mobile/) is a **thin LAN client** for barangay staff.
Full build/run spec is in **[MOBILE-APP.md](MOBILE-APP.md)**. To use it:

1. On the desktop app, go to **Settings → Online Mode** and turn it on (note the server URL/port,
   default `:3001`). The phone must be on the **same Wi-Fi network**.
2. In **Settings → Mobile App Users**, create a user/role and issue a **per-device key**.
3. In the phone app, enter or **scan** the server URL + device key to connect.
4. Search residents, scan a resident's **QR card** to open their profile, view the stats
   dashboard, and add/edit residents. (Deletes are desktop-only by design.)

The desktop app remains the single source of truth; the phone holds no authoritative data.

## Documentation

| Doc | What it covers |
|-----|----------------|
| [RUNNING.md](RUNNING.md) | Prerequisites and running locally |
| [RELEASING.md](RELEASING.md) | Building and publishing releases |
| [UPDATING.md](UPDATING.md) | Auto-update mechanism |
| [MOBILE-APP.md](MOBILE-APP.md) | Phone companion app spec |
| [AI-SETUP.md](AI-SETUP.md) | Optional AI template assistant |
| [BIMS-READINESS-PLAN.md](BIMS-READINESS-PLAN.md) | DILG BIMS alignment roadmap |
| [CHANGELOG.md](CHANGELOG.md) | Version history |

## Tech stack

Electron · Next.js 14 (React 18, Tailwind) · better-sqlite3 · Express (Online Mode) · Expo (mobile).
The `version` in [package.json](package.json) is the single source of truth for releases.
