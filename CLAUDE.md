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
| Styling | Tailwind CSS | Mobile-first utility classes |
| Auth | Supabase Auth | Single family account, stays logged in |
| Storage | Supabase Storage | Video files and cover images |
| Database | Supabase Postgres | Scrapbook and clip metadata |
| Deployment | Netlify | CD from main branch |
| State | React Context | No Redux until complexity demands it |
| Icons | Lucide React | 1.75px stroke, Amber on dark |

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

## 🏗 Screen Architecture — All Four Screens Designed & Locked

Cassette has four screens. Reference the HTML mockups in the design assets folder.

### 1. Home Screen (`cassette-screen-home.html`)
The library view. Shows all scrapbooks as medium cards, 2–3 visible at once.

- **Card tap** → straight to Playback. No intermediate screen.
- **New Scrapbook** button → amber pill in the nav header. Always visible.
- **Card thumbnails** → two-tier system:
  - Rich card: cover image (auto-extracted first frame or custom set during creation)
  - Compact card: warm color block, list-like. Fallback when no image available.
  - Cover image extraction is a **v1 stretch goal** — build compact first.
- Scrapbook name, date range, clip count, and duration shown on each card.
- Fourth card fades out to imply more content below the fold.

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
- Optional cover image picker (camera roll or frame from clip)
- Summary pill: `N clips · ~X min · date range`
- Single "Create Scrapbook" CTA

### 3. Scrapbook Workspace (`cassette-screen-workspace.html`)
The editing environment. Fixed layout — everything visible at once.

**Layout (top to bottom, fixed):**
- **Nav bar:** Back to Library, scrapbook title, Watch button (→ Playback)
- **Preview zone (~38%):** Selected clip preview. Shows current caption placement. Not a viewing experience — a working preview.
- **Trim zone (~18%):** Always-visible filmstrip with amber drag handles for in/out points. In/out timestamps shown as amber pills. Playhead shows current position. Dimmed regions show what's cut.
- **Tool row (4 icons):** Caption, Reorder, Preview (in-context), Remove
- **Clip list (scrollable):** All clips in order. Tap to select → loads into preview + trim above. Status badges: `trimmed`, `caption`, duration. Amber checkmark on edited clips, hollow circle on untouched.

**Reorder mode:**
- Activated by tapping the Reorder icon in the tool row
- Preview and trim zone dim to ~20% opacity (not applicable while reordering)
- Amber banner appears: "Drag clips to reorder · Done"
- Drag handles appear on every clip row
- Long-press to lift, drag to position, dashed placeholder shows drop zone
- Reorder icon glows amber while active

**Caption editing:**
- Tapping Caption tool opens caption overlay on the preview
- Captions are draggable (free placement on frame) and pinch-to-resize
- Caption data model: text + x/y position (% of frame) + font size
- Stored as metadata per clip, rendered in both Workspace and Playback

### 4. Playback View (`cassette-screen-playback.html`)
The full-screen Reels-style viewer. The payoff.

- **Navigation:** Swipe up/down between clips
- **UI:** Almost nothing visible. Segmented progress bar (one segment per clip) at top, back button top-left, three-dot menu top-right. Clip counter + pause/play bottom right.
- **Captions:** Rendered exactly where she placed them in Workspace. Fraunces italic, warm wheat, text-shadow for legibility.
- **Pause:** Tap anywhere → big amber play button fades in over dimmed frame.
- **Three-dot menu (⋯):** Action sheet with: Edit Scrapbook → Workspace, Scrapbook Details, Share (dimmed, coming soon).
- Progress bar: segments fill left to right as clips complete. Currently active segment animates.

---

## 📝 Data Model (v1)

```
Scrapbook {
  id
  name
  cover_image_url   // optional
  created_at
  clips: Clip[]
}

Clip {
  id
  scrapbook_id
  video_url         // Supabase Storage URL
  order             // integer, reorderable
  trim_in           // seconds, default 0
  trim_out          // seconds, default = duration
  caption_text      // optional string
  caption_x         // % of frame width (0–100)
  caption_y         // % of frame height (0–100)
  caption_size      // px or rem, set during editing
  duration          // seconds, set on upload
  recorded_at       // from video metadata if available
}
```

---

## 💡 What Cassette Is Not (v1 Scope)

Explicitly out of scope. Do not build, do not plan for:

- Multi-user / shared scrapbooks
- Background music or audio mixing  
- Server-side video re-encoding or stitching
- Social sharing or public links
- Native mobile app (web app only)
- Light mode

---

## 📝 Maintenance Rules

- **After a major pivot:** Update `DECISIONS.md` and note the date and reason.
- **Long conversations:** Remind user to `/clear` if chat history exceeds 20 messages.
- **Scope creep check:** If a feature would touch core architecture, flag it first.
- **Never silently expand scope.** Always ask.
