# BIMS-Readiness Implementation Plan

**Status:** ✅ P0 implemented (v1.1.0) — built in verified batches by face; see [CHANGELOG.md](CHANGELOG.md).
P1/P2 remain proposed.
**Date:** 2026-07-11
**Companion doc:** the gap-assessment report (feature-by-feature comparison vs DILG LGUSS-BIMS)

## Goal

Turn our offline-first app into the **BIMS-ready staging tool**: a barangay works locally
(offline, fast), and its data maps cleanly onto DILG's LGUSS-BIMS so it can be exported and
uploaded. We complement the government mandate instead of competing with it.

Four principles govern every task below:

1. **Offline-first stays sacred.** No feature may require internet. This is our only durable moat
   (BIMS is online-only; DILG makes each barangay self-fund PC + internet).
2. **Schema aligns to BIMS.** New fields/tables use DILG's RBI / sub-system vocabulary so a later
   export is a 1:1 mapping, not a translation.
3. **Additive migrations only.** Follow the existing pattern in `main/database/connection.ts`:
   next migration is `020_*.sql` (constant `MIGRATION_020`), registered in the migrations array,
   auto-backed-up before it runs. Prefer `ALTER TABLE ADD COLUMN` / `CREATE TABLE`; avoid rebuilds.
4. **Printables are editable templates, never hard-coded.** Every new certificate, form, or printable
   document is seeded as a row in `report_templates` (via the migration) and edited by the user on the
   **Templates page**, using `{{variables}}` wherever possible. No new printable is built as hard-coded
   HTML in code. This mirrors how the seeded Barangay Clearance / Sumbong / Pagtawag templates already
   work, so the user can change wording, layout, and paper at any time without a code change.

---

## Migration & wiring pattern (reference for every task)

A new data field or table follows the same five touch-points every time:

1. **Migration** — add `MIGRATION_020` string in `connection.ts` and register `{ name: '020_*.sql', sql: MIGRATION_020 }` in the array (~line 153-171).
2. **Query module** — `main/database/queries/*.ts` (add columns to SELECT/INSERT/UPDATE allow-lists).
3. **IPC handler** — `main/ipc/database.ts` (expose new operations).
4. **Preload/type** — `main/preload.ts` + renderer `lib/` API wrapper.
5. **UI** — renderer route under `renderer/app/(authenticated)/…`.

> ⚠️ `residents.gender` is a hard `CHECK (Male|Female)`. RBI uses "sex" (M/F) too, so **leave it as-is** —
> changing a CHECK needs a full table rebuild and buys nothing for BIMS alignment.

### Printables use editable templates (verified against current code)

Every printable in the app is a `report_templates` row (name, `content_html`, `variables_json`,
`paper_json`, `pages_json`), seeded with `INSERT OR IGNORE` in a migration and editable on the
Templates page with the TipTap editor. New printables follow this, not hard-coded HTML.

Variables available to a template today (`resolveVariables`, `main/ipc/reports.ts:148`):

- **Resident:** `{{fullName}}`, `{{age}}`, `{{civilStatus}}`, `{{purok}}`, `{{address}}`,
  `{{philsysCardNo}}`, `{{educationalAttainment}}`, `{{partnerName}}`, … (add new P0 fields here too).
- **Barangay / Date:** `{{barangay}}`, `{{municipality}}`, `{{province}}`, `{{date}}`, `{{year}}`.
- **Letterhead:** `{{header}}` (auto letterhead from Settings → Barangay).
- **Fill-in:** `{{input:fieldName}}` — prompted at generation (e.g. `{{input:purpose}}`).
- **Officials:** `{{signatory:role}}` (signature block) and `{{official:role}}` (inline name),
  resolved live against the officials list.

**Rule for new printables:** seed the document as a template using the variables above; add any
missing dynamic value as either a resolver variable (preferred, auto-filled) or an `{{input:...}}`
field (clerk-typed). Two extensions this plan introduces, so KP/statutory printables auto-fill
instead of relying only on `{{input:...}}`:

- **`{{controlNumber}}`** — the certificate serial from P0.5.
- **Case variables + a "Case" sidebar group** — `{{caseNumber}}`, `{{complainant}}`, `{{respondent}}`,
  `{{caseNature}}`, `{{filingDate}}`, `{{hearingDate}}`, … (P1). Requires giving `resolveVariables`
  an optional case context; today it is resident-only, which is why current case docs are hard-coded.

---

## P0 — Become "BIMS-ready" (foundation + unlocks the export bridge)

These six workstreams close the RBI gaps and make the Excel exporter possible. Do them first.

### P0.1 Household roster + relationship-to-head
**Why:** RBI **Form A** (household roster) cannot be produced today. The `households` table, its IPC,
and `residents.household_id` already exist but are **unwired** — no route, no head, no relationship field.

- **Migration 020:**
  - `ALTER TABLE households ADD COLUMN head_resident_id INTEGER REFERENCES residents(id) ON DELETE SET NULL;`
  - `ALTER TABLE households ADD COLUMN purok TEXT;` (already on residents; mirror for grouping)
  - `ALTER TABLE households ADD COLUMN housing_type TEXT;` (optional, RBI-adjacent)
  - `ALTER TABLE residents ADD COLUMN relationship_to_head TEXT;` (Head/Spouse/Son/Daughter/…)
  - Add `resident_uid`-style `household_uid TEXT` + `row_version`, `created_at`/`updated_at` for future sync parity.
- **Backend:** flesh out `main/database/queries/households.ts` (list with members, member count, head join).
- **UI:** new route `renderer/app/(authenticated)/households/page.tsx` — list, create/edit, assign members,
  set head + each member's relationship. Add a **household picker** to the resident form (currently missing).
- **Acceptance:** can create a household, add residents, mark a head, and print a household roster.

### P0.2 Place of birth
**Why:** core RBI Form B field; we don't store it.
- **Migration 020:** `ALTER TABLE residents ADD COLUMN birth_place TEXT;`
- **UI:** add field to resident form; add `{{birthPlace}}` template variable in `variable-sidebar.tsx`.

### P0.3 Missing statutory sectors
**Why:** BIMS/RBI Form C tallies these; we lack them.
- **Migration 020 (booleans + refs):**
  - `is_solo_parent` (RA 8972), `is_osy` (out-of-school youth), `is_osc` (out-of-school child),
    `is_ofw`, `is_ip` (indigenous people) + `ethnicity TEXT`, `labor_force_status TEXT`
    (Employed/Unemployed/Not in labor force), `residency_status TEXT` (Permanent/Transient), `residency_start_date`.
  - Structured PWD: `disability_type TEXT` + `pwd_id_no TEXT` (migrate existing free-text `pwd_note` → keep as note).
- **Backend:** add each as a filter flag in `residents.ts listResidents` (mirror existing `is_pwd`/`is_4ps` pattern).
- **UI:** new sectoral registry pages reuse the shared `CategoryResidentsPage` wrapper (same as seniors/pwd) —
  add `solo-parents`, `osy`, `ip`, `ofw` routes with `filterParams`.
- **Acceptance:** each sector filters, counts on dashboard, and prints like the existing PWD/4Ps registries.

### P0.4 RBI Form C generator (statutory report)
**Why:** the flagship BIMS demographic report; nothing equivalent exists.
- **Backend:** new `main/database/queries/rbiFormC.ts` — semestral aggregate: per sector counts disaggregated
  by sex / age group / civil status, sourced from the fields added in P0.1–P0.3.
- **Printable = editable template (per Principle 4).** Form C's boilerplate (title, letterhead, headings,
  certifying-official block) lives in a **seeded editable template**; the computed tallies are injected as
  **report variables** so wording stays user-editable. Extend `resolveVariables` with a count namespace,
  e.g. `{{count:seniors}}`, `{{count:pwd}}`, `{{count:soloParents}}`, `{{count:male}}`, `{{count:female}}`
  (and a period via `{{input:period}}`). Only the numeric table cells are code-computed; everything a user
  might reword is a variable in the template.
- **Output:** render via the existing report engine (`webContents.printToPDF`) plus an `.xlsx` variant
  (exceljs, already a dependency).
- **Acceptance:** one click produces a Form C-shaped summary for a chosen period, and the barangay can edit
  its wording/layout on the Templates page without touching code.

### P0.5 Certificate serial number + issuance register
**Why:** BCIS issuance needs control numbers; today cert numbers are free-text `{{input:…}}` with no
uniqueness, and `generated_reports` has no control-number column.
- **Migration 020:**
  - `CREATE TABLE cert_sequences (doc_type TEXT, year INTEGER, last_no INTEGER, PRIMARY KEY(doc_type, year));`
  - `ALTER TABLE generated_reports ADD COLUMN control_number TEXT;` + `purpose TEXT`, `fee REAL`, `or_number TEXT`, `released_to TEXT`, `voided INTEGER DEFAULT 0`.
- **Backend:** atomic `nextControlNumber(docType)` (per-year reset, format `PREFIX-YYYY-NNNNN`); write into
  `generated_reports` on generation; add `{{controlNumber}}` template variable.
- **UI:** an **Issuance Register** view (filter/search generated docs by control no., type, date, resident) —
  extend the existing Saved Documents library rather than a new module. Replace hard-delete with **void**.
- **Acceptance:** every generated certificate gets a unique, sequential control number recorded in a searchable register.

### P0.6 The BIMS export bridge (the strategic payoff)
**Why:** the only sanctioned way into BIMS is a manual upload of DILG's **prescribed Excel template**.
- **Design:** an offline **"Export → BIMS"** action that reads residents + households, maps fields to the
  template columns, and writes an `.xlsx` via exceljs. Keep the column mapping in a **config profile**
  (`main/utils/bimsTemplate.ts`) so adjusting to template revisions is data, not code.
- **Reuse:** exceljs, the existing import pipeline, and stable `resident_uid` are already in place.
- **⛔ Blocker (see Open Questions):** we do **not** have the real template columns — they're login-gated.
  Build the exporter against our best RBI-field guess now, finalize the mapping when we obtain a real
  template from a barangay's DILG Information System Analyst.
- **Acceptance:** produces a valid `.xlsx` that a staffer can upload; a dry-run validation flags any
  required-but-empty fields before export.

---

## P1 — Differentiate & close daily-use gaps

Moderate detail; scope after P0 lands.

- **BORIS — ordinances / resolutions / EOs repository.** New `issuances` table (type, ref no., title,
  date enacted, sponsoring officials, full text/attachment, status) + route + document generation. Entirely new module.
- **Full KP workflow + blotter + VAW desk.** Extend `cases.ts`: 3-stage lifecycle (mediation → Pangkat
  conciliation → arbitration), Pangkat panel roster, coded nature-of-complaint taxonomy, a real `blotter`
  table (incident no./date/location/narrative), and a dedicated VAWC desk registry. Fix the
  `case_number` COUNT(*) sequence bug (use a sequence table like P0.5) and allow non-resident parties.
  - **KP printables = editable templates (per Principle 4), NOT hard-coded.** Seed **Certificate to File
    Action**, **Amicable Settlement / Kasunduang Pag-aayos (KP-16)**, **Notice of Hearing to Pangkat**, and
    **Arbitration Award** as editable `report_templates`. To auto-fill them from the case, add the **case
    variables + "Case" sidebar group** described above (give `resolveVariables` an optional case context).
  - **Migrate the existing hard-coded case docs to templates.** Replace the code-built *Case Record*,
    *Summons Notice*, and *Complaint Narrative* (`buildCaseDocHtml` / `buildSummonsNoticeHtml` /
    `handleGenerateNarrative` in `cases/page.tsx`) with seeded editable templates using the new case
    variables, so all case printables are user-editable and consistent.
- **Business permit validity + renewal.** Add permit no., issue/expiry dates, fee, renewal status +
  reminders to `businesses`.
- **Graphing:** population pyramid (age × sex), trend/line charts (population, issuances, cases over time —
  today only bars), a dedicated **Reports/Analytics** route (everything is on one dashboard now), and
  `.xlsx` export of report/analytics data.

## P2 — Round out full 11-subsystem parity

Lighter modules, mostly greenfield; prioritize by what your target barangays actually ask for.

- **BAMS** assets (map to COA PPE format) · **BFMS** finance (budget/appropriations/obligations/disbursements)
  · **BGADPBMS** GAD plan & budget · **BDRIS** disaster resilience · **BDP** development plan
  · **BBI** barangay-based institutions (+ officials term history, Lupon roster, SK) · **public barangay website**.

---

## Cross-cutting: prep for eventual sync (do alongside P0/P1, cheap now)

The earlier inventory flagged these as missing sync primitives. Adding them as new tables/columns land is
near-free and avoids a painful retrofit if DILG ever opens an API:

- **UID + row_version + provenance on every entity** (today only `residents` has them). Add to households,
  cases, businesses, issuances as those tables are created/altered.
- **Delete tombstones** — `deleteResident()` hard-deletes; a soft-delete/tombstone lets a future export
  communicate removals. Pair with the P0.5 "void" pattern.
- **`last_synced_at` / `bims_id` columns** — reserve now, populate later.

---

## Open questions / dependencies

1. **DILG prescribed Excel template (blocks P0.6 finalization).** We need a real copy of the columns from a
   barangay's DILG Information System Analyst (ISA) / C-MLGOO. Everything else in P0.6 can be built against a
   best-guess mapping first.
2. **RBI Form C exact layout** for P0.4 — confirm current DILG format (the revised 2024 Form C sectoral list).
3. **Priority of P1 vs P2 modules** — should follow what your pilot barangays actually need day-to-day.

## Suggested sequencing

```
P0.2 (place of birth)  ─┐
P0.3 (sectors)         ─┼─► P0.4 (Form C)  ─┐
P0.1 (households)      ─┘                    ├─► P0.6 (export bridge)  ──► pilot
P0.5 (cert numbering / register) ────────────┘
```

P0.1–P0.3 are independent field/table work (parallelizable). P0.4 depends on the fields from P0.1–P0.3.
P0.6 depends on P0.1–P0.4 for a meaningful export. P0.5 is independent and can run any time.
```
```
