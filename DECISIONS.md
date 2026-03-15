# DECISIONS.md — Cassette Project Log

> **Note to Claude:** This file tracks what has actually been decided. 
> Brainstorming lives elsewhere. If it's in here, it's a constraint — 
> work within it until there's a reason to pivot and update this doc.

---

## 🎯 North Star (Current Goal)

**Build a working v1 of Cassette that one family member can use repeatably 
to create and watch private video scrapbooks from her iPhone.**

**Vibe:** Warm, cozy, nostalgic. Functional first, beautiful second. 
Mobile-first always. Don't let perfect be the enemy of shipped.

**Current phase:** Design complete. Ready to build.

---

## 🛠 Active Tech Stack

| Layer | Decision | Rationale |
|---|---|---|
| Frontend | React + Vite | Fast dev loop, component model fits the screen architecture |
| Styling | Tailwind CSS | Mobile-first utilities, speed over pixel perfection |
| Auth | Supabase Auth | Single family account, persistent login |
| Storage | Supabase Storage | Video files live in the cloud, accessible from any device |
| Database | Supabase Postgres | Scrapbook/clip metadata |
| Deployment | Cloudflare Pages | CD from main branch via GitHub |
| State | React Context | No Redux until complexity demands it |
| Routing | React Router v6 | URL-based. iOS swipe-back works for free. Refresh preserves screen. |
| Icons | Lucide React | 1.75px stroke weight, Amber on dark |

---

## 📝 Decision Log

### [2026-02-27] — Project Initialized

- **Name:** Cassette. Nostalgic, cozy, home-video warmth.
- **Deployment:** Cloud-based. Supabase + Netlify. Accessible from any iPhone.
- **Auth:** Single family account. Email/password, stays logged in.
- **Primary user:** Mom uploading iPhone videos in a waiting room. One hand, intermittent WiFi, 5–10 minute windows.
- **Library model:** Each upload session = one self-contained Scrapbook. No master library.
- **v1 editing:** Trim (metadata only, no re-encoding) + text captions. That's it.
- **Out of scope v1:** Multi-user, music, social, native app, server-side processing.

---

### [2026-02-27] — Brand System Locked

**Palette: Golden Hour**

| Name | Hex | Role |
|---|---|---|
| Amber | `#F2A24A` | Primary accent, CTA, logo |
| Sienna | `#E8855A` | Secondary, danger, logo italic |
| Wheat | `#F5DEB3` | Primary text |
| Walnut | `#2C1A0E` | App background |
| Walnut Mid | `#3D2410` | Cards, surfaces |
| Walnut Light | `#4A2E18` | Borders, dividers |
| Rust | `#7A3B1E` | Labels, metadata |
| Deep Walnut | `#1A0F08` | Playback background |

**Typography: Fraunces (display) + Plus Jakarta Sans (UI)**
- Italic Fraunces reserved for emotional moments: captions, logo, hero text
- Never use system fonts, Inter, Roboto, or Arial

**Logo:** The Spool — two cassette reel circles + sienna base stripe. Amber on Walnut. Never recolor, rotate, or add effects.

**Full brand reference:** `cassette-brand-guide.html`

---

### [2026-02-27] — Favicon Package Exported

All sizes generated as pixel-rendered PNGs with 6× anti-aliasing:
`favicon.ico` (16+32+48), `favicon-16.png`, `favicon-32.png`, `favicon-48.png`,
`apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png`,
`icon-57.png`, `icon-76.png`, `icon-120.png`, `icon-152.png`

Drop `favicons/` folder into Vite `public/`. Add `manifest.json` for PWA with `theme_color: #2C1A0E`.

---

### [2026-02-27] — Home Screen Locked

- **Cards:** Medium size, 2–3 visible on screen at once.
- **Tap card:** Goes straight to Playback. No intermediate screen.
- **New Scrapbook:** Amber pill button in nav header. Always visible.
- **Card thumbnail — two-tier:**
  - Rich: cover image (auto-extracted first frame or custom). Tall visual area.
  - Compact: warm color block, no image. List-like. Fallback when no image.
  - Both coexist in the same list naturally.
  - Cover image extraction = **v1 stretch goal**. Build compact first.

**Mockup:** `cassette-screen-home.html`

---

### [2026-02-27] — Intake Session Locked

**Step 1 — Pick your clips:**
- 2-column grid, date-grouped
- Checkmark overlay selection (tap to toggle)
- Selected = amber border + filled checkmark. Deselected = dimmed to 50%
- Progress bar: `N imported / M selected`
- Sticky bottom bar with running count + Continue button
- No Supabase upload until user commits

**Step 2 — Name & create (bottom sheet):**
- Slides up over dimmed grid
- Name field (Fraunces input, pre-focused) + optional cover image picker
- Summary pill shows clip count, duration, date range before commit
- Single "Create Scrapbook" CTA

**Mockup:** `cassette-screen-intake.html`

---

### [2026-02-27] — Workspace Locked

**Fixed layout — all zones always visible:**

| Zone | Height | Purpose |
|---|---|---|
| Nav | fixed | Back to Library, title, Watch button |
| Preview | ~38% | Working preview of selected clip. Not a viewer. |
| Trim strip | ~18% | Always-on filmstrip with amber drag handles |
| Tool row | fixed | Caption · Reorder · Preview · Remove |
| Clip list | remaining | Scrollable. Tap to select. |

**Trim:** Always visible for the active clip. Amber handles set in/out points. In/out shown as amber pills with duration kept. No separate trim screen.

**Captions:** Tapping Caption tool opens draggable, pinch-to-resize overlay on the preview. Free placement on frame. Data: `text`, `x%`, `y%`, `size`.

**Reorder:** Tool row icon. Activates drag-handle mode on the clip list. Preview + trim dim to ~20%. Amber banner explains gesture. Done to exit.

**Clip status badges:** `trimmed` (amber), `caption` (sienna), duration (default). Amber checkmark on clips with any edits, hollow circle on untouched.

**Mockup:** `cassette-screen-workspace.html`

---

### [2026-02-27] — Playback View Locked

- **Navigation:** Swipe up/down — vertical Reels-style
- **UI:** Minimal. Segmented progress bar (one segment per clip). Back button top-left. Three-dot menu top-right. Clip counter + pause/play bottom right. Nothing else.
- **Captions:** Rendered exactly where placed in Workspace. Fraunces italic, wheat, text-shadow.
- **Pause:** Tap anywhere → amber play button fades in over dimmed frame.
- **Three-dot menu (⋯):** Action sheet:
  - Edit Scrapbook → Workspace
  - Scrapbook Details → rename, cover, clip list
  - Share Scrapbook → dimmed, "Coming soon"

**Mockup:** `cassette-screen-playback.html`

---

### [2026-02-27] — Navigation Approach Locked

- **React Router v6** — URL-based routing
- Each screen has its own URL path (see below)
- iOS swipe-back gesture works natively
- Refresh preserves the current screen
- Back button behavior is real, not hand-rolled

```
/                     → Home (Library)
/intake               → Intake Session
/scrapbook/:id        → Playback View
/scrapbook/:id/edit   → Workspace
```

---

### [2026-02-27] — Data Model Locked (v1)

```
Scrapbook {
  id, name, cover_image_url, created_at
}

Clip {
  id, scrapbook_id, video_url, order,
  trim_in, trim_out,          // seconds, metadata only
  caption_text,               // optional
  caption_x, caption_y,       // % of frame
  caption_size,               // font size
  duration,                   // seconds
  recorded_at                 // from video metadata
}
```

---

---

### [2026-02-27] — App Scaffold Complete (Phase 1)

**React app lives in `app/` subdirectory.** Design assets remain in the root.

**Files created:**
- `app/package.json` — React 18, React Router v7, Supabase JS v2, Lucide React, Tailwind v4
- `app/vite.config.js` — Tailwind v4 via `@tailwindcss/vite` plugin
- `app/index.html` — Google Fonts, favicon links, PWA manifest link, mobile meta tags
- `app/src/index.css` — Tailwind import + `@theme` block with all brand tokens
- `app/src/lib/supabase.js` — Supabase client (reads from `.env.local`)
- `app/src/context/AuthContext.jsx` — Auth context with signIn/signOut, persistent session
- `app/src/App.jsx` — Router + AuthGate (loading spinner → login or protected routes)
- `app/src/screens/LoginScreen.jsx` — Email/password login, brand-styled
- `app/src/screens/HomeScreen.jsx` — Live data from Supabase, gradient cards
- `app/src/screens/IntakeScreen.jsx` — Full 2-step upload flow (file picker → name sheet → upload)
- `app/src/screens/PlaybackScreen.jsx` — Placeholder
- `app/src/screens/WorkspaceScreen.jsx` — Placeholder
- `app/public/manifest.json` — PWA manifest
- `app/public/favicons/` — All favicon assets copied from design root
- `app/supabase-schema.sql` — Tables + RLS policies (run in Supabase SQL Editor)
- `app/.env.local` — Supabase URL + anon key (gitignored)

**To run:**
```bash
cd app
npm install
npm run dev
```

**Supabase setup required before full functionality:**
1. Paste `supabase-schema.sql` into Supabase SQL Editor → Run
2. Create `cassette-media` bucket in Storage → set to **Public**

---

### [2026-02-27] — All Four Screens Built & Tested

All screens are built and confirmed working in the browser:

- **LoginScreen** ✅ — email/password, brand-styled, persistent session
- **HomeScreen** ✅ — live Supabase data, gradient cards, empty state
- **IntakeScreen** ✅ — file picker, date-grouped grid, thumbnail extraction, upload flow, progress overlay
- **PlaybackScreen** ✅ — swipe nav, segmented progress bar, captions, tap-to-pause, three-dot action sheet
- **WorkspaceScreen** ✅ — preview zone, trim handles (mouse + touch), caption tool, reorder mode (mouse + touch), remove confirm

**Known bugs fixed:**
- Trim drag stale closure: captured `currentTrimIn`/`currentTrimOut` as local vars in the drag closure instead of reading from stale `clips` array
- Reorder drag: switched from React `onTouchMove` container handler (passive, ignored preventDefault) to document-level listeners inside `startReorderDrag` closure — same pattern as trim
- Reorder drag: added mouse event support (`onMouseDown`, `mousemove`, `mouseup`) — was touch-only before
- Reorder splice race condition: capture `spliceFrom` before calling `setClips`, then immediately update `dragState.current.currentIndex` — React's updater runs async, was reading mutated ref

**Workspace behavior to know:**
- Tapping clips is intentionally disabled in reorder mode (preview is dimmed, selection is irrelevant)
- Status dots (right side of clip rows) = edit indicators only — amber checkmark = clip has trim or caption, hollow circle = untouched

---

### [2026-02-27] — GitHub + Cloudflare Pages Deployment

- **GitHub repo:** `https://github.com/Driver-cyber/kasette` (private)
- **Git root:** `app/` subdirectory (design assets remain in project root, not committed)
- **Pushed via:** GitHub Desktop (no GitHub CLI installed)
- **`_redirects` file added** to `app/public/` for SPA routing on Cloudflare

**Cloudflare Pages build settings:**
| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `app` |

**Environment variables** (Settings → Environment variables → Production + Preview):
- `VITE_SUPABASE_URL` = `https://ybjbsylocgqcgghmgxeh.supabase.co`
- `VITE_SUPABASE_ANON_KEY` = (from `app/.env.local`)

---

### [2026-03-14] — Supabase Pro + Multi-User

- **Supabase upgraded to Pro plan** — expanded storage and compute for real-world use
- **Multi-user approach:** RLS policies are already user_id-scoped. New users sign up at `/signup`. No schema changes needed. Each user sees only their own scrapbooks.
- **Signup flow:** `/signup` is a public route (outside AuthGate) with email + password + confirm. Supabase sends email confirmation. Text the URL to new family members to onboard.

---

### [2026-03-14] — FFmpeg WASM + FastStart Remux

- **@ffmpeg/ffmpeg + @ffmpeg/util v0.12** added as dependencies
- **Singleton loader:** `app/src/lib/remux.js` — `loadFFmpeg()` and `remuxWithFaststart(file)`
- **CDN source:** `https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd`
- **First-launch init screen:** `AppInit` component in `App.jsx` — shows branded "Setting up your experience · This only happens once" on first app open while FFmpeg downloads. Subsequent launches load FFmpeg silently in the background.
- **Marker:** `localStorage` key `cassette_ff_ready` — set after first successful load
- **Intake flow change:** Step now: select clips → remux all clips with FastStart → upload + extract thumbnails
- **What FastStart does:** Moves the MP4 `moov` atom to the front of the file so video can start playing before fully downloaded. No re-encoding. No quality loss. Purely a metadata restructure.
- **Why not re-encode:** iPhone files are large (100MB+). Re-encoding on mobile would take 20+ minutes and drain battery. FastStart is a 1–2s operation with the same result for streaming purposes.
- `vite.config.js` exclusion: `optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'] }` (prevents Vite from trying to bundle WASM)

---

### [2026-03-14] — Poster Thumbnails

- At intake, first frame of each video extracted as JPEG using canvas
- Uploaded to `cassette-media/{userId}/posters/{clipId}.jpg`
- Stored as `thumbnail_url` in `clips` table
- Used as `poster` attribute on `<video>` elements in Playback and Discovery — eliminates blank black frames before video loads

---

### [2026-03-14] — Export as MP4

- **Built:** Export scrapbook as a single MP4 download
- **Pipeline:** `app/src/lib/export.js` — `exportScrapbook(clips, onProgress)` → Blob
  1. For each clip: fetch from Supabase Storage → write to FFmpeg virtual FS → trim with `-ss {trim_in} -t {duration} -c copy` → delete raw file
  2. Write `list.txt` → `ffmpeg -f concat -safe 0 -i list.txt -c copy output.mp4`
  3. Read output → return Blob → trigger Web Share API or download fallback
- **Progress:** phases `fetching` → `trimming` → `stitching` → `done` shown as overlay in PlaybackScreen
- **Captions NOT exported** — they are overlay metadata, not burned into video. Action sheet notes this. A future v2 could re-encode with captions baked in.
- **Share:** Web Share API (`navigator.share` with File) → falls back to `<a download>` if not supported
- **Access point:** PlaybackScreen three-dot menu → "Export Scrapbook"

---

### [2026-03-14] — Playback + Discovery UX Improvements

- **Hold-to-pause:** 200ms hold threshold. `holdOccurredRef` bridges touchEnd → onClick to prevent navigation after hold. `wasPlayingBeforeHold` restores state on release.
- **Pause overlay removed:** Screen freezes cleanly with no visual change on pause (no amber button)
- **Scrub bar:** Touch bottom 25% of screen → amber timeline appears. Drag to seek. `scrubActiveRef` ref controls this mode.
- **Discovery horizontal swipe:** Side-swipe navigates between scrapbooks. Vertical swipe navigates clips within a scrapbook. 30% screen width threshold. Rubber-band at boundaries.
- **Video preloading:** `preload="auto"` on adjacent (prev/next) video elements. Browser HTTP cache shared — preloaded content serves instantly when main video element requests same URL.

---

### [2026-03-15] — FFmpeg Loading: Final Architecture (Hard-Won)

**Problem:** `@ffmpeg/ffmpeg` v0.12 consistently failed with `"failed to import ffmpeg-core.js"` in production on Cloudflare Pages.

**Root causes discovered (in order):**
1. Original CDN approach (`jsdelivr.net` via `toBlobURL`) — failed; CDN unreliable in production worker context
2. `COEP: credentialless` header added to fix SharedArrayBuffer — broke CDN fetch, replaced one error with another
3. Self-hosting via Cloudflare Pages — blocked by **25MB per-file limit** (ffmpeg-core.wasm is 31MB)
4. Direct Supabase URL without `toBlobURL` — worker dynamic `import()` fails without correct MIME type enforcement
5. Supabase URL + `toBlobURL` without COOP/COEP — SharedArrayBuffer unavailable, FFmpeg init fails

**Final working configuration (all three parts required together):**
- **Files hosted in Supabase Storage:** `cassette-media/ffmpeg/ffmpeg-core.js` + `ffmpeg-core.wasm` — no size limits, public bucket, CORS built in. Uploaded once via Supabase Dashboard UI from `node_modules/@ffmpeg/core/dist/umd/`.
- **`toBlobURL()`** in `remux.js` — fetches files and creates same-origin blob URLs, forcing correct MIME types (`text/javascript`, `application/wasm`) so the worker's dynamic `import()` succeeds.
- **`_headers` file** with `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: credentialless` — enables SharedArrayBuffer (required by FFmpeg WASM) without blocking cross-origin Supabase fetches. `credentialless` is essential — `require-corp` would break Supabase storage access.

**Key constraint:** All three pieces must be present. Remove any one and FFmpeg fails.

**For local dev:** `node copy-ffmpeg.js` copies files from `node_modules/@ffmpeg/core/dist/umd/` to `public/ffmpeg/`. That directory is gitignored.

---

### [2026-03-14] — Orphan Storage Cleanup

- When a clip is removed in Workspace, `removeClip` now extracts the storage path from `video_url` and `thumbnail_url` and calls `supabase.storage.from('cassette-media').remove([...paths])` after the DB row delete.
- Previously only the DB row was deleted, leaving orphan files in storage.

---

## ✅ Completed Feature Backlog

| Feature | Notes |
|---|---|
| Year tag on Home | User sets year at intake (← YEAR →), collapsible year groups on Home. SQL: `ALTER TABLE scrapbooks ADD COLUMN year integer;` |
| Cover photo | Intake step 2 picker + Home card "Change cover" option. Uploads to `cassette-media/{userId}/covers/{scrapbookId}.ext` |
| Caption drag placement | Caption mode expands preview full-screen. Caption draggable on frame, saves caption_x/caption_y. |
| Discovery screen | `/discover` — shuffled playlist of all clips. Swipe up/down, tap for scrapbook info + "Watch scrapbook →". Reshuffle button. |

---

## 🔨 Feature Backlog (Approved, Not Yet Built)

| # | Feature | Notes |
|---|---|---|
| 1 | **Reorder 2-step → 1-step UX** | Tap to select + same gesture drags. Hard: `onClick` fires after `touchend`. Parked. |
| 2 | **Rename scrapbook** | From Home card options menu or Playback action sheet. Simple text input sheet. |
| 3 | **Delete clip storage on remove** | ✅ Done — `removeClip` in WorkspaceScreen now deletes video + thumbnail from storage. |

---

## 💡 Parking Lot (Good Ideas, Not Yet)

- **First-time user tutorial / tip screen** — on first login, show a brief guide: how playback works, how to trim, that captions won't export, clip length limits, etc. Could be a swipeable card stack or a simple overlay.
- **Caption burning on export** — re-encode captioned clips to bake text into the video. Slow on mobile but complete. v2 of export.
- **Video compression on upload** — iPhone videos are large (100MB+). Client-side canvas re-encode or server-side worker would dramatically improve load speed. Biggest real-world performance lever.
- **Cover image extraction** — auto-pull first frame. Needs canvas extraction or server processing.
- **Background music / audio track** — v2.
- **Multi-user / shared scrapbooks** — requires data model rethink. v2.
- **Public share links (grandparent view)** — read-only link. High value, v2.
- **Native iOS app** — if PWA proves too limiting for video handling.
- **Light mode** — not a Cassette experience. Maybe never.
- **Scrapbook sharing between users** — share a scrapbook with another Cassette user (e.g. husband/wife) so they can view it in their own account. Requires a `shared_scrapbooks` join table or invite link system. High value for families.
