# Barangay Mobile (Expo)

The phone companion app for the Barangay Management System desktop app. It
connects over the local Wi‑Fi to the desktop's **Online Mode** API and lets
staff search, view, add, edit, and (with permission) delete residents.

Part of the monorepo — lives in `mobile/` alongside the desktop app at the repo root.

## Run it

```bash
cd mobile
npm install
npx expo start
```

Then press `a` (Android emulator), `i` (iOS simulator), or scan the QR with the
**Expo Go** app on a real phone. The phone must be on the **same Wi‑Fi** as the
desktop running the system.

> Requires the desktop app's **Online Mode server to be ON**
> (desktop → Settings → Online Mode → toggle on).

## First run (3 steps)

1. **Connect** — enter the desktop's **Wi-Fi URL** (shown on the desktop's
   Online Mode page, e.g. `http://192.168.1.5:3001`), optionally the
   **Internet URL** (if the admin turned on *Internet Access* on that same
   page — lets the app work away from the office), and a **Device Key**.
   The admin issues a device key on the desktop: *Settings → Online Mode →
   Mobile Device Keys → Issue Key* (shown once). The app automatically uses
   whichever address is reachable — Wi-Fi first, internet as fallback.
2. **Sign in** — with a mobile **username + password** the admin created in
   *Settings → Mobile App Users*.
3. You land on the **Residents** list. What you can do depends on your **role**.

## Roles & permissions

Roles are created by the admin on the desktop (*Settings → Mobile App Users →
Roles*) and grant any combination of:

- **Search** — use the search box
- **Read** — open the list and view a resident
- **Create / Edit** — add new residents and edit existing ones
- **Delete** — remove residents

The UI hides actions you don't have (e.g. a read-only "Purok Leader" sees the
list but no Add/Edit/Delete buttons), and the server enforces the same rules, so
permissions can't be bypassed by the client.

## Features

- Resident search + infinite-scroll list
- Resident profile view
- Add / edit resident (validated; duplicate + concurrent-edit handling)
- Delete (with permission)
- **QR scan** — scan a resident's printed QR card to jump straight to them
- Account screen — your role/permissions, log out, disconnect device

## How it talks to the desktop

- `X-API-Key`  — the device key (server-level access)
- `X-User-Token` — the logged-in user's session (drives permissions)

See `../MOBILE-APP.md` for the full API contract (endpoints, duplicate `409`
handling, optimistic-locking `row_version`, presence heartbeats).

## Over-the-air updates

The app supports OTA updates via EAS Update — push UI/logic changes to
installed phones without reinstalling. See [OTA-UPDATES.md](OTA-UPDATES.md)
for the one-time setup and the `eas update` flow. Users can also pull updates
manually via **Account → Check for Updates**.

## Project layout

```
mobile/
  app/                       # expo-router screens
    _layout.tsx              # providers + nav
    index.tsx                # setup→login→app gate
    setup.tsx                # server URL + device key
    login.tsx                # user sign-in
    (app)/
      _layout.tsx            # tabs (Residents / Account)
      residents/index.tsx    # search + list (+ FAB if can create)
      residents/[id].tsx     # profile (Edit/Delete by permission)
      residents/new.tsx
      residents/edit/[id].tsx
      scan.tsx               # QR scanner
      settings.tsx           # account / logout / disconnect
  src/
    api.ts                   # REST client (device key + user token)
    auth.tsx                 # session + permissions + secure storage
    ResidentForm.tsx         # shared create/edit form
    ui.tsx, theme.ts, types.ts
```

## Notes

- Secrets (device key, session token) are kept in `expo-secure-store`.
- The app is LAN/HTTP only — `usesCleartextTraffic`/ATS exceptions are enabled
  for that. Do not point it at an internet-exposed server over plain HTTP.
