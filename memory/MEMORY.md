# Cassette — Project Memory

## Project Location
`/Users/Shared/Claude-Projects/Personal Projects/Casette/`
React app lives in `app/` subdirectory. Design assets (HTML mockups) in root — not deployed.

## Build Status — All 6 Screens Done
- **Login** ✅ tested, working
- **Signup** ✅ `/signup` public route, texted to new users to create accounts
- **Home** ✅ tested, working (real Supabase data, gradient cards, year groups)
- **Intake** ✅ tested, working (FFmpeg FastStart remux → upload, poster thumbnails)
- **Playback** ✅ swipe nav, hold-to-pause, scrub bar, export, captions, action sheet
- **Workspace** ✅ trim handles, caption tool, reorder mode, orphan storage cleanup on remove
- **Discovery** ✅ horizontal + vertical swipe, hold-to-pause, scrub bar, shuffled playlist

## Deployment
- GitHub repo: `https://github.com/Driver-cyber/kasette` (private)
- Pushed via GitHub Desktop from `app/` folder
- Cloudflare Pages: build cmd `npm run build`, output `dist`, root `app`
- Env vars on Cloudflare: `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`
- **Cloudflare Pages 25MB file size limit** — cannot host FFmpeg WASM (31MB) there

## Supabase
- Plan: **Pro** (upgraded 2026-03-14)
- Project URL: `https://ybjbsylocgqcgghmgxeh.supabase.co`
- Anon key: in `app/.env.local` (gitignored)
- Tables: `scrapbooks` (has `year` column), `clips` (has `thumbnail_url` column) with RLS, user_id-scoped
- Storage bucket: `cassette-media` (public)
- Multi-user: RLS is user_id-scoped — multiple accounts just work, no code changes needed
- **FFmpeg files hosted in Supabase Storage:** `cassette-media/ffmpeg/ffmpeg-core.js` + `ffmpeg-core.wasm`
  - Uploaded manually via Supabase Dashboard (one-time setup, already done)
  - Source files: `node_modules/@ffmpeg/core/dist/umd/`

## Tech Stack
- React 18 + Vite + Tailwind v4 (`@theme` block, `@tailwindcss/vite`)
- React Router v7, Supabase JS v2, Lucide React
- **@ffmpeg/ffmpeg + @ffmpeg/util v0.12** — singleton in `app/src/lib/remux.js`
- **@ffmpeg/core v0.12.6** — in `package.json` dependencies (used for local dev copy script)
- Google Fonts: Fraunces (display/italic) + Plus Jakarta Sans (UI)
- `vite.config.js`: `optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'] }`

## FFmpeg Loading Strategy (IMPORTANT — hard-won)
- Core files hosted in **Supabase Storage** (not CDN, not Cloudflare Pages — too large)
- Loaded via **`toBlobURL()`** (forces correct MIME types for dynamic import in worker)
- Requires **COOP + COEP: credentialless** headers (`public/_headers`) for SharedArrayBuffer
  - `credentialless` (not `require-corp`) allows Supabase fetches to still work
- `_headers` file: `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: credentialless`
- If FFmpeg loading breaks again: check these three things first

## Routes
- `/` → HomeScreen (protected)
- `/signup` → SignupScreen (**public**, outside AuthGate)
- `/intake` → IntakeScreen (protected)
- `/scrapbook/:id` → PlaybackScreen (protected)
- `/scrapbook/:id/edit` → WorkspaceScreen (protected)
- `/discover` → DiscoveryScreen (protected)

## Key Files
- `app/src/lib/remux.js` — FFmpeg singleton loader + `remuxWithFaststart(file)`
- `app/src/lib/export.js` — `exportScrapbook(clips, onProgress)` → Blob (trim + concat)
- `app/src/lib/supabase.js` — Supabase client
- `app/src/context/AuthContext.jsx` — Auth context, persistent session
- `app/public/_headers` — COOP/COEP headers (required for FFmpeg WASM)
- `app/copy-ffmpeg.js` — copies FFmpeg core files from node_modules to public/ffmpeg/ for local dev

## Key Patterns
- Bottom sheets: `absolute bottom-0 left-0 right-0 z-20 rounded-t-3xl` inside root div
- Drag interactions: document-level listeners in closures (NOT React onTouchMove — passive)
- Always add both touch AND mouse handlers for drag features
- Stale closure fix: capture values as local vars before calling `setClips`
- Hold-to-pause: 200ms `setTimeout` → `holdOccurredRef` + `wasPlayingBeforeHold` refs
- `holdOccurredRef` bridges `touchEnd` → `onClick` to block navigation after hold
- Scrub bar: `clientY > window.innerHeight * 0.75` detection → amber timeline, drag to seek

## Brand Tokens (Tailwind)
`bg-walnut`, `bg-walnut-mid`, `bg-walnut-light`, `bg-deep`
`text-amber`, `text-wheat`, `text-rust`, `text-sienna`
`font-display` (Fraunces), `font-sans` (Plus Jakarta Sans)
Lucide icons: `strokeWidth={1.75}`

## Dev Setup
- Node via Homebrew: `/opt/homebrew/bin/npm`
- Run locally: `cd app && npm run dev`
- No GitHub CLI installed — use GitHub Desktop for pushes
- Before first `npm run dev`: run `node copy-ffmpeg.js` to copy FFmpeg files to `public/ffmpeg/`
