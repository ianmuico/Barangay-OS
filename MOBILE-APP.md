# Barangay Mobile Partner App — Build Spec

Handoff document for building the **phone companion app** to the Barangay
Management System desktop app. Written to be self-contained: a fresh session
(or developer) can build the mobile app from this file alone.

---

## 1. What this app is

A phone app for barangay staff that connects **over the local Wi-Fi network**
to the desktop app's built-in REST API ("Online Mode"). The desktop app is the
single source of truth — it owns the SQLite database. The phone is a remote
client; it holds no authoritative data.

**Core features (v1):**
1. **Connect** to the desktop server (enter/scan server URL + API key, persist them).
2. **Resident lookup**: search by name, browse the paginated list.
3. **QR scanning**: scan a resident's QR card → instantly open their full profile.
4. **CRUD**: view, add, and edit residents from the phone. (Delete is desktop-only by design.)
5. **Dashboard**: barangay stats summary (population, seniors, cases, etc.).

**Good v2 candidates:** officials directory, offline read cache, write queue for
spotty Wi-Fi, photo capture for residents (needs a new server endpoint — see §7).

---

## 2. Architecture & constraints

```
┌─────────────┐   Wi-Fi LAN    ┌──────────────────────────┐
│  Phone app   │ ────────────▶ │ Desktop app (Electron)    │
│  (client)    │  REST + JSON  │  Express on 0.0.0.0:3001  │
└─────────────┘   X-API-Key    │  SQLite (source of truth) │
                               └──────────────────────────┘
```

- **Same network only.** The server binds to the LAN; it is not internet-exposed.
  The app must handle "server unreachable" gracefully (desktop off, different Wi-Fi).
- **Auth** is an `X-API-Key` header on every request (except `/api/health`). There
  are now **two kinds of key** (see §2.1):
  - the **master key** (full access) — for trusted desktop-side integrations, and
  - **per-device keys** issued to each phone — can search + add, but can only EDIT
    records that device created. This is the recommended key type for the app.
- **Rate limit**: 100 requests/minute per device IP → batch and debounce.
- **CORS**: localhost + private-network origins are allowed, but a native app
  (React Native/Expo) sends no Origin header — CORS does not apply to it.
- All responses are JSON. Errors: `{ "error": "message" }` with 4xx/5xx status.

### 2.1 Permission model (per-device keys + provenance)

The desktop admin issues a **device key** per phone/account in
**Settings → Online Mode → Mobile Device Keys** (one-time token, shown once,
format `bmc_...`). Each device uses its own key. The server enforces:

| Action | Master key | Device key |
|---|---|---|
| Search / read residents | ✅ | ✅ |
| Add a new resident | ✅ | ✅ (record is stamped as created by that device) |
| Edit a resident | ✅ any record | ✅ **only records that device created** (others → `403`) |
| Delete a resident | ❌ (desktop only) | ❌ (desktop only) |

So a connected user can browse the whole directory and add people, but **cannot
change records added by other devices or entered on the desktop** — exactly the
"can't update others unless created on the same app/account" rule. The desktop
admin can always correct anything. Each resident row carries `created_via`
(`desktop`/`mobile`) and `created_by_client` (the device's id) for this check;
both are returned on resident objects so the app can show/hide its Edit button.

**Client UX:** after fetching a resident, only show "Edit" when the record is
editable by this device. The simplest signal: try the PUT and handle `403`
gracefully, OR (better) hide Edit unless `resident.created_by_client` matches
this device. The app doesn't know its own client id directly, so the pragmatic
approach is: allow Edit attempts and surface the server's 403 message.

### Recommended stack
- **Expo (React Native)** — fastest path; `expo-camera` for QR scanning,
  `react-native-qrcode-svg` if the app ever needs to display QR codes,
  `@react-native-async-storage/async-storage` for persisting server URL + key.
- Or Flutter — equivalent; nothing on the server is stack-specific.

---

## 3. Connecting (first-run flow)

1. On the desktop: **Settings → Online Mode → toggle the server on.** The screen
   shows the Server URL (e.g. `http://192.168.50.5:3001`).
2. Still on the desktop, under **Mobile Device Keys**, the admin clicks **Issue Key**,
   names the device (e.g. "Kgwd. Maria's phone"), and gets a one-time `bmc_...` token.
3. The phone app's setup screen asks for the **Server URL** + that **device key**.
   Persist them in secure storage.
   - Nice touch: also accept a QR encoding `brgyserver:<url>|<key>` so setup is
     one scan (you'd add that QR to the desktop's Online Mode page later — not built yet).
4. Verify with `GET {url}/api/health` (no key needed):

```json
{ "status": "ok", "version": "1.0.0", "barangay": "Barangay San Isidro", "timestamp": "..." }
```

4. Then verify the key with `GET /api/stats` (401 = wrong key, 503 = key not configured on desktop).

---

## 4. API reference

Base URL: `http://<desktop-ip>:<port>` (default port 3001).
All endpoints except `/api/health` require header `X-API-Key: <key>`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Connectivity check (public). |
| GET | `/api/stats` | Dashboard numbers: residents (total/seniors/youth/indigents/4Ps/male/female/deceased), households, cases by status. |
| GET | `/api/residents` | Paginated list. Query: `search`, `page`, `limit` (max 200), `sortBy`, `sortOrder`, `is_senior=true`, `is_indigent=true`. Returns `{ data, total, page, limit, totalPages }`. |
| GET | `/api/residents/:id` | One resident, all fields. |
| GET | `/api/residents/by-uid/:uid` | **QR resolution** — look up by permanent UID. 404 if no match. |
| POST | `/api/residents` | Create. Required: `first_name`, `last_name`, `birth_date` (YYYY-MM-DD), `gender`, `civil_status`. Returns the created record (201). |
| PUT | `/api/residents/:id` | Partial update — send only changed fields. Returns the updated record. |
| GET | `/api/households` | All households. |
| GET | `/api/officials` | Officials with `name`, `position`; `?active=true` for current only. |
| POST | `/api/presence` | Heartbeat "I'm editing X" — body `{ entity, id, action, sessionId, label }`. Returns `{ others: [...] }` (other live actors on the same record). |
| GET | `/api/presence` | All live activity right now (who is adding/editing what). |

### Concurrency & duplicates (important for multi-device use)

Several phones + the desktop all write to one database, so the API enforces:

**Duplicate guard on create.** `POST /api/residents` rejects an obvious duplicate
(same first name + last name + birth date) with **`409`** and the existing match:
```json
{ "error": "A resident with this name and birth date already exists.",
  "existing": { "id": 1234, "first_name": "...", "last_name": "...", "birth_date": "..." } }
```
Show the user the existing person. If they confirm it's genuinely a different
person, resend the POST with `"force": true`.

**Optimistic locking on edit.** Every resident has a `row_version` (returned on
every resident object). Send it back on `PUT /api/residents/:id`:
```json
{ "occupation": "Farmer", "row_version": 7 }
```
If someone else changed the record first, you get **`409`** with the latest copy:
```json
{ "error": "This record was changed by someone else. Reload before editing.",
  "current": { ...latest resident, "row_version": 8 } }
```
Show "reload", replace your copy with `current`, let the user re-apply. If you
omit `row_version`, the edit goes through unguarded (don't — always send it).

**Presence (so people don't collide).** Before/while editing, POST a heartbeat
every ~10s with a stable per-session `sessionId` (generate one when the edit
screen opens) and a human `label` (the person's name). The response's `others`
array tells you if someone else is already on this record — show a banner like
"Maria is editing this person right now." The desktop dashboard shows the same
live list, so the office can see all activity. Entries auto-expire ~30s after
the last heartbeat, so you don't strictly need to call anything on close.

**Not available over the API (by design):** deleting residents, users/auth,
templates/documents, backups. Those remain desktop-only.

### Resident object (the fields you'll work with)

```jsonc
{
  "id": 123,                      // numeric DB id (changes never, but internal)
  "resident_uid": "8f3a…-…",      // permanent UUID — THE id for QR codes
  "first_name": "Juan", "middle_name": "Dimagiba", "last_name": "Dela Cruz", "suffix": "Jr.",
  "birth_date": "1990-01-15", "age": 36,            // age is computed server-side
  "gender": "Male", "civil_status": "Married",
  "address": "Purok 3", "purok": "3",
  "contact_number": "0917…", "email": null, "occupation": "Farmer",
  "is_indigent": 0, "is_4ps": 0,                    // 0/1 integers
  "voter_status": "Registered", "blood_type": "O+",
  "religion": "Roman Catholic", "citizenship": "Filipino",
  "philsys_card_no": null, "educational_attainment": "High School Graduate",
  "status": "living",                               // or "deceased"
  "partner_id": 124, "mother_id": null, "father_id": null, "household_id": null
}
```

**Writable fields via POST/PUT:** first_name, middle_name, last_name, suffix,
birth_date, gender, civil_status, address, purok, contact_number, email,
occupation, is_indigent, voter_status, blood_type, religion, citizenship,
philsys_card_no, educational_attainment, is_4ps, status, notes.
(Family links — partner/mother/father — are not writable over the API yet.)

---

## 5. QR codes

Every resident has a **permanent unique ID** (`resident_uid`, UUID v4, assigned
at creation and backfilled for all existing residents — it never changes).

**QR payload format:** `brgy:resident:<resident_uid>`
e.g. `brgy:resident:8f3a1c2d-55aa-4e01-9c3b-aa10ffee0001`

The desktop app shows each resident's QR in their profile (Details tab) with a
"Print QR Card" button — that's what staff will print/laminate.

**Scan flow in the phone app:**
1. Scan → payload matches `^brgy:resident:(.+)$` → extract uid.
2. `GET /api/residents/by-uid/<uid>`
   - **200** → show the full resident profile (with an Edit button → PUT).
   - **404** → show "Not found in this barangay's records" with an option to
     **register a new resident** (pre-filling nothing — the uid is generated by
     the server on creation, never by the client).
3. Non-matching QR payloads → "Not a barangay resident code".

---

## 6. Suggested screens

1. **Setup / Settings** — server URL + API key, Test Connection (health + stats), barangay name display.
2. **Home** — barangay name, stats cards from `/api/stats`, big "Scan QR" button.
3. **Scanner** — camera view; on resolve → Resident Profile.
4. **Residents** — search box (debounce ≥300ms), infinite-scroll list (`page`/`limit`), filter chips (Seniors / Indigents).
5. **Resident Profile** — all fields, badges (senior 60+, indigent, 4Ps, deceased), Edit button.
6. **Add / Edit Resident form** — mirror the desktop's form: required first/last name, birth date picker, gender + civil status selects; everything else optional.
7. **Officials** — read-only directory from `/api/officials?active=true`.

UX notes worth copying from the desktop app:
- Dates display as `en-PH` long form ("January 15, 1990"); API uses ISO `YYYY-MM-DD`.
- "Senior" = age ≥ 60, "Youth" = 15–30 unmarried; these are derived, not stored.
- Show a persistent offline banner when health checks fail; queue nothing in v1 — just block writes while offline.

---

## 7. Server work that may be needed later (do on the DESKTOP repo)

These don't exist yet — if a mobile feature needs them, they're added in the
desktop codebase (`main/server/routes/`), not the phone app:

- **Photos**: `GET /api/residents/:id/photo` (serve the file) and a base64 POST for capture.
- **Setup QR** on the Online Mode page encoding `brgyserver:<url>|<key>`.
- **Per-user API tokens / roles** if barangays want per-staff accountability on mobile writes (today all API writes audit-log as "via mobile API").
- **Businesses / cases endpoints** if those features come to mobile.
- **HTTPS / pairing** if a barangay ever wants this off-LAN — do NOT just port-forward the current HTTP server.

## 8. Security ground rules for the phone app

- Store the API key in secure storage (Expo SecureStore / Keychain), not plain AsyncStorage.
- Never log the key; mask it in the settings screen.
- All writes are audit-logged on the desktop; surface failures honestly (400 messages from the API are user-readable).
- The API is LAN-only HTTP — fine for the barangay-hall threat model, but don't add internet sync without revisiting §7's last bullet.

## 9. Quick test (desktop side)

```bash
# from any machine on the same Wi-Fi
curl http://<desktop-ip>:3001/api/health
curl -H "X-API-Key: KEY" http://<desktop-ip>:3001/api/residents?limit=5
curl -H "X-API-Key: KEY" -H "Content-Type: application/json" \
  -X POST http://<desktop-ip>:3001/api/residents \
  -d '{"first_name":"Test","last_name":"Mobile","birth_date":"1995-05-05","gender":"Male","civil_status":"Single"}'
```

Desktop reference code if behavior is unclear:
`main/server/routes/residents.ts` (API), `main/server/middleware/apiKeyAuth.ts`
(auth), `main/database/queries/residents.ts` (validation/fields),
Settings → Online Mode → API Guide tab (live examples with the real URL + key).
