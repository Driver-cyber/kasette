# screens/discovery.md — Discovery

> **What it is.** A shuffled cross-scrapbook playlist viewer. Same
> mechanic as Playback (horizontal swipe between clips, hold-to-pause,
> bottom scrub bar) — but the playlist is a randomized mix of all clips
> across all the user's scrapbooks, not just one scrapbook in order.
>
> Discovery is also the destination for Remix and Surprise Me. Same
> screen, different `screenTitle` and chrome variations driven by
> `isRemix`.

Route: `/discover` *(CLAUDE.md drift: it says `/discovery`)* · File:
`kasette/app/src/screens/DiscoveryScreen.jsx` (612 lines) · Native: not
yet ported.

---

## 1. Purpose & user mental model

She opens Discovery (via the Shuffle icon on Home, or via Remix/Surprise
Me which auto-routes here). She gets a random clip from her whole
library. She swipes — another random clip, from a different scrapbook
entirely. The bottom shows which scrapbook the clip came from and a
"Watch →" link to dive into it.

If she came from Remix, the top chrome shows a different look: a "Film
Fest" or "Surprise Me" pill in the center, an amber Disc3 icon
top-right (instead of a Shuffle reshuffle). Tap the Disc3 → bottom
sheet "Go to this scrapbook" with a warning that doing so exits the
remix mode.

The interactions are 95% the same as Playback — see `screens/playback.md`
for the full vocabulary. This doc focuses on what's *different*.

---

## 2. Layout differences vs Playback

### Library mode (default — from Home Shuffle icon)

```
┌──────────────────────────────────────────────────┐
│  [←]            3 / 47           [⇄ reshuffle]   │  ← top bar w/ counter
│                                                  │
│                                                  │
│              [video full bleed]                  │
│                                                  │
│                                                  │
│              "her caption goes here"             │
│                                                  │
│                                                  │
│  FROM YOUR LIBRARY · 2026                        │  ← eyebrow caps, rust 9px
│  Beach Trip                            Watch →   │  ← scrapbook name + watch link
└──────────────────────────────────────────────────┘
```

### Remix mode (from Film Fest / Surprise Me)

```
┌──────────────────────────────────────────────────┐
│  [←]      [Film Fest pill]       [⃝ Disc3]       │  ← amber Disc3 instead of Shuffle
│                                                  │
│                                                  │
│              [video full bleed]                  │
│                                                  │
│                                                  │
│              "her caption goes here"             │
│                                                  │
│  (bottom info area HIDDEN in remix mode)         │
└──────────────────────────────────────────────────┘
```

### Key differences from Playback

| Aspect | Playback | Discovery |
|---|---|---|
| Top-center | scrapbook name (Fraunces SemiBold 15 px wheat/70) | counter `3 / 47` (sans 11 px tabular wheat/80) OR remix pill "Film Fest" (Fraunces italic 12 px amber) |
| Top-right | ⋯ MoreHorizontal action sheet | Shuffle icon (library) OR Disc3 icon (remix) |
| Bottom area | "Scrapbook name · 3 / 12" + ▶ play button | "FROM YOUR LIBRARY · 2026" + "Watch →" link (library only; hidden in remix) |
| Animation duration | 300 ms | **280 ms** (20 ms faster) |
| Tap-zone navigation | left 25% / right 75% | **same** — but additionally, any quick tap (`< 8 px` offset) navigates based on tap X position (left of midpoint = prev, right = next) |
| Preloaded clips | prev + next | prev + next + **next2** (extra warmth) |
| Hold timer | 200 ms | 200 ms |
| Hold-cancel motion | **15 px** | **5 px** (tighter) |

---

## 3. State machine

Mostly identical to Playback. Extras:

```ts
const isRemix = !!location.state?.isRemix
const screenTitle = location.state?.screenTitle || 'The Remix'   // 'Film Fest' | 'Surprise Me'
const [scrapbookSheet, setScrapbookSheet] = useState(false)      // remix Disc3 sheet
```

No `currentClip.scrapbook` shape:

```ts
type DiscoveryClip = Clip & {
  scrapbook: {
    id: string
    name: string
    year: number
  }
}
```

The scrapbook info is *denormalized* onto each clip in the loaded
shuffled array. That way swiping doesn't require a separate fetch.

Three preload refs:

```ts
const prevVideoRef = useRef<HTMLVideoElement>(null)
const nextVideoRef = useRef<HTMLVideoElement>(null)
const next2VideoRef = useRef<HTMLVideoElement>(null)
```

`next2` is *not* visible — it's just kept loaded in a hidden element so
its blob lands in the cache before you swipe to it.

---

## 4. Data fetches

### Library mode (own clips, no remix)

```ts
const { data } = await supabase
  .from('scrapbooks')
  .select('id, name, year, created_at, clips(id, video_url, thumbnail_url, duration, trim_in, trim_out, cut_in, cut_out, caption_text, caption_x, caption_y, caption_size)')
  .eq('user_id', session.user.id)

// Flatten clips with scrapbook metadata
const all = data.flatMap(sb =>
  (sb.clips || []).map(clip => ({
    ...clip,
    scrapbook: { id: sb.id, name: sb.name, year: sb.year ?? new Date(sb.created_at).getFullYear() },
  }))
)
const shuffled = shuffleArray(all)
setClips(shuffled)
preloadRest(shuffled, 0)
shuffled.forEach(c => { if (c.thumbnail_url) { const img = new Image(); img.src = c.thumbnail_url } })
```

The Fisher-Yates shuffle:

```ts
function shuffleArray(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
```

### Remix mode (clips pre-supplied via route state)

```ts
if (isRemix && location.state?.clips?.length) {
  setClips(location.state.clips)
  preloadRest(location.state.clips, 0)
  setLoading(false)
  return
}
```

Skip own-fetch entirely. The clips array was assembled by Remix or
Surprise Me and handed off via React Router state. In native, see
`01-navigation-flow.md` for the recommended remix-handoff buffer
pattern.

---

## 5. Every interaction

### 5.1 Horizontal swipe

See `02-interactions-glossary.md` §1. Discovery-specific:

- Commit threshold: 30% of `window.innerWidth`.
- Animation: **280 ms**, `cubic-bezier(0.25, 0.46, 0.45, 0.94)`.
- Vertical-gesture ignore: same as Playback (`dy > Math.abs(dx) * 0.8 && Math.abs(dx) < 24`).
- iOS swipe-back gate: when swiping right with `currentIndex > 0`, `e.preventDefault()`.

### 5.2 Quick-tap navigation

Distinct from Playback's `handleTap` — Discovery folds tap-detection
into the swipe `touchend`:

```ts
if (Math.abs(offset) < 8) {
  // Quick tap, not a swipe
  const touch = e.changedTouches[0]
  const goingLeft = touch.clientX < window.innerWidth / 2
  if (goingLeft) goPrev()
  else goNext()
  // If no nav happened (at boundary) and was playing, resume
  return
}
```

Tap left half = prev, right half = next. **No center zone is reserved
for pause** in Discovery's tap logic — it's always navigate. (Hold-to-
pause still works via the 200ms timer.)

### 5.3 Hold-to-pause

Same pattern. **5 px motion cancellation** (tighter than Playback's
15 px). Otherwise identical.

### 5.4 Scrub bar

Same — bottom 25% touch zone, amber bar, video seeks live.

### 5.5 Reshuffle button (library mode)

Top-right Shuffle icon → `reshuffle()`:

```ts
function reshuffle() {
  setClips(prev => shuffleArray(prev))
  setCurrentIndex(0)
}
```

Re-randomizes the same set without re-fetching. Reset to clip 0.

### 5.6 Disc3 sheet (remix mode)

Top-right Disc3 icon → `setScrapbookSheet(true)`. Sheet shows:

```
[drag handle]

2026                                ← year, rust caps
Beach Trip                          ← Fraunces SemiBold 22 px, wheat
Heading there will exit Film Fest.  ← wheat/40 13 px

┌──────────────────────────────────┐
│  Go to this scrapbook            │  ← amber CTA
└──────────────────────────────────┘
  Stay in Film Fest                 ← rust text link
```

- **Go to** → `navigate('/scrapbook/' + currentClip.scrapbook.id)`.
- **Stay in Film Fest** → `setScrapbookSheet(false)`.
- Tap backdrop → `setScrapbookSheet(false)`.

### 5.7 Bottom info area (library mode only)

Always-visible at the bottom of the screen:

```
FROM YOUR LIBRARY · 2026
Beach Trip                                    Watch →
```

Tapping "Watch →" navigates to `/scrapbook/{currentClip.scrapbook.id}`
(jumps into ScrapbookDetail for that scrapbook).

In remix mode this whole area is hidden — the screen-title pill and
Disc3 sheet handle context instead.

### 5.8 Back button

- Library mode: `navigate('/')` → Home.
- Remix mode: `navigate('/remix')` → back to the Film Fest studio.

---

## 6. Animations & micro-feel

Same vocabulary as Playback (see `screens/playback.md` §6). Plus:

- Disc3 icon button has an amber-20 background instead of black/30 to
  signal "this is the remix-mode indicator."
- "Watch →" link has a small amber/70 chevron right; on press, the
  whole text dims to amber/60.

---

## 7. Empty / loading / error states

### Initial loading

`bg-deep`, cassette reel centered. The reel renders explicitly via the
Watch flow (PWA does 2s min-delay loading before remix-mode entry —
see `screens/remix-film-fest.md` §5).

### Empty library (library mode)

Different copy than Playback:

> Nothing here yet.
> Create a scrapbook and upload some clips to start discovering your
> memories.

Back button still works.

### Remix mode with 0 clips post-filter

The Remix studio should catch this before navigation. If it doesn't,
Discovery shows the same empty state.

---

## 8. Known gotchas & "why it works"

- **Library Discovery has no swipe between scrapbooks.** CLAUDE.md
  says "horizontal swipe = next scrapbook." That's wrong. It's a flat
  shuffled clip playlist. The only way to "go to a scrapbook" is the
  "Watch →" link in the bottom info area.
- **Remix Discovery shows the screenTitle pill instead of a counter.**
  The user is "in" Film Fest or Surprise Me; the count is irrelevant.
- **Shuffle re-uses the same clips array.** Reshuffling doesn't
  re-fetch the database; it permutes in memory. Cheap.
- **Clips are denormalized with scrapbook info.** Each clip object in
  the array has `.scrapbook = { id, name, year }`. Don't query the
  scrapbook each time the user swipes.
- **The thumbnail-image preload trick** (`new Image(); img.src =
  url`) is a web-only browser thing — it warms the HTTP cache. In
  native, `expo-image`'s `Image.prefetch(url)` does the equivalent.
- **`next2` preload** means three clips are loaded in hidden video
  elements at any time (prev, next, next2 — plus the current).
  Discovery has no `prev2` because backward navigation is less common
  in a shuffled list.

---

## 9. Native translation notes

### Recommended stack

Same as Playback (see `screens/playback.md` §9). Discovery inherits the
same gestures + the same `<ClipSlot>` component pattern.

### Architecture: same three-player (or two-player) as Playback

The three-player sliding container works identically. Just:

- The data source is a shuffled, denormalized array.
- The chrome differs by `isRemix` and `screenTitle`.
- Animation duration is 280 ms (not 300).

### Remix payload handoff

See `01-navigation-flow.md` §1 for the recommended pattern. Don't pass
the full clip array through navigation params on iOS; use a small
module-scoped buffer:

```ts
// lib/remixHandoff.ts
let buffer: { clips: Clip[]; isRemix: true; screenTitle: string } | null = null
export function setRemixPayload(p: typeof buffer) { buffer = p }
export function consumeRemixPayload() { const p = buffer; buffer = null; return p }
```

Remix screen calls `setRemixPayload({ clips, isRemix: true, screenTitle: 'Surprise Me' })` then `navigation.navigate('Discovery', { fromRemix: true })`. Discovery reads via `consumeRemixPayload()` on mount.

### Bottom info area

Plain absolutely-positioned `<View>` with the gradient overlay.
`expo-linear-gradient` for the fade.

```tsx
{!isRemix && (
  <View style={[styles.bottomInfo, { paddingBottom: insets.bottom + 32 }]}>
    <LinearGradient
      colors={['transparent', 'rgba(26,15,8,0.5)', 'rgba(26,15,8,0.92)']}
      locations={[0, 0.6, 1]}
      style={StyleSheet.absoluteFill}
    />
    <Text style={styles.eyebrow}>FROM YOUR LIBRARY · {currentClip.scrapbook.year}</Text>
    <View style={styles.row}>
      <Text style={styles.scrapbookName}>{currentClip.scrapbook.name}</Text>
      <Pressable
        onPress={() => navigation.navigate('ScrapbookDetail', { scrapbookId: currentClip.scrapbook.id })}
        hitSlop={12}
        style={styles.watchLink}
      >
        <Text style={styles.watchText}>Watch →</Text>
      </Pressable>
    </View>
  </View>
)}
```

### Disc3 sheet

`@gorhom/bottom-sheet` with dynamic sizing. Conditional render based
on `scrapbookSheet`.

### Reshuffle vs go-to-next-clip

The reshuffle button is *only* available in library mode. In remix
mode, the Disc3 icon takes its place. Conditional render.

---

## 10. Test plan when this screen ships

- [ ] Tap Shuffle on Home → loading reel ~2s → first clip plays. Top-
      right shows Shuffle icon.
- [ ] Swipe between clips — same feel as Playback (but 20 ms faster).
- [ ] Reshuffle button → clips re-randomize, starts at index 0.
- [ ] Bottom info shows correct scrapbook name + year. "Watch →"
      navigates to ScrapbookDetail of that scrapbook.
- [ ] Tap back arrow → returns to Home.
- [ ] Remix mode: from Remix screen → loading → Discovery with
      "Film Fest" pill top-center, Disc3 icon top-right. No bottom
      info.
- [ ] Disc3 → sheet opens; "Go to this scrapbook" navigates +
      "Stay in Film Fest" closes.
- [ ] Back from remix mode → returns to Remix studio (not Home).
- [ ] Empty library → empty state copy renders, back arrow works.

---

*Cross-references:* `00-brand-system.md` §3 (motion 280 ms);
`02-interactions-glossary.md` §1 (swipe), §2 (hold), §3 (scrub);
`screens/playback.md` (the parent doc — most patterns here are
identical); `screens/remix-film-fest.md` (the upstream screen for
remix-mode entry); `01-navigation-flow.md` §1 (remix payload handoff).
