# Cassette — Project Memory

## Project Location
`/Users/Shared/Claude-Projects/Personal Projects/Casette/`
React app lives in `app/` subdirectory. Design assets (HTML mockups) in root — not deployed.

## Build Status — All Screens Done ✅
- **Login** ✅ — accepts name or email, username lookup via RPC
- **Signup** ✅ — name + username preview + email (recovery only) + password. Trigger auto-creates profile.
- **Home** ✅ — year-grouped cards, collapsible, "Shared with you" collapsible section, NEW badge
- **Intake** ✅ — FFmpeg FastStart remux → upload, poster thumbnails
- **Playback** ✅ — swipe nav, hold-to-pause, scrub bar, export, captions, Share + Export in action sheet
- **Workspace** ✅ — trim handles, caption tool, reorder mode, orphan storage cleanup
- **Discovery** ✅ — horizontal + vertical swipe, hold-to-pause, scrub bar, shuffled playlist
- **Export** ✅ — FFmpeg WASM trim + concat → Web Share API or download
- **ShareScreen** ✅ — `/scrapbook/:id/share`, lists access by username, add/remove individuals

## Routes
- `/` → HomeScreen (protected)
- `/signup` → SignupScreen (**public**, outside AuthGate)
- `/intake` → IntakeScreen (protected)
- `/scrapbook/:id` → PlaybackScreen (protected)
- `/scrapbook/:id/edit` → WorkspaceScreen (protected)
- `/scrapbook/:id/share` → ShareScreen (protected, owner only)
- `/discover` → DiscoveryScreen (protected)

## Supabase
- Plan: **Pro** — project URL: `https://ybjbsylocgqcgghmgxeh.supabase.co`
- Anon key: in `app/.env.local` (gitignored)
- **Tables:** `scrapbooks`, `clips`, `scrapbook_shares`, `profiles` — all RLS-enabled
- Storage bucket: `cassette-media` (public) — **max upload 2GB**, 100GB total on Pro
- **FFmpeg files in Supabase Storage:** `cassette-media/ffmpeg/ffmpeg-core.js` + `ffmpeg-core.wasm`
  - Must be **ESM version** from `node_modules/@ffmpeg/core/dist/esm/` — NOT umd/

## Supabase RPCs (all SECURITY DEFINER)
- `get_user_id_by_email(lookup_email)` — shares legacy, returns uuid
- `get_scrapbook_shares(p_scrapbook_id)` — returns share list with emails for ShareScreen
- `get_email_by_username(p_username)` — login: name → email
- `check_username_available(p_username)` — signup validation
- `get_user_id_by_username(p_username)` — ShareScreen: share by name
- `handle_new_user()` trigger — auto-inserts into profiles on every new auth.users row
  - **Must use** `SECURITY DEFINER SET search_path = public` and `public.profiles` — bare `profiles` fails in Supabase trigger context

## Username Login System
- `profiles` table: `user_id`, `username` (UNIQUE), `display_name`
- Login: type "chad" → `get_email_by_username` → sign in with real email
- Signup: name field → username auto-derived (lowercase, alphanumeric only) → preview shown
- Existing users: chad (`382ec0eb-...`) + joelle (`3e2d3a4b-...`) backfilled directly
- Email still used by Supabase Auth under the hood — password reset goes to real email

## Scrapbook Sharing
- Owner taps ⋯ → "Share Scrapbook" → ShareScreen
- ShareScreen: lists current shares (initial avatar + email), X to remove, username input to add
- Home: "Shared with you" collapsible section, amber NEW badge until tapped, marks `seen=true`
- Shared cards: no options button (view only), can navigate to playback
- Recipient with empty own library: fixed — shared section renders independently of own-scrapbooks branch

## FFmpeg Loading (CONFIRMED WORKING 2026-03-15)
- Custom `fetchToBlobURL()` with `{ mode: 'cors', credentials: 'omit' }` — do NOT use `toBlobURL` from `@ffmpeg/util`
- COOP/COEP headers in `app/public/_headers` — required for SharedArrayBuffer
- All three pieces required together: ESM files + custom fetch + headers

## Deployment
- GitHub repo: `https://github.com/Driver-cyber/kasette` (private)
- Push via **GitHub Desktop** (no GitHub CLI installed)
- Cloudflare Pages: build cmd `npm run build`, output `dist`, root `app`
- Env vars on Cloudflare: `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`
- **Cloudflare 25MB file limit** — cannot host FFmpeg WASM there (31MB), hosted in Supabase Storage instead
- PWA updates automatically on relaunch. If stuck: open Safari → kasette.pages.dev → relaunch.

## Tech Stack
- React 18 + Vite + Tailwind v4 (`@theme` block, `@tailwindcss/vite`)
- React Router v7, Supabase JS v2, Lucide React (`strokeWidth={1.75}`)
- `@ffmpeg/ffmpeg + @ffmpeg/util v0.12` — singleton in `app/src/lib/remux.js`
- Google Fonts: Fraunces (display/italic) + Plus Jakarta Sans (UI)
- `vite.config.js`: `optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'] }`

## Key Files
- `app/src/lib/remux.js` — FFmpeg singleton + `remuxWithFaststart(file)`
- `app/src/lib/export.js` — `exportScrapbook(clips, onProgress)` → Blob
- `app/src/context/AuthContext.jsx` — Auth context, persistent session
- `app/public/_headers` — COOP/COEP headers (required for FFmpeg WASM)
- `app/copy-ffmpeg.js` — copies FFmpeg files from node_modules → public/ffmpeg/ for local dev

## Key Patterns
- Bottom sheets: `absolute bottom-0 left-0 right-0 z-20 rounded-t-3xl` inside root div
- Drag interactions: document-level listeners in closures (NOT React onTouchMove — passive)
- Always add both touch AND mouse handlers for drag features
- Stale closure fix: capture values as local vars before calling `setClips`
- Hold-to-pause: 200ms `setTimeout` → `holdOccurredRef` + `wasPlayingBeforeHold` refs

## Brand Tokens (Tailwind)
`bg-walnut` `bg-walnut-mid` `bg-walnut-light` `bg-deep`
`text-amber` `text-wheat` `text-rust` `text-sienna`
`font-display` (Fraunces) `font-sans` (Plus Jakarta Sans)

## Dev Setup
- Node via Homebrew: `/opt/homebrew/bin/npm`
- Run locally: `cd app && npm run dev`
- Before first run: `node copy-ffmpeg.js` to copy FFmpeg files to `public/ffmpeg/`

## Approved Backlog (not yet built)
- **Rename scrapbook** — from Home card options or Playback action sheet
- **Caption burning on export** — re-encode to bake captions into video. Slow on mobile, parked for v2. Caption data already stored correctly — safe to add captions now.
- **Reorder 1-step UX** — parked, hard due to onClick/touchend conflict
