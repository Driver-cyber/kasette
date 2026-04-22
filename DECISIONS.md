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

**Current phase:** Working v1 in active family use. Upload performance overhauled. **Two-repo strategy active:** web PWA continues as the feature lab; native iOS (Expo) underway as `kasette-native`. Goal: unlisted App Store app for family and close friends. See [2026-04-22] platform strategy entry.

---

## 🛠 Active Tech Stack

| Layer | Decision | Rationale |
|---|---|---|
| Frontend | React + Vite | Fast dev loop, component model fits the screen architecture |
| Styling | Tailwind CSS | Mobile-first utilities, speed over pixel perfection |
| Auth | Supabase Auth | Single family account, persistent login |
| Storage | Cloudflare R2 | All uploads + deletes go through R2 via `lib/r2.js` + Cloudflare Worker (`kassette/worker/`). Migrated from Supabase Storage 2026-04-09. Checkpoint 4 complete 2026-04-15. |
| Database | Supabase Postgres | Scrapbook/clip metadata |
| Deployment | Cloudflare Pages | CD from main branch via GitHub |
| State | React Context | No Redux until complexity demands it |
| Routing | React Router v7 | URL-based. iOS swipe-back works for free. Refresh preserves screen. |
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

### [2026-03-15] — FFmpeg Loading: Final Architecture (Hard-Won, Confirmed Working)

**Problem:** `@ffmpeg/ffmpeg` v0.12 consistently failed with `"failed to import ffmpeg-core.js"` in production on Cloudflare Pages.

**Root causes discovered (in order):**
1. Original CDN approach (`jsdelivr.net` via `toBlobURL`) — failed; CDN unreliable in production worker context
2. `COEP: credentialless` header — caused `toBlobURL`'s default `fetch()` to return **opaque responses** (empty body) for cross-origin resources. Empty blob → `importScripts(emptyBlob)` → `createFFmpegCore` never defined.
3. Self-hosting via Cloudflare Pages — blocked by **25MB per-file limit** (ffmpeg-core.wasm is 31MB)
4. UMD vs ESM mismatch — the `@ffmpeg/ffmpeg` worker is an **ES module**. ES module workers cannot call `importScripts()`, so they fall back to `await import(blobURL)`. Dynamic `import()` needs `export default` — only the **ESM** version of `ffmpeg-core.js` has this. The UMD version silently fails.

**Final working configuration (all three parts required together):**
- **ESM files in Supabase Storage:** `cassette-media/ffmpeg/ffmpeg-core.js` + `ffmpeg-core.wasm` — uploaded from `node_modules/@ffmpeg/core/dist/esm/` (NOT `umd/`). WASM is identical between both directories.
- **Custom `fetchToBlobURL()`** in `remux.js` using `fetch(url, { mode: 'cors', credentials: 'omit' })` — forces a real CORS request so Supabase responds with accessible body. Do NOT use `toBlobURL` from `@ffmpeg/util`.
- **`_headers` file** with `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: credentialless` — enables SharedArrayBuffer. `credentialless` (not `require-corp`) allows Supabase fetches to work.

**Key constraint:** All three pieces must be present. Remove any one and FFmpeg fails.

**Status: ✅ CONFIRMED WORKING as of 2026-03-15.** Export produces a playable MP4, Save/Share delivers to device.

**For local dev:** `node copy-ffmpeg.js` copies files from `node_modules/@ffmpeg/core/dist/umd/` to `public/ffmpeg/`. That directory is gitignored.

---

### [2026-03-14] — Orphan Storage Cleanup *(superseded 2026-04-16)*

- Original approach: extract path from `video_url`/`thumbnail_url`, call `supabase.storage.remove()`.
- **Superseded by `lib/mediaDelete.js` → `safeDeleteClipFiles(clips)`** — R2-aware, cross-scrapbook reference check. All three delete sites (ScrapbookDetailScreen, HomeScreen, WorkspaceScreen) now call `safeDeleteClipFiles` instead of `deleteFromR2` directly.

---

### [2026-03-15] — Export as MP4: Save/Share Fixed

- `handleShare` in PlaybackScreen wrapped in try/catch — `navigator.share()` was silently throwing on desktop (dismissed or unsupported), leaving button dead
- Anchor download fallback fixed: `document.body.appendChild(a)` before `.click()`, then `removeChild` — non-DOM anchors are unreliable in some browsers
- On mobile: native share sheet. On desktop: file download.

---

### [2026-03-15] — Supabase Storage Limits Updated

- **Max upload size per file raised to 2GB** (was 50MB default) — bucket setting in Supabase Dashboard
- Pro plan includes 100GB storage total. Track usage at Settings → Billing → Storage Size.
- At typical iPhone video bitrates: 50MB ≈ 15–40 sec; 500MB ≈ 3–6 min; 2GB = full long events

---

### [2026-03-15] — Scrapbook Sharing ✅ Complete

**Feature:** Share a scrapbook with another Cassette user by username. View-only. Auto-appears in recipient's library.

**Data model:**
```sql
scrapbook_shares (id, scrapbook_id, owner_id, shared_with_id, seen, created_at)
-- UNIQUE(scrapbook_id, shared_with_id)
```

**RLS:** Owners manage their shares (ALL). Shared users can SELECT + UPDATE (seen flag only). Scrapbooks + clips SELECT policies extended to allow shared users to read.

**RPCs:** `get_user_id_by_email`, `get_scrapbook_shares(p_scrapbook_id)`, `get_user_id_by_username(p_username)` — all SECURITY DEFINER.

**UI built:**
- PlaybackScreen ⋯ → "Share Scrapbook" (owner only) → navigates to ShareScreen
- `ShareScreen` (`/scrapbook/:id/share`) — lists who has access with initial avatar + X to remove, username input to add new people
- HomeScreen "Shared with you" collapsible section — amber NEW badge on unseen shares, marks seen on tap, shared cards have `•••` menu → "Remove from Library"

**Bug fixed:** Shared section was nested inside own-scrapbooks branch — recipients with empty library saw empty state instead of shared cards.

---

### [2026-03-16] — Auto-Share Defaults ✅ Complete

**Feature:** Users configure a global list of people who automatically receive access to every new scrapbook they create. Managed from a new Settings screen.

**New DB table (user runs SQL in Supabase):**
```sql
sharing_defaults (id, user_id, recipient_id, created_at)
-- UNIQUE(user_id, recipient_id)
-- RLS: user_id = auth.uid() on SELECT/INSERT/DELETE
-- ON DELETE CASCADE on both FK columns
```

**UI:** Gear icon in Home header (far right, order: shuffle → search → gear) → `/settings` route → `SettingsScreen.jsx`
- Add by username → two-step: resolves name, then shows radio toggle: *New scrapbooks only* vs *All scrapbooks (N)* (defaults to all — retroactive bulk-inserts `scrapbook_shares`)
- Remove → bottom sheet with radio toggle: *Stop future shares only* vs *Remove all access · N scrapbooks* (defaults to all, sienna styling)
- Footnote: "To share a single scrapbook, use the ⋯ menu inside that scrapbook."

**IntakeScreen hook:** After scrapbook INSERT, silently fetches `sharing_defaults` and bulk-inserts `scrapbook_shares` rows. Wrapped in try/catch — never blocks creation.

**Per-scrapbook unsharing is fully compatible:** auto-share fires once at creation. Owner can remove a recipient from a specific scrapbook via ShareScreen; that row is deleted but the default is untouched. Next scrapbook auto-shares to them again. Enables "share everything by default, opt specific ones out."

**Family members:** Chad (creator), Joelle, Holly, Danielle (Chad's mom).

---

### [2026-03-16] — Family Feedback Sprint ✅ Complete

**Fixes shipped:**
- **InstallPrompt** — Step 1 now shows both ⋯ menu (newer iPhones) and Share button (older iPhones) with labels
- **ShareScreen names** — enriches share list with `profiles` table client-side; shows `display_name → username → email`
- **PlaybackScreen loading** — `videoLoading` state + `onLoadStart/onCanPlay/onWaiting` events + amber spinner overlay on current video
- **Edit access blocked for shared recipients** — PlaybackScreen Edit button wrapped in `{isOwner && ...}`; WorkspaceScreen now fetches `user_id`, checks ownership, redirects non-owners to playback
- **Rename scrapbook** — "Rename" option in Home card ⋯ menu → bottom sheet with pre-filled input
- **Error boundary** — `ErrorBoundary.jsx` wraps entire app; JS crashes show friendly "Reload" screen instead of white screen
- **Cover cache-busting** — `cacheControl: '0'` + `?v=timestamp` on cover uploads so family sees changes immediately

---

### [2026-03-16] — Shared Scrapbook Self-Remove ✅ Complete

**Feature:** Recipients of a shared scrapbook can remove their own access from the HomeScreen.

**UI:** Shared scrapbook cards now show a `•••` (MoreHorizontal) button in the top-left corner, matching the owner card treatment. Tapping it opens a bottom sheet with a single action: "Remove from Library" (sienna/danger styling, subtitle: "You'll no longer have access to this scrapbook"). Tapping it immediately removes the card (optimistic UI) and deletes the `scrapbook_shares` row. Owner is not notified.

**Implementation:** `HomeScreen.jsx` — ScrapbookCard `•••` button condition changed from `!readOnly` to `!!onOptionsPress`, so any card with a handler gets the button. Shared cards pass `onOptionsPress={() => setSharedOptionsShareId(share.id)}`. New state: `sharedOptionsShareId`. New function: `removeFromLibrary(shareId)`. New bottom sheet renders when `sharedOptionsShareId` is set.

**No DB changes required** — existing RLS already allows shared users to DELETE their own rows from `scrapbook_shares`.

---

### [2026-03-15] — Username Login ✅ Complete

**Feature:** Users sign in by first name (e.g. "chad", "joelle") instead of email.

**Data model:**
```sql
profiles (user_id, username UNIQUE, display_name, created_at)
```

**How it works:**
- `profiles` table maps username → user_id. Public read (needed for login lookup).
- `handle_new_user()` trigger (SECURITY DEFINER SET search_path = public) auto-inserts profile row on every new signup, reading `raw_user_meta_data` for username + display_name.
- `get_email_by_username(p_username)` RPC — login screen calls this if input has no `@`, gets the real email, then signs in via Supabase Auth normally.
- `check_username_available(p_username)` RPC — signup checks before submitting.
- `get_user_id_by_username(p_username)` RPC — ShareScreen uses this for sharing by name.

**LoginScreen:** Single "Name or email" field. If no `@`, does username lookup first.
**SignupScreen:** "Your name" field + username preview + email (labelled "for account recovery") + password.
**Existing accounts:** Chad + Joelle backfilled via direct INSERT into profiles.

**Note:** Email is still the Supabase Auth credential under the hood. Password reset emails go to the real email address.

---

---

### [2026-03-27] — Scrapbook Detail Screen

**New screen at `/scrapbook/:id` (previously `/scrapbook/:id` went straight to playback).**

Acts as a menu/hub for a scrapbook:
- Hero cover photo (or gradient fallback)
- `Watch` (primary CTA) → triggers cassette reel loading animation (2.5s min + first clip preloaded) → navigates to `/scrapbook/:id/watch`
- `Edit`, `Share`, `Export`, `Rename`, `Change Cover Photo`, `Delete Scrapbook`
- Owner-only actions gated by `session.user.id === scrapbook.user_id`

**Route table updated:**
```
/scrapbook/:id         → ScrapbookDetailScreen (new hub)
/scrapbook/:id/watch   → PlaybackScreen
/scrapbook/:id/edit    → WorkspaceScreen
/scrapbook/:id/share   → ShareScreen
```

**Cassette reel loading animation:** Two SVG reels spinning in opposite directions (2.1s / 1.7s). `Promise.all([minDelay 2500ms, preloadClips(clips, 1)])` gates the Watch navigation — screen is branded + blobs are ready on arrival.

---

### [2026-03-27] — Workspace Major Overhaul

**Crafting Drawer (the header row above the clip cards):**

Three tappable mode toggles: `[TRIM] | [SPLIT] | [TOOLS]`
- **TRIM:** expands full filmstrip with amber drag handles for in/out points
- **SPLIT:** expands filmstrip with draggable sienna marker; "Cut here" button creates two clip records sharing same `storage_path`; `removeClip` guards storage deletion if path is shared
- **TOOLS:** reveals tool row (Caption · Mute · Add Clips · Reorder · Remove) — collapsed by default
- Right side shows trim timestamps when TRIM or SPLIT is active

**Mini clip timeline:** Always visible between crafting drawer and clip cards. 6px amber track showing kept region, trimmed regions darker, white playhead hairline, amber tick marks at in/out points. Collapses when TRIM/SPLIT expand.

**Horizontal clip strip:** Replaces vertical clip list. Scrollable row of 64×64px square cards showing clip number, status icons (Scissors/Type/VolumeX), and duration below. Active card gets amber border + tint. Auto-scrolls to active card on change.

**Reorder mode:** Tapping Reorder activates full-screen vertical drag-and-drop list (existing touch/mouse drag logic). Horizontal strip hidden in reorder mode.

**Undo button:** Amber circle icon in nav header to the left of Save. Appears only when an undoable action exists. Single-level undo covering: trim (restores in/out), mute (toggles back), caption (restores text/position/size), split (deletes new clip, restores trim_out and clip orders). Cleared when switching clips.

**Save button:** Replaced Watch button in workspace nav header. Navigates to `/scrapbook/:id` (detail screen). Changes are auto-saved throughout so Save is a navigation action, not a write action.

**Clip swipe navigation:** Swipe left/right on the preview zone to navigate between clips. `touch-action: pan-y` prevents iOS swipe-back conflict.

**Split persistence fix:** Order-shift of existing clips now happens BEFORE inserting the new clip to avoid unique constraint violations on `order` column.

**Add Clips flow:** IntakeScreen supports `?addTo={scrapbookId}` param — skips naming sheet, uploads to existing scrapbook, offsets order from existing clip count.

---

### [2026-03-27] — Performance Architecture: Blob Cache + Data Cache

**`app/src/lib/blobCache.js`:** Module-level Map cache. `preloadClip(url)` fetches the video file as a Blob and stores a `blob:` URL. `getBlob(url)` returns the cached URL synchronously (or original URL as fallback). `preloadClips(clips, n)` preloads first N clips (awaitable — used to gate navigation). `preloadRest(clips, from)` fire-and-forget preloads the remainder.

**`app/src/lib/dataCache.js`:** Module-level Map cache. `cacheScrapbook(id, sb, clips)` stores fetched data. `getCached(id)` returns it. ScrapbookDetailScreen populates the cache on fetch. WorkspaceScreen and PlaybackScreen check cache first → render immediately with no loading spinner → background-refresh from DB to stay in sync.

**Poster thumbnails:** All `<video>` elements across WorkspaceScreen, PlaybackScreen, and DiscoveryScreen now have `poster={clip.thumbnail_url}` — shows the first-frame thumbnail instead of a black screen while the video loads.

**WorkspaceScreen blob integration:** Uses `getBlob()` for video.src (benefits from blobs pre-fetched by ScrapbookDetailScreen). Calls `preloadRest(clips, 0)` on mount and `preloadClip(adjacent)` when switching clips. `preload="auto"`.

**Wake Lock API:** IntakeScreen requests `navigator.wakeLock.request('screen')` when upload starts. Re-acquired on `visibilitychange` if screen was locked mid-upload. Prevents failed uploads from iPhone auto-locking.

---

### [2026-03-27] — Playback Performance Fixes

**DiscoveryScreen infinite spinner fixed:** `loadClips()` was defined as a `useCallback` but never invoked — there was no `useEffect` to call it. Added `useEffect(() => { loadClips() }, [loadClips])`. Affected both normal and Remix modes.

**Blob preloading — concurrent is correct:** Briefly changed `preloadRest` to sequential (each clip waits for the previous to finish) thinking it would reduce bandwidth competition. Reverted — sequential was worse. With sequential, clips 2, 3, 4 don't even start downloading until earlier clips are 100% done. With concurrent, all clips make progress simultaneously. Supabase/Cloudflare use HTTP/2 which multiplexes requests anyway. **`preloadRest` must remain concurrent (fire-and-forget forEach).**

**PlaybackScreen clip transition:** Added `setVideoLoading(true)` at the start of the clip-change `useEffect` (before setting `video.src`) so the loading overlay shows immediately. Replaced the amber spinner overlay with the clip's `thumbnail_url` as an `<img>` overlay — so instead of a black flash + spinner, the thumbnail shows as a seamless bridge until the video decodes its first frame. Spinner remains as fallback if no thumbnail.

**ScrapbookDetailScreen Watch animation:** Settled at **2000ms** minimum for the cassette reel loading animation (was 2500ms original, tested 1500ms, landed at 2000ms). Gives enough time for blobs to preload while still feeling snappy.

---

### [2026-03-29] — RemixScreen → Film Fest Redesign

**Renamed and redesigned** the Remix feature at `/remix` (`RemixScreen.jsx`) as a **Film Fest** library filter workspace.

**What changed:**
- Old: clip count stepper + shuffle + "Making it groovy" → random Discovery session
- New: multi-select year/month filters → Watch loads all matching clips in order → navigates to DiscoveryScreen with `{ isRemix: true, screenTitle: 'Film Fest' }`

**New layout:**
- Header: Library back (left) + Surprise Me pill (right, amber outline)
- Body: "Film Fest" italic Fraunces display title + "Filter your film" section with `MultiSelectDropdown` for years and months
- Bottom bar: Watch (amber CTA, full-width half) + Download (outlined half)

**Stubs (coming soon modal):**
- **Download** button — future export feature
- **Surprise Me** button — future random/remix feature (replaces old shuffle logic)

**DiscoveryScreen update:** `screenTitle` added to route state — pill in header is now dynamic (`location.state?.screenTitle || 'The Remix'`). Film Fest sessions show "Film Fest" pill.

**MultiSelectDropdown pattern:** Checkbox-style list with an "All X" option that clears selection. When nothing is selected, the button label says "All Years" / "All Months". Can be reused elsewhere.

**Why:** The old Remix screen was a single-purpose shuffle tool. Film Fest turns `/remix` into a general-purpose viewing workspace — family can filter by time period and watch a curated slice of their library.

---

### [2026-03-29] — Cancel Button on Loading / Processing Screens

**Pattern:** All loading/processing overlay screens now have an X button (top-right, `absolute top-14 right-5`) that lets the user bail out without waiting.

**IntakeScreen upload overlay:**
- `cancelledRef` (useRef) is set to `true` on cancel; checked at the start of each remux and upload loop iteration
- `handleCancel()` sets the ref, releases the wake lock, hides the overlay (`setUploading(false)`), and navigates back (`/scrapbook/:id/edit` if adding to existing scrapbook, `/` otherwise)
- Prevents orphaned loop iterations from firing navigate or state updates after cancellation

**RemixScreen "Making it groovy" screen:**
- Cancel button sets `cancelledRef.current = true` and `setPhase('studio')` — returns to the studio screen, no navigation
- After the `await Promise.all([minDelay, firstReady])` resolves, a `cancelledRef` check prevents the `navigate('/discover')` from firing if user already cancelled

**Why:** Joelle testing — she tapped "Create Scrapbook" accidentally with wrong clips selected. No way to stop it. Now she can.

---

### [2026-03-29] — UI Polish: No-Zoom, Upload Overlay, Year/Month Dropdowns

**Disable zoom on all screens:** Added `maximum-scale=1.0, user-scalable=no` to the global viewport meta in `index.html`. Prevents double-tap zoom on RemixScreen and everywhere else.

**Intake upload overlay redesigned:**
- Replaced spinner with the cassette reel animation (same spinning SVG reels from RemixScreen)
- Progress bar now lerps smoothly using a `setInterval` every 80ms: `smoothPct += (target - smoothPct) * 0.05`
- Remuxing phase maps to 0–40%; uploading phase maps to 40–95%
- Headline is italic Fraunces: "Getting ready…" / "Saving memories…" / "Adding clips…"
- No more stall-then-jump — the bar moves constantly throughout the whole process

**Year/month picker — `PickerDropdown` component:**
- Replaced chevron steppers in both IntakeScreen (name sheet) and HomeScreen (Rename & Redate sheet) with a custom branded dropdown
- Tap to open a scrollable list; selected option highlighted amber; tap outside to close
- Year list: current year down to 2015 (newest first). Month list in rename sheet includes `···` (null) as first option.
- Component defined locally in each file — not a shared util (used in only 2 places)

---

### [2026-03-29] — Workspace: Watch Button + Back Navigation + Saved Flash

- **Watch button replaces Save in WorkspaceScreen nav header.** Tapping Watch navigates to `/scrapbook/:id/watch` (PlaybackScreen). Changes are always auto-saved via `saveClipChanges` so a separate Save action is redundant.
- **Back button now navigates to `/scrapbook/:id` (ScrapbookDetailScreen)** instead of the home library. "Library" label changed to "Back".
- **"saved" flash indicator:** A small amber `saved` text appears to the left of Watch for 2.5s after any `saveClipChanges` call, confirming auto-save fired. Implemented via `savedFlash` boolean state + `savedFlashTimer` ref.

**Why:** Joelle testing — she didn't know changes were being saved automatically and was confused by the Save button re-navigating to the detail screen instead of playback.

---

### [2026-03-29] — Split Tool: 3-Step Trim-Middle-Out Redesign

**Previous flow:** Single marker → "Set cut point" → switches to TRIM mode with 4 handles (2 outer trim + 2 inner cut). Confusing to test users.

**New flow — self-contained 3 steps:**
1. SPLIT activated → single draggable bar at ~30% position; button says **"Set Split 1 · {time}"**
2. "Set Split 1" → bar 1 locks (faded sienna, pointer-events-none); bar 2 spawns ~30% further; excluded zone shaded between bars; button says **"Set Split 2 · {time}"**
3. "Set Split 2" → button changes to filled amber **"Confirm & Cut"**
4. "Confirm & Cut" → saves `cut_in`/`cut_out` (sorted so cut_in < cut_out) → exits split mode

State: `splitStep` (1|2|3), `splitPct` (active bar %), `splitPct1` (locked bar 1 %). Both reset when SPLIT is toggled on. `advanceSplitStep()` handles all three steps — do not reintroduce old `confirmSplitPoint()`.

If clip already has `cut_in`/`cut_out`, button shows **"Remove cut"** as before (no step flow).

**Why:** Joelle testing showed the old mode-switch flow was confusing. New flow is linear and self-explanatory without leaving split mode.

---

### [2026-03-29] — Home Screen: Two-Tab Redesign with Year/Month Folders

**Old layout:** Single flat list (or year-grouped list) of all scrapbooks.

**New layout: Two tabs**

**"Your Scrapbooks" tab:**
- Two-level collapsible hierarchy: Year folder → Month subfolders
- Collapsed year shows inline month preview: `2026  Jun · Mar · ···`
- On first load: current year + most recent month auto-expanded; everything else collapsed
- Scrapbooks without a `month` value fall into `···` bucket at the bottom of their year
- Collapse state: `collapsedYears` (Set of year ints) + `collapsedMonths` (Set of "year-month" strings)
- FAB (+) only visible on this tab

**"Shared" tab:**
- Amber dot notification on tab button when any share has `seen: false`
- **Feed view** (default): flat list sorted by scrapbook year/month desc; each card shows "from {ownerName}"
- **By Person view**: collapsible folder per owner; amber dot on folder if unseen items; all folders start open when switching to this view
- Owner names fetched from `profiles` table via `owner_id`

**Rename → Rename & Redate sheet:**
- Name input + year stepper + month stepper
- Month stepper wraps: going below January → `···` (null), above `···` → January
- Allows retroactive assignment of old scrapbooks to a month folder

**Data model addition:**
```sql
ALTER TABLE scrapbooks ADD COLUMN IF NOT EXISTS month INTEGER;
```
`scrapbooks.month INTEGER` — nullable, 1–12. `null` = ungrouped `···` bucket.

IntakeScreen month picker: auto-sets from earliest clip date; user can adjust before creating.

**Why:** Joelle testing — flat list was getting hard to navigate as library grew.

---

### [2026-03-28] — Swipe Transition + Pause-on-Swipe Fixes

**Thumbnail preloading:** `<img>` tags rendering during a swipe fire network requests and show blank until loaded. Fixed by eagerly preloading all thumbnail URLs via `new Image()` immediately when the clip list loads — both in DiscoveryScreen (`loadClips`) and in RemixScreen during the "Making it groovy" phase. Browser caches the images so they're instant by first swipe.

**RemixScreen groovy phase extended:** Now waits for 3 video blobs (was 1) + 4s minimum (was 3s) before navigating to Discovery. Gives substantially more cache warmth before the user starts swiping.

**Pause on swipe:** Both DiscoveryScreen and PlaybackScreen now pause immediately on `touchStart` (finger down) instead of waiting 200ms for the hold timer. Hold timer retained only for `holdActiveRef`/`holdOccurredRef` (distinguishes long-press from tap so it doesn't trigger navigation on release). On `touchEnd`: committed swipe → new clip plays via `useEffect`; spring-back or boundary tap → resumes current clip. Removed the early-return pattern in PlaybackScreen's `handleTouchEnd` that was blocking swipe navigation after a pause.

---

### [2026-03-28] — Split Tool Rebuilt: Single-Clip Middle Cut

**Redesigned from split-into-two-clips to a single-clip cut with 4 trim handles.**

**Why:** Creating two separate clip records sharing a video URL was fragile (order constraints, undo complexity). Chad wanted to remove a middle section from a clip without adding a new record.

**New data model:** Two new nullable float columns on `clips`: `cut_in` and `cut_out`. When set, playback skips from `cut_in` to `cut_out`.

**UX flow:**
1. SPLIT button → single sienna marker (same as before), drag to position
2. "Set cut point" confirm → saves `cut_in = cut_out = splitTime`, transitions to TRIM mode
3. TRIM mode shows 4 independent handles: amber trim_in/trim_out (outer edges) + sienna cut_in/cut_out (inner pair, start stacked — drag apart to widen the cut)
4. Cut region shown as dark overlay in both filmstrip and mini timeline
5. SPLIT button when cut already exists → shows "Remove split" button only (no marker)
6. Undo supported via existing 'clip' snapshot type

**Playback:** `handleTimeUpdate` in WorkspaceScreen and PlaybackScreen skips from `cut_in` to `cut_out`. DiscoveryScreen also handles it.

---

### [2026-03-28] — Workspace Mini Timeline: Scrub Bar

Mini timeline (no-tool mode) is now a draggable scrub bar. The white playhead is a visible 12px dot. Drag anywhere on the track to jump to that point in the clip — no need to replay from start to review a trim.

---

### [2026-03-28] — Discovery/Remix Playback Improvements

**Blob cache:** DiscoveryScreen was not using `getBlob()` at all — all video src was raw URLs. Fixed: `getBlob()` for active clip, `preloadClip()` for adjacent, `preloadRest()` on playlist load (both Remix and Discovery modes).

**Thumbnail overlay:** Same `videoLoading` + thumbnail `<img>` overlay pattern as PlaybackScreen — masks black flash on clip transition.

**Swipe transition:** Prev/next clip thumbnails rendered as siblings of the sliding video container (not children). Each tracks `dragOffset` with matching `translateX` math so they slide in from the sides during drag. Children-inside approach caused overflow clipping.

**Auto-advance:** `handleTimeUpdate` now calls `goNext()` when clip ends instead of looping. Remix plays through all clips in sequence.

**cut_in/cut_out:** DiscoveryScreen SELECT includes new columns; `handleTimeUpdate` skips cut region.

---

### [2026-03-28] — Workspace: Time Labels Moved to Crafting Drawer

Trim timestamps (`trimIn → trimOut · kept`) were shown below the mini timeline scrub bar. Moved them into the crafting drawer header row — always visible alongside TRIM / SPLIT / TOOLS regardless of which mode is active. Colors: amber when trim is applied, muted rust when untrimmed. Removed the labels from below the scrub bar entirely.

---

### [2026-03-28] — PlaybackScreen: Reduced Blank Screen Between Clips

**Problem:** Visible loading spinner + blank screen between clips, especially past clip 2-3 in a scrapbook.

**Root causes fixed:**
- `onWaiting` was triggering the loading overlay on any brief mid-clip stall — too aggressive. Removed.
- `setVideoLoading(true)` was always set on clip change, even when the blob was already in cache. Now checks `blobUrl.startsWith('blob:')` — skips overlay if blob is ready.
- `preloadRest(clips, 0)` was missing from PlaybackScreen. Only next/prev were being preloaded one at a time. Now fires on both cache-hit load and fresh fetch so all clips download concurrently in the background.
- Added `onPlaying` to clear `videoLoading` (was only clearing on `onCanPlay`).

---

### [2026-03-27] — The Remix *(SUPERSEDED — redesigned as Film Fest, 2026-03-29)*

Original random clip stepper at `/remix`. Replaced by the Film Fest multi-filter workspace. Surprise Me (random mode) lives on as a pill within Film Fest. See Film Fest entries below.

---

## ✅ Completed Feature Backlog

| Feature | Notes |
|---|---|
| Year tag on Home | User sets year at intake (← YEAR →), collapsible year groups on Home. |
| Cover photo | Intake step 2 picker + Home card "Change cover" option. |
| Caption drag placement | Caption mode expands preview full-screen. Draggable on frame, saves x/y. |
| Discovery screen | `/discover` — shuffled playlist of all clips. Swipe. |
| Export as MP4 | FFmpeg trim + concat → Web Share API or download. ✅ Working. |
| Multi-user / signup | `/signup` public route, RLS user_id-scoped. |
| Scrapbook sharing | Share by username. ShareScreen. Shared with you on Home. ✅ |
| Username login | Sign in as "chad" or "joelle". profiles table + trigger + RPCs. ✅ |
| Rename scrapbook | Home card ⋯ menu → bottom sheet. ✅ |
| Auto-share defaults | Settings screen. Global defaults auto-share new scrapbooks. ✅ |
| Error boundary | Wraps entire app. Friendly reload on crash. ✅ |
| Scrapbook detail screen | Hub screen at `/scrapbook/:id` with Watch/Edit/Share/Export/Rename/Cover/Delete. ✅ |
| Workspace overhaul | Crafting drawer, horizontal clip strip, TRIM/SPLIT/TOOLS, mini timeline, Undo, Save. ✅ |
| Blob + data cache | Zero-latency video playback + instant workspace/playback open. ✅ |
| Wake Lock API | Prevents upload failures from iPhone screen lock. ✅ |
| The Remix | `/remix` studio + cassette loading + shuffled clip playback. ✅ |
| Add clips to existing scrapbook | IntakeScreen `?addTo=` param. ✅ |
| Workspace Watch/Back/Saved-flash | Watch navigates to playback. Back → detail screen. "saved" flash confirms auto-save. ✅ |
| Split tool redesign (3-step middle cut) | Set Split 1 → Set Split 2 → Confirm & Cut. cut_in/cut_out saved. ✅ |
| Home two-tab + year/month folders | Your Scrapbooks (collapsible year/month) + Shared (Feed + By Person). scrapbooks.month column. ✅ |
| UI polish (zoom, upload, dropdowns) | No-zoom viewport, cassette reel upload overlay with smooth lerping progress, PickerDropdown for year/month. ✅ |

---

## 🔨 Feature Backlog (Approved, Not Yet Built)

| # | Feature | Notes |
|---|---|---|
| 1 | **Native iOS app (Expo) — `kasette-native`** | Goal: unlisted App Store listing (direct link, not searchable). Apple Dev account purchased 2026-04-22. Expo/React Native — reuses React + Supabase/R2 layer. Unlocks: instant photo library thumbnails, hardware encoding (10–100× faster than WASM), background URLSession uploads. Sellable clone considered later — separate repo, rebrand, new Supabase project. See [2026-04-22] platform strategy entry. |
| 2 | **Film Fest server-side export** | "Download" button in Film Fest (currently Coming Soon). Cloudflare Worker + FFmpeg concat all selected clips → streams back a single MP4. Needs Worker memory budget planning for large files. |
| 3 | **Reorder 2-step → 1-step UX** | Tap to select + same gesture drags. Hard: `onClick` fires after `touchend`. Parked but wanted. |

---

## 💡 Parking Lot (Good Ideas, Not Yet)

- **Video compression on upload** — iPhone videos are 100MB+. Client-side canvas re-encode or server Worker re-encode. Biggest performance lever remaining.
- **Caption burning on export** — re-encode captioned clips to bake text into video. Metadata already stored correctly. v2.
- **Public share links (grandparent view)** — read-only link, no account needed. High value, v2.
- **Reopen closed year** — no UI for this yet. Currently users can only close, not reopen. Low priority.
- **Skeleton loading cards** on Home — polish, replaces spinner. Low effort.
- **Toast notifications** — replaces inline status text (e.g. "Share added ✓"). Medium.
- **Supabase image transforms for thumbnails** — append `?width=400` to cover/thumbnail URLs. Faster Home load.
- **Background music / audio track** — v2.
- **Native iOS app** — ✅ Approved, moved to Feature Backlog [2026-04-22].
- **Light mode** — not a Cassette experience. Maybe never.

---

## 🔍 Code Review — [2026-03-15]

Full review of all source files after v1 feature completion.

### Bugs / Risks (fix soon)

**1. Wrong signOut redirect in HomeScreen**
`HomeScreen` version popup calls `navigate('/login')` after `signOut()`, but there is no `/login` route. `AuthGate` handles the redirect automatically when session goes null. Fix: remove the `navigate('/login')` call — let AuthGate do its job.

**2. Cover image cache too long**
Cover uploads use `cacheControl: '3600'` (1 hour). If a user changes a cover, others won't see the update for up to an hour. Fix: use `cacheControl: '0'` on cover uploads, or append a `?v=timestamp` query string to bust the cache after upload.

**3. No error boundary**
If any screen throws a JS error, the entire app goes white. No recovery path. Fix: wrap `<App>` routes in a React `ErrorBoundary` component that shows a friendly "Something went wrong — tap to reload" screen.

**4. `export.js` virtual FS not cleaned up on error**
The FFmpeg virtual filesystem accumulates input files if an export fails mid-way. No `try/finally` cleanup. Low risk today (export runs rarely), but will cause mysterious failures if the WASM FS fills up over time.

**5. ShareScreen avatar can throw if email is empty**
`share.email[0].toUpperCase()` — if the RPC ever returns a row with a null/empty email (e.g. a user with no email on record), this throws. Fix: `(share.email?.[0] ?? '?').toUpperCase()`.

**6. Tech stack table says React Router v6 — it's actually v7**
Minor doc inconsistency in the `Active Tech Stack` table above.

---

### [2026-03-29] — Code Review: Bug Fixes Across 6 Files

Full codebase review pass. All fixes in commit `fd68cfa`.

**Critical fixes:**

- **WorkspaceScreen — `activeDragCleanup` ref pattern:** All 6 drag handlers (`startTrimDrag`, `startSplitDrag`, `startMiniScrub`, `startCaptionDrag`, `startDragFromTouch`, `startDragFromMouse`) now store a cleanup fn in `activeDragCleanup = useRef(null)` immediately after adding `document` listeners. A single `useEffect(() => () => activeDragCleanup.current?.(), [])` fires on unmount. Each `onEnd` clears the ref. **All future drag features must follow this pattern.**

- **WorkspaceScreen — `toggleMute` was writing to a non-existent DB column:** `muted` has no column in `clips`. The old code called `saveClipChanges(id, { muted })` which silently failed at Supabase. Fixed: `toggleMute` is sync, sets `video.muted` immediately, calls `updateClipLocal` only, never touches the DB. See also: performance_arch memory.

- **PlaybackScreen — `scrubActiveRef` not cleared on unmount:** Navigating away mid-scrub left the ref `true`, blocking swipe navigation on next mount. Fixed: cleanup effect resets `scrubActiveRef` and clears `holdTimerRef` on unmount.

**Other fixes:**

- **WorkspaceScreen — `saveClipChanges`** now checks `{ error }` from Supabase, reverts local state on failure, skips false "saved" flash.
- **PlaybackScreen + DiscoveryScreen** — all preload `<video>` refs now have `onerror` handlers that fall back to the direct URL on blob failure (no more silent black screen).
- **DiscoveryScreen** — `location.state` added to `loadClips` useCallback deps so Film Fest re-navigations with a new clip set always reload.
- **PlaybackScreen** — hold-to-pause cancel threshold increased 5px → 15px.
- **SettingsScreen** — retroactive share `upsert` failure now rolls back the `sharing_defaults` insert.
- **HomeScreen** — cover upload failure now reverts the optimistic data URL preview.
- **dataCache** — `MAX_ENTRIES = 10` with oldest-entry eviction prevents unbounded Map growth.

---

### [2026-03-29] — Screen Inventory Doc + Stale Route Fixes

**`cassette-screens.html` created** as a founding reference doc in the repo root. Shows all 11 screens with card descriptions (name, route, file, status, feature tags) plus a compact quick-reference table. Desktop alias created at `/Users/ordocfo/Desktop/cassette-screens.html`. Added to `CLAUDE.md` Maintenance Rules and `memory/feedback_docs.md` — keep updated whenever screens are added, renamed, rerouted, or removed.

**CLAUDE.md stale routes corrected:**
- Screen count: "9 Screens" → "11 Screens" (Login + Signup were missing from the count)
- `/intake` → `/scrapbook/:id/intake`
- `/scrapbook/:id/edit` → `/scrapbook/:id/workspace`
- `/discover` → `/discovery`
- `/login` added to route table (was missing)

---

### Architecture Observations (good patterns to keep)

- **`activeDragCleanup` ref pattern** — every drag handler that attaches to `document` must store its cleanup in `activeDragCleanup.current`. Do not add new drag features without this.
- **Stale closure fix** (capture values before `setClips`) — correctly and consistently applied in trim, reorder, and caption drag interactions. Do not regress this.
- **Document-level drag listeners** — correct approach. React's `onTouchMove` is passive; document-level lets you call `preventDefault()` to block scroll. Keep this pattern for all future drag features.
- **FFmpeg singleton + custom `fetchToBlobURL`** — hard-won. Do not touch without good reason. The three-piece constraint (ESM files + custom fetch + COOP/COEP headers) must all stay in place.
- **Optimistic UI with rollback** — HomeScreen cover change and WorkspaceScreen clip edits capture prev state before optimistic update and revert on error. All future optimistic updates must follow this pattern.
- **RLS everywhere** — all tables scoped to `user_id`. Correct. Don't add any table without RLS.
- **Lazy screen loading** — all screens are `React.lazy` + `Suspense`. Build stays lean.

### Performance Notes

- **Video preloading** — `preload="auto"` on prev/next clips is aggressive on slow connections. Consider `preload="metadata"` for the clip that's 2 positions ahead, and `preload="auto"` only for immediate prev/next.
- **No image optimization** — cover images and thumbnails are stored and served full-size from Supabase Storage. Supabase has image transforms (add `?width=400` to any public URL). Home card thumbnails should use this.
- **`sharedScrapbooks` has no loading state** — if the shares query is slow, the "Shared with you" section just doesn't appear yet with no indicator. Minor, but noticeable on first load.

### UX Improvements for Next Session

| Idea | Effort | Value |
|---|---|---|
| **Rename scrapbook** | Low | High — already approved |
| **Pull-to-refresh on Home** | Low | High — natural iOS pattern |
| **Skeleton loading cards** | Medium | Medium — polish, replaces spinner |
| **Toast notifications** | Medium | Medium — replaces inline status text (e.g. "Share added ✓") |
| **Swipe-to-delete on scrapbook cards** | Medium | Medium — more intuitive than ⋯ menu |
| **Error boundary screen** | Low | High — prevents white-screen crashes |
| **Supabase image transforms for thumbnails** | Low | Medium — faster Home load |
| **Cover cache-busting** | Low | Medium — fixes stale cover display |
| **Haptic feedback** | Low | Low/Medium — `navigator.vibrate()` on key taps |
| **Offline indicator banner** | Low | Medium — graceful network loss handling |
| **"New clips" badge on shared scrapbooks** | High | High — v2 sharing enhancement |

---

### [2026-04-09] — Surprise Me Feature + Discovery Screen Cleanup

**Surprise Me — LIVE**

Replaced the "coming soon" stub on the Film Fest Surprise Me pill with a real random clip mode.

**Data model change:**
```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS surprise_me_include_shared boolean DEFAULT false;
```

**RemixScreen changes:**
- `CLIP_SELECT` constant at top of file — shared by `handleWatch` and `handleSurpriseMe` to avoid duplicate Supabase select strings
- `prewarm()` fires on mount alongside year fetch: queries all own clip URLs (lightweight), shuffles, starts `preloadClip()` + thumbnail preload on 5 random clips. Warms blob cache before user taps Surprise Me.
- `handleSurpriseMe()`: fetches `profiles.surprise_me_include_shared` + own clips in parallel. If setting on, also queries `scrapbook_shares` for shared clips. Shuffles full pool, picks 10–15 random clips (`Math.floor(Math.random() * 6) + 10`). Same preload + 2s min delay as Film Fest Watch. Navigates to DiscoveryScreen with `screenTitle: 'Surprise Me'`.
- Loading screen: phase `'loading-surprise'` shows "Rolling the dice… / Picking a mix just for you" vs Film Fest's text.

**SettingsScreen changes:**
- New "Surprise Me" section with include-shared toggle
- iOS toggle pattern: 44×26px track, 20×20px wheat knob, 3px padding on all sides. OFF = `#4A2E18` track, ON = `#F2A24A` (amber) track. Wheat (`#F5DEB3`) knob always. Fully contained knob — no overflow.
- Optimistic toggle saves to `profiles.surprise_me_include_shared`.

**DiscoveryScreen changes (remix mode only):**
- Top-right Disc3 button: no longer navigates back to `/remix`. Now opens bottom sheet (`scrapbookSheet` state) with current clip's scrapbook name + year, "Go to this scrapbook" CTA (amber), and "Stay in [screenTitle]" cancel. Warning copy: "Heading there will exit [screenTitle]."
- Bottom scrapbook info (name + Watch → link): hidden in `isRemix` mode. Normal library Discovery unchanged.
- Sheet closes on backdrop tap.

**Toggle visual pattern (canonical going forward):**
```jsx
// Track: fixed px dimensions, not Tailwind w-/h- classes (avoids knob overflow)
// Knob: absolute, top: 3, width/height: 20, translateX(3px) off / translateX(21px) on
// Wheat knob always — OFF dark track vs ON amber track = clear state distinction
```

---

## [2026-04-09] Photo Support in Scrapbooks

**Decision:** Scrapbooks now support photos alongside videos.

**What was built:**

**DB:**
```sql
ALTER TABLE clips ADD COLUMN IF NOT EXISTS media_type TEXT NOT NULL DEFAULT 'video';
```

**IntakeScreen:**
- File picker now accepts `video/*,image/*`
- Photos skip FFmpeg remux — uploaded directly
- `getPhotoMeta()` extracts a data URL thumbnail from the image (no video element needed)
- Photos get `thumbnail_url = video_url` (same file, no separate thumb upload)
- Photo `duration` defaults to 5 seconds (user-configurable in Workspace)
- `media_type: 'photo'` stored on clip row

**WorkspaceScreen:**
- Photo clips show a static `<img>` in the preview zone instead of `<video>`
- Play/pause button hidden for photos
- Trim and Split tabs hidden — only **Tools** shows in the drawer header
- Header right side shows `Photo · Xs` instead of trim timestamps
- Mini timeline shows a static full amber bar (no scrub handles)
- Tools row: Mute removed (photos have no audio); Caption, Add Clips, Reorder, Remove remain
- **Display Duration stepper** appears below the tools row for photo clips: −/+ buttons, 1–30s range, saves to `duration` + `trim_out` columns
- Clip strip cards show a small `Image` icon badge for photo clips

**PlaybackScreen:**
- Photo clips render `<img>` in all three sliding slots (prev/current/next)
- Auto-advance timer fires after `clip.duration` seconds (5s default)
- Progress bar animates over the display duration via `setInterval`
- Play/pause button hidden; scrub blocked for photos
- Scrapbook name + clip counter still visible during photo display

**Data model note:** For photo clips, `video_url` holds the image URL. `thumbnail_url` = same value. `duration` = display seconds (not media duration). `trim_in = 0`, `trim_out = duration`.

---

### [2026-04-16] — Session: UX Polish + Home Library Redesign + Film Fest Select

**R2 confirmed working:** Test scrapbook created, clips uploaded, workspace used, export produced a working MP4. Full R2 migration verified end-to-end.

**Workspace: Save replaces Watch**
- Amber "▶ Watch" → "✓ Save". Navigates to `/scrapbook/:id` (detail screen) on tap.
- Why: "Watch" implied playback was about to start, which was confusing after editing.

**Cover image optimization**
- `resizeCoverImage(file, maxWidth=800)` helper added to both `HomeScreen` and `ScrapbookDetailScreen`. Canvas-resizes all new cover uploads to max 800px wide, 85% JPEG, before uploading to R2. Always stored as `.jpg`.

**Pull-to-refresh on Home**
- Touch handlers on `<main ref={mainRef}>` scroll container. Pull down from top → amber spinner fades in → release past 52px threshold → re-fetches own scrapbooks. Springs back if released early.

**Home library: months as flat headings**
- Month folders (collapsible) removed entirely. Months are now flat rust uppercase headings with a thin divider line between them.
- `collapsedMonths` state and `toggleMonth` function removed from HomeScreen.
- Only years remain collapsible. `initDone` simplified to just collapse non-current years.

**IntakeScreen: month picker removed**
- Month PickerDropdown removed from the name sheet. Month still auto-sets silently from the earliest clip's `recorded_at` and is saved to the DB row.
- User sets name + year only at intake. Month is editable later from the detail screen.

**ScrapbookDetailScreen: Rename & Redate**
- "Rename" button expanded to "Rename & Redate" — sheet now includes year + month PickerDropdowns alongside the name input.
- `handleRename` saves `{ name, year, month }` together.

**Film Fest: scrapbook select screen (phase `'select'`)**
- "Watch" on Film Fest no longer goes straight to the loading screen. It fetches matching scrapbooks and shows a select list (new `'select'` phase in `RemixScreen`).
- List shows all matching scrapbooks with cover thumb + name + date + clip count + amber checkbox, all pre-checked.
- User unchecks any scrapbooks they don't want. "Watch · N scrapbooks" button at bottom launches.
- "Filters" back button returns to the studio screen. Cancel from loading screen returns to select screen (not studio).
- `loadingSourceRef` tracks which phase to cancel back to.

**Combine-to-scrapbook: reference R2 files, don't copy ✅ Done**
- New clip rows reference same R2 `video_url`/`thumbnail_url`. No re-encoding, no file duplication.
- Delete guard implemented: `lib/mediaDelete.js` → `safeDeleteClipFiles()`. See Film Fest #3 entry.

---

## [2026-04-09] R2 Storage Migration (Checkpoints 1–3)

**Decision:** Migrate all media storage from Supabase Storage → Cloudflare R2.

**Why:** Free egress (vs Supabase egress fees at scale), Cloudflare edge CDN for faster global delivery, and prerequisite for Film Fest export (server-side video concat needs direct R2 access from a Worker).

**What was done:**
- Created `cassette-media` R2 bucket with public access enabled
- Wrote `kassette/scripts/migrate-to-r2.js` — downloads all files from Supabase Storage via service role key, uploads to R2 via S3-compatible API, generates `migration-mapping.json` + `migration-update.sql`
- Migrated 69 files (39 videos, 27 thumbnails, 3 covers) — zero failures
- Ran `migration-update.sql` in Supabase SQL editor — all `video_url`, `thumbnail_url`, `cover_image_url` columns now point to R2 URLs

**R2 config:**
- Bucket: `cassette-media`
- Public URL: `https://pub-bab6003c5bee4548b6a48fc2eca4583a.r2.dev`
- Account ID: `72f8fd10fc39dcf4ee7a608fecbbadfe`
- Credentials stored in: `kassette/scripts/.env` (gitignored)

**Checkpoint 4 — COMPLETE (2026-04-15):**
- Created `kassette/worker/` — Cloudflare Worker deployed at `cassette-worker.cstewch.workers.dev`
- Endpoints: `POST /upload?key=…` (streams file body → R2 bucket binding), `DELETE /delete?key=…` (R2 bucket binding)
- Created `kassette/app/src/lib/r2.js` — `uploadToR2(key, file)` and `deleteFromR2(urls[])` helpers
- Updated IntakeScreen, HomeScreen, ScrapbookDetailScreen to use `uploadToR2`
- Updated WorkspaceScreen, HomeScreen, ScrapbookDetailScreen to use `deleteFromR2`
- Auth: `X-Upload-Secret` header — shared secret between frontend (`VITE_UPLOAD_SECRET`) and Worker (`UPLOAD_SECRET` secret)
- Upload flow: Browser → Worker (streams body) → R2 bucket binding. No presigned URLs, no S3 CORS issues.
- Worker secrets set via `wrangler secret put` (6 secrets: UPLOAD_SECRET, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL)
- App env vars in Cloudflare Pages + `.env.local`: `VITE_WORKER_URL`, `VITE_UPLOAD_SECRET`

---

### [2026-04-16] — Film Fest #2: Saved Filter Configurations

**What was built:**
- `film_fest_saves` table added to Supabase (`id, user_id, name, filter_config jsonb, created_at` + RLS `user_id = auth.uid()`)
- Bookmark icon added to Film Fest studio header (center, between ← Library and Surprise Me)
- Icon is dim/wheat when no saves, amber with partial fill when saves exist
- Opens a bottom sheet ("Saved Filters") with list of saved configs
- Each row: config name + year/month summary label; tap to load filters; X to delete
- "Save current filters" button at sheet bottom → inline name input → INSERT to `film_fest_saves`
- Saved configs fetched on mount alongside available years

**Design decisions:**
- Store `{ years: int[], months: int[] }` in `filter_config` jsonb — simple, no scrapbook IDs (those are transient)
- Bookmark icon state (dim vs amber) gives instant feedback that saves exist without opening the sheet
- Save input is inline in the sheet (not a separate modal) — less friction


---

### [2026-04-16] — Film Fest #3: Combine to New Scrapbook + Delete Guard

**What was built:**

**1. `lib/mediaDelete.js` — `safeDeleteClipFiles(clips)`**
- New utility replacing all direct `deleteFromR2` calls at clip/scrapbook deletion sites
- Before deleting any R2 file, queries `clips` table to check if any OTHER clip rows still reference the same `video_url` or `thumbnail_url`
- Only calls `deleteFromR2` on URLs with zero remaining references
- Updated: `ScrapbookDetailScreen.handleDelete`, `HomeScreen.deleteScrapbook`, `WorkspaceScreen.removeClip`
- This is the safety layer that makes combined scrapbooks safe — original R2 files are never orphaned

**2. Film Fest "Save as Scrapbook" — combine flow**
- "Save as Scrapbook" bordered button added alongside "Watch · N" on the Film Fest select screen
- Tapping opens a bottom sheet: editable name input (auto-suggested: "2025 Mixtape"), clip+scrapbook count summary, "Create Scrapbook" CTA
- `handleCombine()`: creates new scrapbook record, fetches clips from checked source scrapbooks with full metadata (`recorded_at`, `media_type` included), inserts copies with new IDs + sequential `order`
- Clip ordering: follows user's checked scrapbook order from select screen, then clip order within each
- Year: min year from checked scrapbooks. Month: only set if all checked scrapbooks share same year AND month
- Cover image: first checked scrapbook's cover_image_url
- On success: navigates to `/scrapbook/{newId}` (the new scrapbook detail screen)
- No re-encoding, no R2 copies — new clip rows point to same R2 files as sources

**Key design decisions:**
- Clips are linked (not copied): new clip rows, same R2 URLs. Zero extra storage cost.
- Delete guard (`safeDeleteClipFiles`) is the protection layer — Film Fest never deletes, only adds
- If source scrapbook is later deleted by the user: `safeDeleteClipFiles` checks references first, R2 files survive as long as combined scrapbook's clips reference them
- "Clips are linked, not copied. Original scrapbooks are unchanged." shown in combine sheet


---

### [2026-04-16] — Film Fest #4: Year Close + Annual Cassette

**What was built:**

**New Supabase table (user must run SQL):**
```sql
CREATE TABLE IF NOT EXISTS closed_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  year int NOT NULL,
  cassette_scrapbook_id uuid REFERENCES scrapbooks(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, year)
);
ALTER TABLE closed_years ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own closed years" ON closed_years FOR ALL USING (user_id = auth.uid());
```

**HomeScreen changes:**
- Year header restructured from single `<button>` to `<div>` with two independent interactive elements
- Left: collapse/expand button (chevron + year label + amber check badge if closed)
- Right side logic:
  - Closed + has cassette → amber "{year} Cassette" pill navigates to that scrapbook
  - Not closed + collapsed → month preview text (unchanged)
  - Not closed + expanded → dim circle "close year" button (Check icon)
- `closedYears` state: `{ [year]: { id, cassette_scrapbook_id } }` fetched on mount

**Close year sheet (two options):**
1. "Create {year} Cassette" (amber) — calls `handleCloseYear(true)`:
   - Creates new scrapbook named "{year} Cassette", year=year, month=null
   - Fetches all clips from that year's scrapbooks with full metadata
   - Sorts chronologically (Jan → Dec, ungrouped last)
   - Batch INSERTs clip rows (same R2 URLs, protected by safeDeleteClipFiles)
   - Inserts `closed_years` record with `cassette_scrapbook_id`
   - Navigates to new scrapbook
2. "Just close the year" (bordered) — calls `handleCloseYear(false)`:
   - Inserts `closed_years` record with null `cassette_scrapbook_id`
   - Year row gets amber check badge, no navigation

**Design decisions:**
- Annual Cassette is named "{year} Cassette" — short, on-brand, matches app name
- `ON DELETE SET NULL` on `cassette_scrapbook_id` FK: if user deletes the Annual Cassette scrapbook, the year stays "closed" (badge remains), the cassette pill just disappears
- Year close is personal organization only — no sharing or permissions changes
- No "reopen year" UI in this version (can be added if needed)

---

### [2026-04-19] — Bug Fixes, Auth Flow, UX Polish

**Bug fix: "Could not save clips" (Film Fest Mixtape + Annual Cassette)**
- Root cause: `clips` table has `storage_path TEXT NOT NULL`. Both `handleCombine` (RemixScreen) and `handleCloseYear` (HomeScreen) were inserting clip rows without it — every insert failed silently.
- Fix: added `storage_path` to both the SELECT query and the INSERT rows in both functions.
- Also added null-safety fallbacks (`?? 0`, `?? 50`, `?? 85`, `?? 24`) for other NOT NULL columns with defaults (`trim_in`, `caption_x`, `caption_y`, `caption_size`).
- **This same pattern applies to any future feature that copies clip rows.**

**UI fixes:**
- Combine sheet ("Save as New Scrapbook"): removed `autoFocus` so keyboard doesn't pop on open and hide content. Sheet is now scrollable with `overflow-y-auto maxHeight:85dvh` and safe-area bottom padding.
- Close year sheet: changed `pb-10` to `paddingBottom: max(2.5rem, env(safe-area-inset-bottom))` — fixes home indicator cutoff on iPhone.
- DiscoveryScreen: added loading spinner overlay when `videoLoading` is true (on top of thumbnail placeholder) so users know a clip is buffering vs stuck.
- Film Fest loading screen: subtitle now shows "Loading N clips…" instead of generic text.
- Film Fest studio: "Clear" button appears in top-right of filter section when any filter is active; clears both dropdowns in one tap.

**Auth flow: Login screen completed**
- Added "Create Account" outlined button + divider below Sign In form → navigates to `/signup`.
- Added "Forgot password?" link → inline reset screen (email input → `supabase.auth.resetPasswordForEmail` → "Check your email" confirmation).

**New screen: ResetPasswordScreen (`/reset-password`)**
- Public route (alongside `/signup`) — outside AuthGate.
- Listens for Supabase `PASSWORD_RECOVERY` auth event from URL hash token.
- 4 states: spinner (waiting for token), password+confirm form, "Link expired" (4s timeout), success + "Open Cassette" button.
- Calls `supabase.auth.updateUser({ password })` on submit.

**Supabase email (pending, not yet done):**
- Default Supabase email is `no-reply@mail.app.supabase.io`, ~3/hour limit, hits spam.
- Fix: configure custom SMTP in Supabase Dashboard → Auth → SMTP Settings using Resend (already set up with `chadstewartcpa.com`). Create a new Resend API key named "Cassette", use `smtp.resend.com:465`, sender `noreply@chadstewartcpa.com`. No code changes needed.

---

### [2026-04-22] — Upload Performance Overhaul: Background Queue + Early Navigation

**Problem:** Creating a scrapbook blocked on a full-screen overlay while ALL clips uploaded — for a 15-clip batch this meant 10+ minutes before the user could do anything. Every tapped "Create" felt like the app froze.

**Goal:** Get from "Create Scrapbook" tap to the next screen in under 15 seconds for any batch size.

**Architecture: three-part solution**

**1. Pre-remux clip 1 silently while the user types the name**
- As soon as the name sheet opens (`step === 'name'`), `remuxWithFaststart(selectedItems[0].file)` runs in the background
- Result stored in `preRemuxRef.current` — if ready when user taps Create, remux phase is instant
- Pre-remux targets `selectedItems[0]` exactly — not the first non-photo. Bug: original code used `selectedItems.find(i => i.mediaType !== 'photo')` which caused double-upload in mixed batches. Fixed to `selectedItems[0]` with photo check.
- Pre-remux indicator in name sheet: spinner → amber checkmark when ready. Button always tappable (falls back to inline remux if not ready).

**2. Navigate after clip 1 only**
- `handleCreate` remuxes + uploads clip 1 only, inserts its DB row, then immediately navigates to WorkspaceScreen
- Remaining clips (`selectedItems.slice(1)`) handed off to background context

**3. Global background upload queue (`UploadContext`)**
- New file: `app/src/context/UploadContext.jsx` — React Context that survives navigation
- `startBackgroundUpload({ scrapbookId, clips, userId, concurrency })` — concurrency-limited pool (3 workers, shared index pointer, safe because JS is single-threaded)
- Each task: remux (skip if photo) → upload video → upload thumbnail (non-blocking) → DB insert
- `orderOffset` queried from DB after clip 1 lands, ensuring correct order
- Wake lock: acquired on start, re-acquired on visibilitychange, released on finish/cancel
- `cancel()` sets `cancelledRef`, releases wake lock, sets `isActive: false`
- Wrapped around entire app in `App.jsx` (inside `AuthProvider`, outside `AppInit`)

**New files created:**
- `app/src/components/Reel.jsx` — extracted from IntakeScreen + ScrapbookDetailScreen; `size` prop (default 48) for reuse at different scales
- `app/src/lib/utils.js` — `dataURLtoBlob()` extracted from IntakeScreen so both IntakeScreen and UploadContext can share it

**UploadBanner (App.jsx):**
- `position: fixed, top: 0, z-50` — floats above all screens without requiring layout changes
- Shows amber gradient progress bar + "Uploading N more clips" + Cancel button
- `Reel` component at `size=18` as the icon
- Only renders when `isActive === true`

**WorkspaceScreen changes:**
- Supabase Realtime `postgres_changes` INSERT subscription on `clips` filtered by scrapbook_id
- New clips land in the clip strip in real time as background uploads complete
- `pendingCount` = `totalClips - completedClips` shown below nav header when > 0: "N clips still uploading in the background"

**ScrapbookDetailScreen changes:**
- Shows pulsing amber dot + "Uploading N more clips…" when `isActive && uploadingId === scrapbookId`

**Upload overlay redesigned:**
- Clip 1 progress bar only (not all clips)
- Divider + "N more clips queued" count
- "You can start editing right away" reassurance card when batch > 1

---

### [2026-04-22] — XHR Upload Progress (Real Byte-Level Progress)

**Problem:** `fetch` API has no upload progress events. The clip 1 progress bar sat frozen at 40% for the entire network transfer (10–20s for large iPhone videos), then jumped to 95%.

**Fix:** Replaced `fetch` in `uploadToR2` with `XMLHttpRequest`. `xhr.upload.addEventListener('progress', e => onProgress(e.loaded / e.total))` fires as bytes are sent.

`uploadToR2(key, file, contentType, onProgress)` — `onProgress` is optional. When provided, passes fraction (0–1) to caller. IntakeScreen passes a callback that calls `setUploadProgress({ current: fraction, total: 1 })`, which feeds the existing smooth lerp and moves the bar from 40% → 95% in real time.

Delete calls still use `workerFetch` (no progress needed).

---

### [2026-04-22] — Worker CORS Fix + Retry Logic

**Problem:** `env.BUCKET.put()` exceptions propagated out of the worker's `fetch` handler. Cloudflare returned a raw 500 with no CORS headers. Browser blocked reading the body — `res.text()` returned `""`. Error displayed as "Worker … failed:" with nothing after the colon.

**Fix — worker:** Wrapped `env.BUCKET.put()` and `env.BUCKET.delete()` in try/catch. Errors now return through the `err()` helper which always includes CORS headers. Added `if (!env.BUCKET) return err('R2 bucket not bound', 500)` guard.

**Fix — r2.js:** `workerFetch` retries up to 3 times with exponential backoff (1s, 2s). Auth errors (401) skip retries. Error message now always includes HTTP status: `failed (500): R2 put failed`.

**Worker URL hardcoded as fallback:** `VITE_WORKER_URL || 'https://cassette-worker.cstewch.workers.dev'` — the URL is public (in CLAUDE.md), so hardcoding it prevents env var propagation issues on branch preview deployments from breaking uploads.

**Cloudflare Pages env var note:** Preview deployments require vars set under `Settings → Variables and Secrets → Choose Environment: Preview`, separate from production. Production vars do NOT automatically inherit to preview builds.

---

### [2026-04-22] — Selection Screen: Metadata Loading Indicator

**Problem:** After picking 12 clips, nothing happened visually for ~90 seconds (iOS processing files), then small loading spinners appeared only on visible clips. User had no indication anything was happening.

**What was built:**
- `metaLoaded` / `metaTotal` state in IntakeScreen
- `handleFilePick` sets `metaTotal = files.length`, `metaLoaded = 0`, increments `metaLoaded` as each clip's metadata resolves
- Grid header: while `metaLoaded < metaTotal`, shows amber spinning ring + bold "Loading clip info… X of Y" replacing the quiet rust "X items imported" text
- Clip cards without a thumbnail yet: `animate-pulse` on the background so the grid visually communicates loading state from the first render

**What can't be fixed:** The iOS file hand-off delay (90s freeze before clips appear) is iOS-level, not app-level. The browser only receives files after the native picker closes and iOS finishes decoding/transferring them. No web API exists to pre-grant photo library access or pre-process files before the picker.

---

### [2026-04-22] — Decision: Native iOS App (Expo) is Next Major Build

**Context:** Upload experience on web (PWA) has three hard limits that can't be solved at the browser level:
1. iOS file picker hand-off delay — iOS processes and transfers video files to the browser after the picker closes, causing a ~60–90s freeze before the selection grid appears
2. FFmpeg WASM speed — software remux takes 10–30s per clip; blocks the entire UI thread; can't be parallelized
3. Background upload fragility — wake lock is best-effort; iOS can revoke it when the app is backgrounded or the screen locks

**What a native Expo app unlocks:**
- `expo-media-library` → instant cached thumbnails from iOS photo library, no video decoding delay
- `AVFoundation` hardware H.264 encoding → ~10–100× faster than FFmpeg WASM
- `URLSession` background configuration → true background uploads that survive screen lock and app switching
- Direct `PHAsset` access → no file hand-off from iOS picker

**Decision: Build native iOS app via Expo (React Native)**

Rationale: Expo preserves React knowledge and reuses most business logic (Supabase, R2, data model, screen architecture). The core bottleneck is the media layer — `expo-media-library`, `expo-av`, and native upload APIs replace the three WASM/browser limitations above. Estimated 2–3 months for a feature-complete port.

**Web app stays live** — existing users continue on the PWA during native development. No shutdown.

**Prerequisite:** Validate that today's upload improvements are sufficient for Joelle's current usage patterns before committing to native. If the web experience is workable, native goes into the roadmap but isn't urgent. If upload friction is still a consistent blocker, native moves to immediate next build.

---

### [2026-04-22] — Platform Strategy: Unlisted App Store + Multi-Repo Workflow

**App Store goal:** Unlisted App Store listing — app exists in the App Store system but is not publicly searchable. Distribution by direct link only. Family and close friends via invite. No public listing unless we choose to go to market.

**Sellable clone:** If we ever go to market, clone `kasette-native`, rebrand, new Supabase project, new R2 bucket. Cassette stays private and family-only permanently. Architecture is the asset.

**Apple Developer account:** Purchased 2026-04-22. $99/yr. Enables TestFlight + App Store.

**Two-repo structure:**
- `kasette` — web PWA, active development lab. Fastest iteration, instant Cloudflare Pages deploys. Where features get built and proven.
- `kasette-native` — Expo iOS app. Gets proven features ported in, not experiments. Targets the same Supabase project and R2 bucket — no schema or storage divergence.

**No monorepo.** UI paradigms differ (HTML/CSS vs React Native StyleSheet). Shared assets are the backend and product decisions, not components.

**What transfers from web to native:** React hooks, Context, business logic, `lib/r2.js`, Supabase client/auth.
**What needs rewriting:** All UI components (View/Text/Pressable), navigation (React Navigation), `lib/remux.js` → native AVFoundation encoding.

**Feature lifecycle:**
```
Idea → Build in kasette (web) → Iterate until solid
     → Mark "native: pending" in Cross-Repo Sync Log
     → Port to kasette-native in a dedicated session
     → Mark "native: ✅" in sync log
```

**Session protocol:**
- `kasette-native` sessions start by reading `kasette/DECISIONS.md` as canonical product context
- `kasette-native` has its own DECISIONS.md for native-specific concerns (Expo version, EAS config, plugin choices, build status)
- GitHub Issues in `kasette` is the single feature backlog — labeled `web`, `native`, or `both`
- Supabase schema changes affect both apps — flag explicitly in DECISIONS.md when a migration runs
- Build tracker: `cassette-tracker.html` — two-column priority board, updated each session

---

## 🔄 Cross-Repo Sync Log

Tracks which features have been ported from web to native. Update this whenever a feature ships in either repo.

| Feature | kasette (web) | kasette-native (iOS) | Notes |
|---|---|---|---|
| Auth — login / signup / password reset | ✅ | pending | Same Supabase credentials |
| Home screen — year/month library | ✅ | pending | expo-media-library for thumbnails |
| Intake / upload flow | ✅ | pending | expo-media-library + AVFoundation encoding |
| Playback — Reels-style viewer | ✅ | pending | expo-av |
| Workspace editor | ✅ | pending | Trim, split, captions |
| Scrapbook sharing | ✅ | pending | Same ScrapbookShare table |
| Discovery screen | ✅ | pending | |
| Film Fest / Surprise Me | ✅ | pending | |
| Settings screen | ✅ | pending | |
| Export as MP4 | ✅ | pending | Native share sheet replaces Web Share API |
| Push notifications | — | pending | APNs via Expo Notifications |

---

### [2026-04-22] — Project Dashboard Live + Session Wrap

**Cross-project dashboard deployed:**
- Repo: `driver-cyber/project-dashboard`
- Live at: `project-dashboard-6a7.pages.dev`
- Contains: `project-dashboard.html` (drag-drop tracker files → project cards with staleness tracking) + `workflow/` prompt docs
- `cassette-tracker.html` is dashboard-compatible — drop it onto the dashboard to refresh the Cassette card

**Session workflow established:**
- End of each session: Claude updates `cassette-tracker.html` (priorities + date) and commits
- To refresh the dashboard: download `cassette-tracker.html` from the repo, drop onto `project-dashboard-6a7.pages.dev`
- kasette is private → GitHub API live-fetch won't work without auth; file-upload is the current method

**This session summary (2026-04-22):**
- Analyzed Tiny Path iOS strategy memo → confirmed Expo (not Capacitor) is right for Cassette because core problem is video encoding speed, not install friction
- Apple Developer account purchased
- Platform strategy finalized: unlisted App Store listing, family + close friends by direct link, sellable clone later if needed
- Two-repo workflow documented: kasette = web lab, kasette-native = Expo port
- `cassette-tracker.html` created as founding doc with machine-readable JSON block
- `project-dashboard.html` built and moved to standalone repo, deployed to Cloudflare Pages
- Workflow prompt docs created: `tracker-retrofit-prompt.md`, `new-project-snippet.md`
- CLAUDE.md updated: two-repo context, tracker reading rule, cross-repo sync rule
- DECISIONS.md updated: platform strategy, multi-repo workflow, Cross-Repo Sync Log
