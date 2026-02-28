# Cassette — Project Memory

## Project Location
`/Users/Shared/Claude-Projects/Personal Projects/Casette/`
React app lives in `app/` subdirectory. Design assets (HTML mockups) in root — not deployed.

## Build Status — All 4 Screens Done
- **Login** ✅ tested, working
- **Home** ✅ tested, working (real Supabase data, gradient cards)
- **Intake** ✅ tested, working (full upload flow, thumbnails, progress)
- **Playback** ✅ tested, working (swipe nav, captions, action sheet)
- **Workspace** ✅ written + bugs fixed, not fully user-tested

## Deployment Status — BLOCKED
- GitHub repo: `https://github.com/Driver-cyber/kasette` (private)
- Pushed via GitHub Desktop from `app/` folder
- Cloudflare Pages connected to repo, build settings configured
- **Deployment is failing** — user went to bed before resolving
- First thing next session: open Cloudflare build log, find the error

**Cloudflare build settings:**
- Build command: `npm run build`
- Output dir: `dist`
- Root directory: `app`
- Env vars needed: `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (both added to Production + Preview)

## Supabase
- Project URL: `https://ybjbsylocgqcgghmgxeh.supabase.co`
- Anon key: in `app/.env.local` (gitignored, not in repo — must be set as Cloudflare env var)
- Tables: `scrapbooks`, `clips` with RLS, user_id-scoped
- Storage bucket: `cassette-media` (public)

## Tech Stack
- React 18 + Vite + Tailwind v4 (`@theme` block, `@tailwindcss/vite`)
- React Router v7, Supabase JS v2, Lucide React
- Google Fonts: Fraunces (display/italic) + Plus Jakarta Sans (UI)
- Supabase client: `app/src/lib/supabase.js`
- AuthContext: `app/src/context/AuthContext.jsx`

## Routes
- `/` → HomeScreen
- `/intake` → IntakeScreen
- `/scrapbook/:id` → PlaybackScreen
- `/scrapbook/:id/edit` → WorkspaceScreen

## Brand Tokens (Tailwind)
`bg-walnut`, `bg-walnut-mid`, `bg-walnut-light`, `bg-deep`
`text-amber`, `text-wheat`, `text-rust`, `text-sienna`
`font-display` (Fraunces), `font-sans` (Plus Jakarta Sans)
Lucide icons: `strokeWidth={1.75}`

## Key Patterns
- Bottom sheets: `absolute bottom-0 left-0 right-0 z-20 rounded-t-3xl` inside root div
- Drag interactions: use document-level listeners in closures (NOT React onTouchMove — it's passive)
- Always add both touch AND mouse handlers for drag features (users test on desktop)
- Stale closure fix: capture values as local vars before calling `setClips`/`setXxx`

## Workspace Bugs Fixed (this session)
1. Trim stale closure → use local `currentTrimIn`/`currentTrimOut` vars in drag closure
2. Reorder passive listener → document-level `{ passive: false }` listeners
3. Reorder mouse support → added `onMouseDown` + `mousemove`/`mouseup` listeners
4. Reorder splice race → capture `spliceFrom` before `setClips`, then update ref

## Remaining Work
- **Fix Cloudflare deployment** (first priority next session)
- Workspace: full user-test (trim, caption, reorder, remove)
- Cover image / thumbnail extraction (v1 stretch goal)
- Actual video thumbnails in Workspace clip list (currently gradient placeholders)

## Dev Setup
- Node via Homebrew: `/opt/homebrew/bin/npm`
- Run locally: `cd app && npm run dev`
- No GitHub CLI installed — use GitHub Desktop for pushes
