# CLAUDE.md — Project Constitution for Cassette

> **Cassette** is a private family video scrapbook app. The primary user is a 
> mom uploading iPhone videos in a waiting room. Every decision should be made 
> with that person in mind.

---

## 🧠 Memory & Strategy

- **Read First:** Always check `DECISIONS.md` before starting any task. Understand 
  the current vibe, stack, and what's been decided before touching code.
- **Measure Twice:** For any change touching more than one file, write out a brief 
  plan and wait for approval (`y` / `go`) before executing. One extra question now 
  beats an hour of rework later.
- **Check for Pivots:** If a new request seems to contradict existing code or 
  decisions, pause and ask: *"Are we pivoting, or extending?"* before refactoring.
- **Token Thrift:** Do not auto-read entire directories. Ask for specific file paths 
  if unsure. Read only what you need to complete the task.
- **Log It:** After any significant decision or pivot, ask: *"Should I update 
  DECISIONS.md?"*

---

## 📱 The Prime Directive: Mobile-First, Always

**The primary user is on an iPhone. Design and build for that first.**

- Default interaction model: **thumb, tap, swipe** — not hover, not keyboard shortcut
- Assume **one-handed use** is common
- Assume **intermittent or slow WiFi** — design upload flows to be resumable and 
  forgiving, with clear progress feedback
- Touch targets must be large enough to tap reliably (minimum 44×44pt)
- Never design a feature around a hover state as its primary interaction
- iPhone video formats (.MOV, HEVC/H.265) must be handled correctly — do not assume 
  standard web-friendly formats
- Test mental model: *"Could she do this in a waiting room in 5 minutes?"*

Desktop is a secondary concern. It should work, but don't optimize for it at the 
expense of mobile experience.

---

## 🛠 Tech Stack

| Layer | Tool | Notes |
|---|---|---|
| Frontend | React + Vite | Component-based, fast dev loop |
| Styling | Tailwind CSS v4 | Mobile-first utility classes, `@theme` brand tokens |
| Auth | Supabase Auth | Multi-account, stays logged in |
| Storage | Cloudflare R2 | All uploads + deletes go through `lib/r2.js` → Cloudflare Worker (`kassette/worker/`) → R2 bucket binding. Public URL: `pub-bab6003c5bee4548b6a48fc2eca4583a.r2.dev`. Worker URL: `cassette-worker.cstewch.workers.dev`. Migration from Supabase Storage complete 2026-04-15. |
| Database | Supabase Postgres (Pro) | Scrapbook and clip metadata, RLS user_id-scoped |
| Deployment | Cloudflare Pages | CD from main branch via GitHub |
| State | React Context | No Redux until complexity demands it |
| Routing | React Router v7 | URL-based, iOS swipe-back works |
| Icons | Lucide React | 1.75px stroke, Amber on dark |
| Video processing | @ffmpeg/ffmpeg + @ffmpeg/util v0.12 | WASM hosted in Supabase Storage, singleton in `lib/remux.js` |

**Do not introduce new infrastructure without a plan approval.** If a task seems to
require a new service or dependency, propose it first.

---

## 🎨 Design Philosophy: Ordo ab Chao

*Order from chaos.* Her phone has hundreds of unlabeled videos. Cassette's job is 
to make them feel curated, loved, and beautiful — without requiring her to do much work.

- **Functional first.** If it doesn't work reliably, the design doesn't matter.
- **Then elegant.** Simple, warm, nostalgic. Think cassette tape, home video, cozy 
  — not clinical, not corporate, not Instagram.
- **Don't let perfect be the enemy of good.** Ship the thing that works. Iterate toward beautiful.
- **Joyful where possible.** This is a memory-keeping app. The experience of using 
  it should feel a little bit like opening a shoebox of old photos.

---

## 🎨 Brand System — Non-Negotiable

All UI must use the Cassette brand system. Never deviate without a plan approval.

**Reference:** Full brand system in `cassette-brand-guide.html`. Treat it as law.

**Colors — Golden Hour palette:**

| Token | Name | Hex | Role |
|---|---|---|---|
| `--cassette-amber` | Amber | `#F2A24A` | Primary accent, CTA, logo |
| `--cassette-sienna` | Sienna | `#E8855A` | Secondary, danger, logo italic |
| `--cassette-wheat` | Wheat | `#F5DEB3` | Primary text |
| `--cassette-walnut` | Walnut | `#2C1A0E` | App background |
| `--cassette-walnut-mid` | Walnut Mid | `#3D2410` | Cards, surfaces |
| `--cassette-walnut-light` | Walnut Light | `#4A2E18` | Borders, dividers |
| `--cassette-rust` | Rust | `#7A3B1E` | Labels, metadata, muted text |
| `--cassette-deep` | Deep Walnut | `#1A0F08` | Playback background |

**Typography:**
- Display / Headings / Logo: `'Fraunces', serif` (Google Fonts)
- All UI text / labels / body: `'Plus Jakarta Sans', sans-serif` (Google Fonts)
- Italic Fraunces is reserved for emotional moments: video captions, logo, hero text
- Never use system fonts, Inter, Roboto, or Arial in Cassette UI

---

## 🏗 Screen Architecture — 11 Screens Built & Working

**Full screen inventory with descriptions:** `cassette-screens.html` (keep updated when screens change)

### Routes
```
/                         → HomeScreen             (protected)
/login                    → LoginScreen            (public)
/signup                   → SignupScreen           (PUBLIC — text this URL to new users)
/scrapbook/:id            → ScrapbookDetailScreen  (protected) — hub: Watch / Edit / Share options
/scrapbook/:id/intake     → IntakeScreen           (protected)
/scrapbook/:id/watch      → PlaybackScreen         (protected)
/scrapbook/:id/workspace  → WorkspaceScreen        (protected)
/scrapbook/:id/share      → ShareScreen            (protected)
/discovery                → DiscoveryScreen        (protected)
/remix                    → RemixScreen            (protected) — Film Fest filter + loading anim
/settings                 → SettingsScreen         (protected)
```

### 1. Home Screen (`cassette-screen-home.html`)
Two-tab library view. Rebuilt 2026-03-29.

**"Your Scrapbooks" tab:**
- Two-level collapsible hierarchy: Year folder → Month subfolders (1–12, or `···` for ungrouped)
- Collapsed year shows inline month name preview: `2026  Jun · Mar · ···`
- On first load: current year + most recent month auto-expanded; all others collapsed. `initDone` ref prevents re-running default expansion.
- Collapse state: `collapsedYears` (Set of year ints) + `collapsedMonths` (Set of `"year-month"` strings)
- Grouped data structure: `{ [year]: { [month]: scrapbook[] } }` — month `0` = ungrouped `···` bucket, sorted last
- FAB (+ button) only visible on this tab
- **Rename & Redate sheet:** Replaces old Rename — adds year stepper + month stepper so old scrapbooks can be retroactively assigned a month folder. Month cycles: left from 1 → null (···), right from 12 → null, right from null → 1.

**"Shared" tab:**
- Amber 2px dot on tab button when any share has `seen: false`
- **Feed view** (default): flat list sorted by year/month desc; cards show "from {ownerName}"
- **By Person view:** collapsible folder per owner; amber dot on folder if unseen items; all start open on view switch
- Owner display names fetched from `profiles` table via `owner_id`

### 2. Intake Session (`cassette-screen-intake.html`)
The upload, preview, and cull flow. Creates a new Scrapbook.

**Step 1 — Pick your clips:**
- iOS native file picker to pull videos from camera roll (browser `<input type="file" multiple accept="video/*">`)
- 2-column grid layout with date groups (e.g. "December 25, 2024")
- Checkmark overlay selection: tap to toggle selected/deselected
- Deselected clips dim to 50% brightness — clear visual separation
- Selected clips get amber border + filled amber checkmark
- Progress bar at top: `N videos imported / M selected`
- Sticky bottom bar: running count + Continue button
- No upload to Supabase until user commits

**Step 2 — Name & create (bottom sheet):**
- Slides up over the dimmed grid
- Name field (Fraunces serif input, pre-focused)
- Year + Month `PickerDropdown` components (scrollable branded dropdown, auto-set from earliest clip date)
- Optional cover image picker (camera roll or frame from clip)
- Summary pill: `N clips · ~X min · date range`
- Single "Create Scrapbook" CTA

**Upload overlay:**
- Cassette reel spinning animation (same SVG as RemixScreen's "Making it groovy" screen)
- Smooth lerping progress bar: `setInterval` every 80ms, `smoothPct += (target - smoothPct) * 0.05`
- Remuxing phase = 0–40%, uploading phase = 40–95%; no stall-then-jump
- **Cancel button** (X, top-right `absolute top-14 right-5`): sets `cancelledRef`, releases wake lock, navigates back. Loop checks `cancelledRef` at each iteration start.

### 3. Scrapbook Detail Screen
Hub screen when you tap a scrapbook from Home. Shows cover, title, clip count, duration with three action buttons: Watch, Edit, Share.

- Tapping the cover/Watch → `/scrapbook/:id/watch`
- Edit → `/scrapbook/:id/workspace`
- Share → `/scrapbook/:id/share`
- Populates `dataCache` so WorkspaceScreen and PlaybackScreen get instant data without re-fetching.

### 4. Scrapbook Workspace (`cassette-screen-workspace.html`)
The editing environment. Fixed layout — everything visible at once.

**Layout (top to bottom, fixed):**
- **Nav bar:** Back (←) left → navigates to `/scrapbook/:id` (ScrapbookDetailScreen). Scrapbook title center. Undo + **Watch** right. Watch → navigates to `/scrapbook/:id/watch` (PlaybackScreen). A small amber `saved` text flashes for 2.5s after any auto-save fires from `saveClipChanges`.
- **Preview zone (flex-1):** Selected clip preview with poster thumbnail. `preload="auto"`.
- **Mini timeline:** 6px slim progress bar above clip strip. Shows amber kept region, dark trimmed regions, white playhead. Expands to full trim/split filmstrip when TRIM or SPLIT tool is active.
- **Crafting drawer (collapsible):** Header row: `[TRIM] | [SPLIT] | [TOOLS]` tabs. TOOLS is a toggle that shows/hides Caption, Reorder, Remove tool row. Trim timestamps shown in drawer header row only when TRIM active.
- **Horizontal clip strip:** Scrollable row of 64×64 clip cards. Active card gets amber border. Each card shows clip number, duration, and status icon badges (scissors, caption T, muted). Auto-scrolls active card into view.
- **Reorder mode:** Separate vertical drag-to-reorder list shown when Reorder tool is tapped. Cards can be long-pressed and dragged.

**Split tool (3-step trim-middle-out):**
- Tap SPLIT → draggable bar at ~30%; button says "Set Split 1 · {time}"
- "Set Split 1" → bar 1 locks (faded); bar 2 spawns ~30% later; excluded zone shades between bars; "Set Split 2 · {time}"
- "Set Split 2" → button becomes filled amber "Confirm & Cut"
- "Confirm & Cut" → saves `cut_in`/`cut_out` (sorted, cut_in < cut_out) → exits split mode
- If cut already exists: shows "Remove cut" only (no step flow). `advanceSplitStep()` handles all steps — do not reintroduce `confirmSplitPoint()`.

**Single-level undo:**
- `undoable` state captures pre-change snapshot for trim, mute, caption, and split
- Undo button appears in nav header (left of Watch) when an undoable action exists

**Caption editing:**
- Tapping Caption tool opens caption overlay on the preview
- Captions are draggable (free placement on frame) and pinch-to-resize
- Caption data model: text + x/y position (% of frame) + font size
- Stored as metadata per clip, rendered in both Workspace and Playback

### 5. Playback View (`cassette-screen-playback.html`)
The full-screen Reels-style viewer. The payoff.

- **Navigation:** Swipe up/down between clips
- **UI:** Minimal. Segmented progress bar at top. Back button top-left. Three-dot menu top-right. Clip counter bottom-right.
- **Captions:** Rendered exactly where placed in Workspace. Fraunces italic, wheat, text-shadow.
- **Hold-to-pause:** Hold 200ms → pauses. Screen freezes cleanly (no overlay). Release → resumes if was playing.
- **Scrub bar:** Touch bottom 25% of screen → amber timeline appears. Drag to seek.
- **Three-dot menu (⋯):** Edit Scrapbook, Scrapbook Details, **Export Scrapbook** (trim+concat → MP4 download/share).

### 6. Discovery Screen
- `/discovery` — shuffled playlist of all clips across all scrapbooks
- Vertical swipe = next clip. Horizontal swipe = next scrapbook.
- Hold-to-pause + scrub bar same as Playback.
- Tap for scrapbook info + "Watch scrapbook →" link.

### 7. Film Fest Screen (`/remix`) — `RemixScreen.jsx`
A library filter workspace. Accessible from the shuffle icon on HomeScreen.

- **Year filter:** multi-select dropdown; empty = All Years. Options fetched from user's scrapbooks on mount.
- **Month filter:** multi-select dropdown; empty = All Months. Always shows all 12 months.
- **Watch:** fetches scrapbooks filtered by selected years/months, flattens clips, preloads first 3, navigates to DiscoveryScreen with `{ clips, isRemix: true, screenTitle: 'Film Fest' }`. Min 2s loading screen with cassette reels.
- **Download:** coming soon modal stub.
- **Surprise Me** pill (top-right): **LIVE as of 2026-04-09.** Fires `handleSurpriseMe()` — fetches all own clips (+ optionally shared clips per `profiles.surprise_me_include_shared`), shuffles, picks 10–15, preloads, navigates to DiscoveryScreen with `screenTitle: 'Surprise Me'`. Loading screen shows "Rolling the dice…". Phase `'loading-surprise'` vs `'loading'`.
- **Blob prewarm on mount:** `prewarm()` fires on open alongside year fetch — preloads 5 random clip blobs + thumbnails silently so Surprise Me launches faster.
- **Cancel button** (X, top-right on loading screen): sets `cancelledRef`, returns to studio.
- `MultiSelectDropdown` component defined locally — checkbox-style list, "All X" option clears selection.
- `CLIP_SELECT` constant at top of file — shared by both Watch and Surprise Me queries.

**DiscoveryScreen remix mode (updated 2026-04-09):**
- `isRemix: true` → skips own fetch, shows `screenTitle` pill in header center
- **Back arrow (top-left):** navigates to `/remix`
- **Disc3 icon (top-right):** opens bottom sheet with current clip's scrapbook year + name. "Go to this scrapbook" (amber) navigates to scrapbook detail with warning "Heading there will exit [screenTitle]." "Stay in [screenTitle]" closes sheet.
- **Bottom info area:** hidden in remix mode. Scrapbook name + Watch → only shown in normal library Discovery.

**SettingsScreen — Surprise Me section:**
- Toggle: "Include shared clips" — reads/writes `profiles.surprise_me_include_shared`
- iOS toggle pattern: 44×26px track, 20×20px wheat knob, `translateX(3px)` off / `translateX(21px)` on. OFF = `#4A2E18` track, ON = amber track. Always wheat knob. **Use fixed px dimensions on track/knob, not Tailwind w-/h- classes, to prevent knob overflow.**

### 8. Share Screen (`/scrapbook/:id/share`)
Manage per-scrapbook sharing. Add family members by email. Remove self from shared scrapbooks. Auto-share defaults live in SettingsScreen.

### 9. Signup Screen
- `/signup` — public route, outside AuthGate
- Email + password + confirm. Supabase `signUp()`. Confirmation email sent.
- Text this URL to new family members. No admin action required.

---

## 📝 Data Model (v1)

```
Scrapbook {
  id
  user_id
  name
  cover_image_url   // optional
  year              // integer, set at intake
  month             // integer 1–12, nullable (null = ungrouped ··· bucket)
  created_at
  clips: Clip[]
}

Clip {
  id
  scrapbook_id
  video_url         // R2 URL — video (FastStart remuxed) OR photo image URL
  thumbnail_url     // R2 URL — first-frame JPEG poster for videos; same as video_url for photos
  order             // integer, reorderable — unique constraint per scrapbook_id
  trim_in           // seconds, metadata only (no re-encoding)
  trim_out          // seconds, metadata only
  caption_text      // optional string
  caption_x         // % of frame width (0–100)
  caption_y         // % of frame height (0–100)
  caption_size      // font size
  duration          // seconds, set on upload
  recorded_at       // from video metadata if available
  media_type        // 'video' (default) | 'photo' — photos use video_url for the image, thumbnail_url = video_url, duration = display seconds
  // NOTE: NO `muted` column — mute is client-side only state
}

ScrapbookShare {
  id
  scrapbook_id      // FK → scrapbooks
  owner_id          // FK → auth.users (who owns the scrapbook)
  shared_with_id    // FK → auth.users (who can view it)
  seen              // boolean — false = unread; drives amber dot on Shared tab
  created_at
}

Profile {
  user_id                       // FK → auth.users
  username                      // UNIQUE, used for login + sharing
  display_name                  // shown in Shared tab "from {display_name}"
  surprise_me_include_shared    // boolean default false — include shared clips in Surprise Me
  created_at
}
```

**Known gotcha:** The `clips` table has a unique constraint on `(scrapbook_id, order)`. When splitting a clip, shift existing clip orders BEFORE inserting the new clip, or the insert will silently fail.

**Storage paths:**
- Videos: `cassette-media/{userId}/videos/{clipId}.mp4`
- Posters: `cassette-media/{userId}/posters/{clipId}.jpg`
- Covers: `cassette-media/{userId}/covers/{scrapbookId}.ext`

---

## 💡 What Cassette Is Not (v1 Scope)

Explicitly out of scope. Do not build, do not plan for:

- Background music or audio mixing
- Server-side video re-encoding or stitching
- Social sharing or public links
- Native mobile app (web app only)
- Light mode
- Caption burning into video (export ships captions as overlay metadata only; v2 idea)

---

## 📝 Maintenance Rules

- **After a major pivot:** Update `DECISIONS.md` and note the date and reason.
- **Long conversations:** Remind user to `/clear` if chat history exceeds 20 messages.
- **Scope creep check:** If a feature would touch core architecture, flag it first.
- **Never silently expand scope.** Always ask.
- **Screen inventory:** Keep `cassette-screens.html` up to date whenever screens are added, renamed, rerouted, or removed.
