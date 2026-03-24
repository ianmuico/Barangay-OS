# Design System — Barangay Management System

## Design Philosophy

Government software for non-technical users. Every pixel serves function over decoration.
Speed is the wow factor — one-click certificates, instant demographic answers.

## Color Palette

### Demographic Accent Colors
| Role | Color | Hex | Usage |
|------|-------|-----|-------|
| Residents | Violet | `#8b5cf6` | Primary resident views, sidebar active |
| Senior Citizens | Blue | `#3b82f6` | Senior tab, senior charts |
| Indigents | Amber | `#f59e0b` | Indigent tab, indigent charts |
| Youth | Emerald | `#10b981` | Youth tab, youth charts |
| Male | Indigo | `#6366f1` | Gender distribution |
| Female | Pink | `#ec4899` | Gender distribution |

### Chart Palette
10-color rotating palette for pie/bar charts:
`#3b82f6` `#10b981` `#f59e0b` `#8b5cf6` `#ec4899`
`#6366f1` `#14b8a6` `#f97316` `#ef4444` `#84cc16`

### Activity Log Dot Colors
- Created: `emerald-500`
- Updated: `blue-500`
- Deleted: `red-500`
- Report: `purple-500`
- Login: `amber-500`
- Backup: `teal-500`

## Typography

- **Primary Font:** Inter (Google Fonts), Latin subset
- **Report/Print Font:** Times New Roman, serif, 12pt, 1.6 line-height
- **Size Scale:**
  - Page titles: `text-2xl font-bold` (via PageHeader)
  - Card titles: `text-base font-medium`
  - Section labels: `text-xs font-semibold uppercase tracking-wider text-muted-foreground`
  - Body text: `text-sm`
  - Micro labels: `text-xs`, `text-[10px]`, `text-[11px]`

## Layout

- **Sidebar:** Fixed `w-60`, border-right, `bg-card`
- **Topbar:** Sticky, contains user profile, audit log, theme toggle
- **Main Content:** `flex-1 overflow-auto p-6`
- **Grid System:** Tailwind grid with responsive breakpoints
  - Stat cards: `grid-cols-2 lg:grid-cols-4`
  - Chart + activity: `lg:grid-cols-5` (3+2 split)
  - Template cards: `md:grid-cols-2 lg:grid-cols-3`

## Components

### Avatar System
- **Squircle shape:** `borderRadius: 22%` with gradient backgrounds
- **10 gradient pairs** rotated by `id % 10`
- **Initials:** Max 2 characters extracted from name
- **Profile banner:** 80px gradient banner with overlapping avatar

### Data Table (DataTable)
- Powered by `@tanstack/react-table`
- Built-in search, pagination, toolbar slot
- Row actions: icon buttons (ghost variant, `size="icon"`)

### Form Dialogs
- Max width `max-w-2xl`, max height `90vh`
- Gradient banner header with squircle avatar
- Grouped sections with uppercase labels
- `h-9` input height standard
- Required fields marked with `*`

### Cards
- Standard shadcn Card with Header + Content
- Stat cards: clickable, ring highlight when active
- Template cards: preview text with gradient fade

### Empty States
- Centered flex column layout
- Muted icon + descriptive text + action button
- Warm illustration style with Filipino/Bisaya CTAs

### Page Header
- Sticky with scroll detection (via ScrollHeaderProvider)
- Title + description pattern

## Spacing

- Page padding: `p-6`
- Card gaps: `gap-4`
- Section spacing: `space-y-6` (page level), `space-y-5` (form sections)
- Input gaps: `gap-3` within grid rows
- Compact spacing: `space-y-2` for related items

## Interactive Patterns

- **Navigation:** Button-based nav links (not anchor tags) with loading spinner
- **Dialogs:** Radix Dialog primitives, `DialogContent` with close button
- **Alerts:** AlertDialog for destructive confirmations
- **Toasts:** Sonner, top-right, rich colors
- **Dropdowns:** Radix DropdownMenu for settings
- **Switches:** For boolean toggles (e.g., Indigent flag)
- **Tabs:** Radix Tabs for multi-view pages

## Dark Mode

- Supported via `next-themes` with system/light/dark
- All colors use CSS variables from Tailwind theme
- Explicit dark variants for preview containers (`dark:bg-zinc-900`)

## Print Styling

- A4 page format assumed
- Times New Roman serif for government document aesthetic
- Header templates with Republic of PH / Province / Municipality / Barangay hierarchy
- Logo rendering in header (base64 embedded)
