# Cassette → Native Handoff

**Purpose.** Translate the kasette web PWA's UI, interactions, and feel into the
`kasette-native` Expo iOS app without losing what made the PWA loved by its
primary user (mom, iPhone, waiting room, one hand). This folder is the
source-of-truth handoff: each doc here describes how the PWA actually works,
written so a native engineer (or Claude in a combined session) can rebuild it
faithfully in React Native.

This README is the **kickoff brief** — written before the deep per-screen specs
exist, so a combined `kasette` + `kasette-native` session can start already
aligned. The full per-screen specs land in `handoff/screens/` and the
cross-cutting docs at `handoff/00-*.md` (see "Planned structure" below).

---

## The mental model — what Cassette *is*

Cassette is a private family video scrapbook. Mom uploads iPhone videos from
the camera roll in a waiting room. The app's job is to take her hundreds of
unlabeled clips and make them feel curated, loved, and a little bit nostalgic
— like opening a shoebox of old photos. The aesthetic is "golden hour": warm
walnut backgrounds, amber accents, wheat text, Fraunces italic for the
emotional moments. The phrase that holds the whole thing together is
**ordo ab chao** — order from chaos. Functional first, then elegant, then
joyful. Never clinical, never Instagram.

If a native screen feels cold, corporate, or overdesigned, it's wrong even
if it ships the right features.

---

## Screen inventory (12 screens)

> Source files live in `app/src/screens/`. Each will get its own deep-dive
> doc in `handoff/screens/`.

| # | Screen | File | Native priority |
|---|---|---|---|
| 1 | **Home** | `HomeScreen.jsx` | High — IA backbone, two tabs, year folders, pull-to-refresh |
| 2 | **Intake** | `IntakeScreen.jsx` | High — the upload flow; this is the *primary* job |
| 3 | **Scrapbook Detail** | `ScrapbookDetailScreen.jsx` | Medium — hub for Watch/Edit/Share |
| 4 | **Workspace** | `WorkspaceScreen.jsx` | High — densest screen; trim/split/caption/reorder |
| 5 | **Playback** | `PlaybackScreen.jsx` | **Critical** — the payoff. Reels-style viewer. The thing she shows people. |
| 6 | **Discovery** | `DiscoveryScreen.jsx` | Medium — shuffled cross-scrapbook playlist |
| 7 | **Film Fest (Remix)** | `RemixScreen.jsx` | Medium — filter workspace + Surprise Me |
| 8 | **Share** | `ShareScreen.jsx` | Medium — per-scrapbook sharing |
| 9 | **Settings** | `SettingsScreen.jsx` | Low — straightforward |
| 10 | **Login** | `LoginScreen.jsx` | Low — auth |
| 11 | **Signup** | `SignupScreen.jsx` | Low — auth, public route |
| 12 | **Reset Password** | `ResetPasswordScreen.jsx` | Low — auth |

CLAUDE.md says "11 screens" — there are actually 12 once you count
`ResetPasswordScreen.jsx`. Worth a CLAUDE.md correction in a later commit.

---

## Must-inherit priorities (in order)

These are the things to get right in native *first*. Everything else can
iterate.

### 1. The clip-to-clip swipe transition with prerendered next clip
The thing the user specifically called out. In Playback (and Discovery), when
you swipe between clips the **next clip is already loaded** so the incoming
frame drags in cleanly with the gesture — no black space, no flash, no spinner.
This is the single most "wow" interaction in the app. In React Native this
likely means a `FlatList` (or `PagerView` / Reanimated `ScrollView`) with
`windowSize`/`initialNumToRender` tuned high, plus Expo AV `Video` components
mounted for the current + next (+ prev) clip with `shouldPlay={isActive}` and
preloaded sources.

> **Open question for the combined session:** swipe direction. CLAUDE.md says
> "Swipe up/down between clips" (Reels-style vertical). The user described
> it as "Reels-like horizontal." We'll confirm against `PlaybackScreen.jsx`
> and `DiscoveryScreen.jsx` source in the combined session and lock the
> answer in `screens/playback.md`. (Best guess: vertical between clips,
> horizontal between scrapbooks in Discovery.)

### 2. The golden-hour feel
- **Colors**: walnut backgrounds (`#2C1A0E`), amber accents (`#F2A24A`),
  wheat text (`#F5DEB3`), sienna for danger (`#E8855A`). Never light mode.
- **Typography**: Fraunces (serif) for headings/logo/captions, Plus Jakarta
  Sans for everything else. Italic Fraunces reserved for emotional
  moments only. Never system font, never Inter.
- Use the Expo Google Fonts package (`@expo-google-fonts/fraunces`,
  `@expo-google-fonts/plus-jakarta-sans`) — do not substitute.

### 3. Hold-to-pause + scrub bar (Playback)
- Hold 200ms → freezes the frame cleanly (no overlay, no dim).
- Release → resumes if it was playing.
- Touch in the bottom 25% of the screen → amber scrub bar appears, drag to seek.
- These two gestures must coexist without conflict (the timing threshold
  is what disambiguates).

### 4. The Intake upload overlay
- Cassette reel SVG spinning animation (same asset reused in Remix loading).
- **Lerping** progress bar: every 80ms `smoothPct += (target - smoothPct) * 0.05`
  — never the raw value. Eliminates jumpy / stuck-then-leap progress.
- Phase mapping: remuxing = 0–40%, uploading = 40–95%.
- Cancel (X top-right) is real — sets a ref, releases the wake lock, navigates back.

### 5. Caption placement with pinch-to-resize
- Free-placement draggable text overlay on the clip frame.
- Stored as `{ text, caption_x%, caption_y%, caption_size }` per clip.
- Rendered identically in Workspace and Playback (Fraunces italic, wheat,
  text-shadow).

### 6. Pull-to-refresh on Home
- Touch-handled pull-down on the main scroll container, amber spinner slides
  in. RN: use `RefreshControl` with amber `tintColor` and matching brand.

### 7. The Year → Month → Scrapbook hierarchy on Home
- Current year auto-expanded on first load (one-shot via an `initDone` ref).
- Months are *headings*, not folders — small rust uppercase with a thin
  divider. Not clickable. This is intentional and important.
- Collapsed year shows inline month preview: `2026  Jun · Mar · ···`.

### 8. The single-level undo in Workspace
- One `undoable` snapshot, captured pre-change for trim, mute, caption, split.
- Button appears in the nav header only when an undoable action exists.

### 9. The "saved" amber flash
- 2.5s amber text in the Workspace nav after any auto-save fires. Tiny
  detail, huge reassurance.

### 10. Cassette reel loading animation
- Reused across Intake upload, Remix "Making it groovy", Surprise Me
  "Rolling the dice…". The same SVG everywhere — do not reinvent.

---

## Planned doc structure

```
handoff/
├── README.md                         ← this file (kickoff brief)
├── 00-brand-system.md                ← colors, fonts, spacing, iconography, voice
├── 01-navigation-flow.md             ← IA, routes, transitions, back-stack
├── 02-interactions-glossary.md       ← every reusable gesture/pattern with exact behavior
├── 03-data-model.md                  ← schema, RLS, R2 paths, gotchas
└── screens/
    ├── home.md
    ├── intake.md
    ├── scrapbook-detail.md
    ├── workspace.md                  ← densest doc
    ├── playback.md                   ← critical for swipe-transition spec
    ├── discovery.md
    ├── remix-film-fest.md
    ├── share.md
    ├── settings.md
    ├── login.md
    ├── signup.md
    └── reset-password.md
```

Each per-screen doc will contain:

1. **Purpose & user mental model** — why this screen exists, who it's for.
2. **Layout** — top-to-bottom anatomy with measurements (px / pt / %).
3. **State machine** — modes, phases, refs, what triggers what.
4. **Every interaction** — gesture, timing threshold, edge cases.
5. **Animations & micro-feel** — the joyful moments and their exact specs.
6. **Data** — what's fetched, what's written, when.
7. **Empty / loading / error states** — what she sees when things go wrong.
8. **Known gotchas & "why it works"** — the non-obvious decisions.
9. **Native translation notes** — RN/Expo equivalents (FlatList,
   Reanimated, Gesture Handler, Expo AV Video, BottomSheet) and traps to avoid.

---

## Process for the combined session

When you open the combined `kasette` + `kasette-native` session:

1. **Read native current state first.** Look at `App.tsx`, navigation
   setup, `package.json`, any existing screens. Note which RN libraries
   are already in (Reanimated, Gesture Handler, Expo AV, Bottom Sheet,
   etc.) so the handoff docs can recommend those specifically.
2. **Diff against this brief.** For each must-inherit priority above, mark
   one of: ✅ already done in native / ⚠️ partial / ❌ not started /
   🔀 diverged (native chose a different pattern — discuss before re-aligning).
3. **Write the cross-cutting docs first** (`00-brand-system.md`,
   `01-navigation-flow.md`, `02-interactions-glossary.md`, `03-data-model.md`).
   These unblock every screen doc.
4. **Then screens in dependency order**: home → scrapbook-detail →
   playback → intake → workspace → discovery → remix → share → settings →
   auth screens.
5. **Commit in batches** — one commit per cross-cutting doc, one per screen.
   Easier to review and easier to roll back if a section needs rewriting.
6. **Never silently translate** — when a PWA pattern doesn't map cleanly
   to RN (e.g., FFmpeg WASM remuxing), call it out in the screen doc with
   a "Native divergence" subsection and propose options.

---

## Tech translation cheat sheet (preview)

The full mapping lands in `02-interactions-glossary.md`. Quick reference:

| PWA (React + Vite) | Native (Expo) |
|---|---|
| React Router v7 | React Navigation (or Expo Router) |
| `<video>` element | `expo-av` `Video` (or `expo-video` if migrated) |
| `<input type="file" multiple accept="video/*">` | `expo-image-picker` |
| `@ffmpeg/ffmpeg` WASM remux | **Open question** — `ffmpeg-kit-react-native`? Skip remux on native and rely on iOS FastStart? |
| Touch handlers + manual gesture math | `react-native-gesture-handler` + Reanimated worklets |
| CSS animations / transitions | Reanimated `withTiming` / `withSpring` |
| Tailwind v4 utility classes | NativeWind, or StyleSheet with brand tokens |
| Supabase JS SDK | `@supabase/supabase-js` (same; runs fine in RN) |
| R2 via `lib/r2.js` → Cloudflare Worker | Same worker, same R2 — RN just needs the fetch wrapper |
| `localStorage` / `sessionStorage` | `expo-secure-store` (auth) + `AsyncStorage` (cache) |

---

## Open questions to resolve in the combined session

1. **Swipe direction** on Playback (vertical per CLAUDE.md vs horizontal per
   user description). Confirm from source.
2. **Remux strategy** on native — keep FFmpeg WASM via WebView? Use a
   native lib? Skip remux entirely and rely on iOS FastStart-correct output?
3. **Navigation library** — Expo Router or React Navigation? Affects
   how routes get documented.
4. **Bottom sheet library** — `@gorhom/bottom-sheet` is the default
   recommendation for the Intake Step-2 sheet and the Discovery
   scrapbook-info sheet.
5. **Caption rendering during playback** — RN `<Text>` absolute-positioned
   over `Video`, or burn into video on export? PWA does overlay-only; v2
   idea was burn-in for export. Native should match PWA for v1.
6. **Wake lock** during upload — `expo-keep-awake` is the equivalent;
   confirm it's already in.

---

*Last updated: 2026-05-23. Next update: after the combined session reads
the native repo and diffs against this brief.*
