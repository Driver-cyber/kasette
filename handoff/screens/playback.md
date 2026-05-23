# screens/playback.md — Playback (Watch)

> **Why this screen is critical.** This is the payoff. Everything else
> in Cassette exists to feed this screen. The clip-to-clip transition,
> the hold-to-pause, the scrub bar, the caption rendering — these are
> the moments mom shows her friends. If Playback feels like a video
> app, you've failed; if it feels like opening a slideshow that you
> made, you've nailed it.
>
> The priority-#1 brief item — "the next clip is already loaded so the
> incoming frame drags in cleanly with the gesture" — is *this screen*.

Route: `/scrapbook/:id/watch` · File: `kasette/app/src/screens/PlaybackScreen.jsx`
(751 lines) · Native counterpart (currently a stub):
`kasette-native/screens/PlaybackScreen.tsx`

---

## 1. Purpose & user mental model

Reels-style full-screen viewer for one scrapbook. The user lands here
from Home → ScrapbookDetail → "Watch", or from Discovery's "Watch →"
link. From here she:

- Watches clips one after another (auto-advance on clip end).
- Swipes horizontally to navigate (the "feel" moment).
- Holds to pause; touches the bottom 25% to scrub.
- Hits the three-dot menu for Edit / Share / Export.
- Goes back to library.

She does not edit here. Workspace is for editing. Playback is for
*watching*, ideally with chrome out of the way. The default chrome is
*minimal* — top bar (back / title / more), segmented progress bar, and
a tiny bottom counter. Everything else materializes on touch.

---

## 2. Layout (top to bottom)

Full-bleed video over walnut-deep (`#1A0F08`). All chrome is positioned
absolutely. Mental model:

```
┌──────────────────────────────────────────────────┐
│  [← Back]    Scrapbook Title    [⋯ More]         │  ← top: insets.top + 40 px
│  ▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱           │  ← top: insets.top + 92 px
│                                                  │
│                                                  │
│           [video full-bleed]                     │  ← absolute fill, behind chrome
│                                                  │
│                                                  │
│                                                  │
│                                                  │
│              "her caption goes here"             │  ← positioned by caption_x / caption_y
│                                                  │
│                                                  │
│                                                  │
│  SCRAPBOOK · YEAR                       [▶ play] │  ← bottom: insets.bottom + 40
│  3 / 12                                          │
└──────────────────────────────────────────────────┘
```

### Measurements (verbatim from source)

| Element | Position / size | CSS / RN values |
|---|---|---|
| Background | full screen | `#1A0F08` (`walnutDeep`) |
| Video | full-bleed `object-cover` | `StyleSheet.absoluteFillObject` + `contentFit="cover"` |
| Top vignette gradient | top 176 px | `linear-gradient(180deg, rgba(0,0,0,0.55) 0%, transparent 100%)` |
| Bottom vignette gradient | bottom 224 px | `linear-gradient(0deg, rgba(0,0,0,0.7) 0%, transparent 100%)` |
| Back button | `top-10 left-5`, 40×40 round | walnut transparent + blur, wheat ArrowLeft 18px |
| Top title | center of top row, 200 px max | Fraunces SemiBold 15px, `color: rgba(245,222,179,0.7)`, truncated |
| More button | `top-10 right-5`, 40×40 round | same look as back; MoreHorizontal 18px |
| Segmented progress bar | `top-[92px] left-5 right-5`, gap 4 px | one segment per clip, `h-[2.5px]` rounded; track `rgba(245,222,179,0.2)`; past clips fill `rgba(245,222,179,0.7)`; current fills to `progress * 100%` with `#F5DEB3` |
| Bottom counter | `bottom-10 left-6` (when not scrubbing) | eyebrow `text-amber/50 text-[10px] tracking-[0.15em] uppercase`; counter Fraunces SemiBold 13px, `rgba(245,222,179,0.5)` |
| Play / pause button | `bottom-10 right-6`, 44×44 round | walnut transparent + blur, Pause/Play 14px in wheat/70 |
| Scrub bar (when active) | `bottom: max(48, insets.bottom)`, `px-5` | 3 px tall track + 18 px amber knob; labels above |
| Action sheet | bottom, `rounded-t-3xl`, walnut-mid bg | see §6.7 |
| Caption | positioned by per-clip `caption_x` / `caption_y` (% of frame) + translate(-50%, -50%); `maxWidth: 80vw` | Fraunces italic, wheat, `text-shadow: 0 2px 12px rgba(0,0,0,0.6), 0 0 40px rgba(0,0,0,0.4)`, size = `caption_size` (default 24) |

### Native chrome safe-area convention

The PWA uses `top-10` (40 px). In native, use `insets.top + 8` instead of
a hardcoded value so notched and non-notched both look right. Same for
bottom (`max(rem, env(safe-area-inset-bottom))` → `insets.bottom + 24`).

---

## 3. State machine

### Modes (mutually exclusive)

| Mode | When | Visible UI |
|---|---|---|
| `playing` | Video is playing, no overlays | top bar, progress, bottom counter, play button shows pause icon |
| `paused` | Video paused (manual or hold-released-while-was-paused) | same as playing but play icon |
| `holding` | User finger down 200ms+ within deadband | video paused, no overlay (the freeze IS the feedback) |
| `scrubbing` | Finger down in bottom 25% | bottom counter & play button hidden; scrub bar visible |
| `swiping` | Finger down with horizontal motion | sliding container translates with finger; "→ Next" / "← Previous" hint fades in at 12 px |
| `actionSheet` | Three-dot tapped | sheet up, backdrop dimmed; everything else inert |
| `exporting` | Export started | full-screen overlay; everything else inert |

These are not stored as a single enum — they're derived from a half-dozen
boolean state vars / refs (mirroring PWA). Listed here for clarity.

### State variables (mirror native to PWA exactly)

```ts
// Data
const [scrapbook, setScrapbook] = useState<Scrapbook | null>(null)
const [clips, setClips] = useState<Clip[]>([])
const [currentIndex, setCurrentIndex] = useState(0)
const [loading, setLoading] = useState(true)
const [videoLoading, setVideoLoading] = useState(true)
const [isPlaying, setIsPlaying] = useState(false)
const [progress, setProgress] = useState(0)            // 0..1 of [trim_in, trim_out]

// Chrome
const [showActionSheet, setShowActionSheet] = useState(false)

// Scrub
const [isScrubbing, setIsScrubbing] = useState(false)
const [scrubPercent, setScrubPercent] = useState(0)    // 0..1
const [scrubTime, setScrubTime] = useState(0)          // seconds
const scrubActiveRef = useRef(false)

// Hold-to-pause
const holdTimerRef = useRef<NodeJS.Timeout | null>(null)
const wasPlayingBeforeHold = useRef(false)
const holdOccurredRef = useRef(false)                  // tells touchend "this was a hold, not a tap"

// Swipe
const [dragOffset, setDragOffset] = useState(0)        // px; 0 = center
const [dragTransitioning, setDragTransitioning] = useState(false)
const dragOffsetRef = useRef(0)
const dragActiveRef = useRef(false)
const dragStartY = useRef(0)
const dragStartX = useRef(0)

// Export
const [exportState, setExportState] = useState<…|null>(null)
const [exportBlob, setExportBlob] = useState<Blob|null>(null)

// Refs to the three video elements
const videoRef = useRef<…>(null)
const nextVideoRef = useRef<…>(null)
const prevVideoRef = useRef<…>(null)
```

In native, the swipe will be a Reanimated shared value not state — see
§5.

### Derived

```ts
const currentClip = clips[currentIndex]
const nextClip    = currentIndex < clips.length - 1 ? clips[currentIndex + 1] : null
const prevClip    = currentIndex > 0 ? clips[currentIndex - 1] : null
const isOwner     = session?.user?.id === scrapbook?.user_id
```

`isOwner` gates the Edit / Share menu items in the action sheet.

### Triggers

| Trigger | Effect |
|---|---|
| Mount | Read `dataCache.getCached(id)` for instant render; in parallel fire `Promise.all` over `scrapbooks` + `clips` to refresh from server; call `preloadRest(clips, 0)` (background warm). |
| `currentClip` change (useEffect) | Reset progress; reset drag refs; if video, set `video.src = getBlob(currentClip.video_url)`, `video.currentTime = trim_in`, load, play; if photo, do nothing (separate auto-advance effect runs). |
| `nextClip` change (useEffect) | Set the hidden `nextVideoRef.current.src` to blob/url; load; seek to `trim_in`; fire `preloadClip(url)`. |
| `prevClip` change (useEffect) | Same for previous. |
| Photo currentClip (useEffect) | `setTimeout(() => goToClip(currentIndex + 1), duration * 1000)` + 100ms progress interval. |
| Video `timeupdate` | Sync `progress`; auto-skip `[cut_in, cut_out)` if entered; advance to next clip at `>= trim_out`. |
| Video `ended` | `goToClip(currentIndex + 1)` (no-op at last clip — chrome stays). |
| Unmount | Clear `holdTimerRef`; reset `scrubActiveRef` (defensive — refs can otherwise bleed into a remount in dev StrictMode). |

---

## 4. Data fetches

See `03-data-model.md` §7 for query shapes. Verbatim from
`PlaybackScreen.jsx:67–84`:

```ts
const cached = getCached(id)
if (cached?.scrapbook) {
  setScrapbook(cached.scrapbook)
  setClips(cached.clips)
  setLoading(false)
  preloadRest(cached.clips, 0)
}

Promise.all([
  supabase.from('scrapbooks').select('id, name, user_id').eq('id', id).single(),
  supabase.from('clips')
    .select('id, video_url, thumbnail_url, duration, trim_in, trim_out, cut_in, cut_out, caption_text, caption_x, caption_y, caption_size, order')
    .eq('scrapbook_id', id)
    .order('order', { ascending: true }),
]).then(([{ data: sb }, { data: cl }]) => {
  if (sb) { setScrapbook(sb); cacheScrapbook(id, sb, cl || []) }
  if (cl) { setClips(cl); preloadRest(cl, 0) }
  if (!cached) setLoading(false)
})
```

Important: the cache-first-then-refresh pattern means there's **no
loading spinner** if the user came from ScrapbookDetail (which already
populated the cache). The spinner only shows on deep-link entry.

Native: port the same. `getCached(id)` in `lib/dataCache.ts` (already
specced in `03-data-model.md` §8); `preloadRest` is optional (see §8 of
data-model doc).

---

## 5. Every interaction

Cross-reference `02-interactions-glossary.md` for full pattern specs;
this section nails down what *Playback* does with each.

### 5.1 Horizontal swipe (priority #1)

See `02-interactions-glossary.md` §1.

Playback-specific values:

- Threshold: **30% of screen width** (`window.innerWidth * 0.3`)
- Commit animation: **300 ms** with `cubic-bezier(0.25, 0.46, 0.45, 0.94)`
- Rubber band at boundaries: `Math.sign(dx) * Math.min(Math.abs(dx) * 0.15, 50)`
- Vertical-gesture ignore: `dy > Math.abs(dx) * 0.8 && Math.abs(dx) < 24`
- iOS swipe-back gate: when swiping toward "previous" and `currentIndex > 0`, the PWA calls `e.preventDefault()` to block iOS Safari's swipe-back. Native equivalent: `gestureEnabled: false` on the screen options when not on the first clip — or accept the swipe-back as a separate exit affordance.

The "sliding container" layout (verbatim from
`PlaybackScreen.jsx:431–545`):

- A wrapping `View` is `300vw` wide when both prev and next exist
  (otherwise `100vw`).
- Three child `View`s side-by-side, each `100vw`: prev, current, next.
- Container `transform: translateX(-100vw + (-dragOffset))` — so the
  *current* child is centered when `dragOffset = 0`. As the finger drags
  left (dragOffset becomes positive), the container slides left,
  revealing the next clip from the right.

Native architecture (referenced from `02-interactions-glossary.md` §1):

```tsx
const containerWidth = (prevClip || nextClip) ? SCREEN_W * 3 : SCREEN_W
const dragX = useSharedValue(0)

const containerStyle = useAnimatedStyle(() => ({
  transform: [{ translateX: -SCREEN_W + (-dragX.value) }],
  width: containerWidth,
}))

return (
  <Animated.View style={containerStyle}>
    {prevClip ? <ClipSlot clip={prevClip} ref={prevVideoRef} /> : <View style={{ width: SCREEN_W }} />}
    <ClipSlot clip={currentClip} ref={videoRef} active />
    {nextClip ? <ClipSlot clip={nextClip} ref={nextVideoRef} /> : <View style={{ width: SCREEN_W }} />}
  </Animated.View>
)
```

#### Swipe hints

When `dragOffset > 12` (and there's a next clip), a faint label appears
on the right edge: `"→ Next"` (uppercase, tracked, wheat/60). Opacity is
`Math.min(dragOffset / 80, 0.6)`. Same for `dragOffset < -12` → `"← Previous"` on the left.

Native: a small absolute-positioned `<Animated.Text>` with `opacity`
driven by `interpolate(dragX.value, [0, 80], [0, 0.6])`.

### 5.2 Hold-to-pause

See `02-interactions-glossary.md` §2.

- Timer: **200 ms** to qualify as a hold.
- Motion cancellation: 15 px during the timer cancels the hold (it's
  becoming a swipe).
- The PWA *pauses immediately* on `touchstart` regardless of intent —
  the 200 ms timer only sets `holdOccurredRef = true` so the `handleTap`
  function can ignore the click that fires after touchend. Resume on
  release if `wasPlayingBeforeHold`.

This is subtle and important. The PWA model is:

- Touch starts → video pauses synchronously (`wasPlayingBeforeHold` captured).
- If user is swiping (motion > 15 px): timer is cancelled; on touchend, the swipe commits OR the spring-back resumes the video.
- If user is just holding (no motion): timer fires at 200 ms; `holdOccurredRef = true`. On touchend, the post-touch click handler sees this and bails. Video stays paused… no wait, on touchend the PWA also resumes if `wasPlayingBeforeHold` (line 393). So after the hold, video resumes. Hmm — that's not "hold to pause," that's "touch to pause; release to resume."
- The actual hold-to-pause behavior depends on `holdOccurredRef` to *block tap navigation*, not to keep the video paused.

So the user-facing semantics are:

> **Touch and hold the middle of the screen** → video pauses while you
> hold; when you let go it resumes.

That matches `02-interactions-glossary.md` §2 already. The `holdOccurredRef`
exists so the post-touchend click *doesn't* accidentally navigate to a
neighboring clip via the tap-zone logic (§5.3).

Native: from §2 of the glossary, but be sure the `LongPress` gesture
doesn't unintentionally fire navigation in `Pan.onEnd` when no swipe
committed.

### 5.3 Tap zones (left 25% / right 75%)

See `02-interactions-glossary.md` §18. Playback-specific:

- Tap in left 25% → previous clip (no-op at first clip).
- Tap in right 75%+ → next clip (no-op at last clip).
- Tap in center 25%–75% → falls through; no navigation. (The hold-to-pause
  semantics own this region.)

The PWA's tap handler also bails if:

- Tap landed on a `<button>` (preserves nested button handling).
- An action sheet is open (closes it instead).
- `Math.abs(dragOffsetRef.current) > 8` (a drag happened — not a tap).
- `holdOccurredRef.current = true` (a hold happened — not a tap).

Native: encode these guards in the `Tap` gesture's `onEnd` worklet
(reading shared values + a `holdOccurredRef` ref).

### 5.4 Scrub bar (bottom 25%)

See `02-interactions-glossary.md` §3. Playback-specific:

- The bar uses screen-X (`clientX / window.innerWidth`) for the
  percentage — so the *full screen width* maps to `[trim_in, trim_out]`
  of the current clip. There is no horizontal padding on the touch
  surface; the visual bar inside has `px-5` (20 px gutter).
- Time labels: left shows `formatTime(scrubTime - trim_in)` in amber
  semibold tabular-nums (12 px); right shows `formatTime(trim_duration)`
  in wheat/40.
- Knob: 18 px amber circle with a soft amber glow (`box-shadow: 0 0 8px rgba(242,162,74,0.5)`).
- While scrubbing, the bottom counter + play/pause button hide. Only the
  scrub bar remains in the bottom region.
- On release: `video.play()` if `wasPlayingBeforeHold = true`.

### 5.5 Auto-skip cut region

When the current clip has `cut_in` and `cut_out` set, every `timeupdate`
checks: if `currentTime >= cut_in && currentTime < cut_out`, jump to
`cut_out` instantly. Both PWA and native implement this in the same
listener.

```ts
function handleTimeUpdate() {
  const video = videoRef.current
  if (!video || !currentClip || scrubActiveRef.current) return
  if (currentClip.cut_in != null && currentClip.cut_out != null &&
      video.currentTime >= currentClip.cut_in && video.currentTime < currentClip.cut_out) {
    video.currentTime = currentClip.cut_out
  }
  // …trim progress + auto-advance below
}
```

The `!scrubActiveRef.current` guard is important — scrubbing temporarily
lets the user land inside the cut region (they're inspecting); only
playback jumps over it.

### 5.6 Auto-advance at trim_out

```ts
const elapsed = video.currentTime - trim_in
const total = (trim_out - trim_in) || 1
setProgress(Math.min(elapsed / total, 1))
if (trim_out && video.currentTime >= trim_out) {
  goToClip(currentIndex + 1)
}
```

Note `currentTime >= trim_out` *before* the `'ended'` event would fire
— so trims always honor the trim_out, regardless of whether the clip
file has trailing footage.

### 5.7 Three-dot menu (action sheet)

Items (verbatim copy):

- **Edit Scrapbook** *(owner only)* — Edit icon, label "Edit Scrapbook", sub "Trim clips, add captions, reorder". Navigates to `/scrapbook/:id/edit` (Workspace).
- **Share Scrapbook** *(owner only)* — Share2 icon, label "Share Scrapbook", sub "Manage who can view this". Navigates to Share.
- **Export as Video** — Download icon, label "Export as Video", sub "Saves as MP4 · captions not included". Fires `handleExport()`.
- **Cancel** — text button at the bottom, rust, fontWeight semibold.

Layout: rounded-t-3xl walnut-mid sheet, full width; each row is
`flex items-center gap-3.5 px-2 py-4 border-b border-walnut-light`.
Backdrop: `rgba(0,0,0,0.5)` with blur 4 px.

**Export divergence** for native — see §9.

### 5.8 Loading

When `loading = true` (no cache hit and the parallel fetch hasn't returned):

- Background: `bg-deep` (`#1A0F08`).
- Centered cassette reel (see brand doc §7). The PWA actually uses a
  generic CSS spinner here, not the cassette reel — `<div class="w-8 h-8 rounded-full border-2 border-amber border-t-transparent animate-spin">`. **In native, swap this for the cassette reel** for brand consistency.

When `videoLoading = true` (video src changed, decode not yet ready):

- Overlay shows the clip's `thumbnail_url` (full-bleed `object-cover`)
  with a small spinner centered. Or a centered amber spinner if no
  thumbnail. Removed on `onCanPlay` / `onPlaying`.

### 5.9 Empty (no clips)

`bg-deep`, centered. Fraunces text "No clips in this scrapbook" in
`text-wheat/60`. A "← Back to Library" link in amber sans, 14 px. Tapping
goes to Home.

In native: same layout, custom header should still render the back
button so the user can leave without scrolling.

---

## 6. Animations & micro-feel

### 6.1 The swipe transition

The *only* place in the PWA where the brand-guide "Playback Swipe"
easing applies, with the timing as defined:

```css
transition: transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)
```

That's 300 ms (Discovery uses 280 ms; same curve). Brand guide spec is
380 ms — but the deployed PWA uses 300 ms and that's the feel mom loves.
**Match source, not brand spec.**

In Reanimated:

```ts
const PLAYBACK_EASE = Easing.bezier(0.25, 0.46, 0.45, 0.94)
withTiming(targetX, { duration: 300, easing: PLAYBACK_EASE })
```

### 6.2 The "saved" amber flash

Not used on Playback. Lives only in Workspace. Mentioned here so you
don't accidentally port it.

### 6.3 Caption appearance

The PWA does *not* fade in captions. They're rendered as part of the
clip frame from `t=0`. The brand-guide "Caption Fade" (500ms ease-in-out
opacity) is aspirational, not implemented. **Skip it in native** — match
source for v1.

### 6.4 Action sheet entry

The PWA renders the sheet with no enter animation — it just appears.
Acceptable but a hair clinical. In native, use the Gentle Enter
(300ms `cubic-bezier(0, 0, 0.2, 1)`) for a slide-up.

### 6.5 Scrub bar appearance / disappearance

Same as 6.4 — instant in PWA. Native should match (instant).

---

## 7. Empty / loading / error states

### Loading (initial)

`bg-deep`, centered cassette reel. Time-to-render is ~0 ms when cached,
~300 ms when not (single Supabase round trip).

### Empty

```
bg-deep, center-aligned
   "No clips in this scrapbook"   (Fraunces SemiBold, wheat/60, 20px)
   ← Back to Library              (amber sans 14px)
```

### Video decode loading (per-clip)

While the video element is decoding the first frame:

- If clip has `thumbnail_url`, full-screen `<Image>` of the thumbnail.
- Centered amber spinner (cassette reel is overkill here; the spinner is
  small and brief). The PWA uses a 36 px amber border spinner; match.

### Error

- Fetch error (Supabase down): not surfaced in PWA — `loading` stays
  forever. **Native should fix this**: if both queries reject, render
  the empty-state UI with copy like "We couldn't load this scrapbook.
  Pull to retry." (Implement after the basic flow is up.)
- Video decode error: PWA `onerror` handler on the `<video>` sets
  `src = clip.video_url` (raw R2 URL, bypassing blob cache) and re-loads.
  Native: `expo-video` doesn't have a parallel pattern; on
  `player.status === 'error'` reload the player.

### Export error

Caught in `handleExport`'s try/catch; renders an error overlay with the
caught error message verbatim (low-style — sienna heading "Export
failed", rust subtext "Something went wrong. Check your connection and
try again.", a `text-wheat/30 text-[11px] font-mono` line with the
actual `error.message`, and a "Dismiss" link to go back to Playback).

---

## 8. Known gotchas & "why it works"

- **The three-video architecture is non-negotiable for priority #1.**
  Single-player + replace-source guarantees a black-frame flash between
  clips. The PWA mounts three videos and slides — *that's* the feel.
- **Prev video has no audio.** All three videos are loaded with
  `muted` attribute on the prev and next refs. Only the current clip
  plays audio. (PWA prev/next `<video muted>`.)
- **`preload="auto"` everywhere.** All three videos have `preload="auto"`
  in the PWA, which tells the browser to decode the first frame so it's
  ready when shown.
- **`object-cover` (CSS) ≈ `contentFit="cover"` (RN).** The native
  current Playback uses `contentFit="contain"` — that means letterboxing
  for non-16:9 clips. PWA crops to fill. **Switch native to `cover`.**
  (Mom's iPhone footage is mostly portrait 9:16 — fills the iPhone
  screen cleanly with cover.)
- **The "scrolling container" must have `willChange: transform`** for
  the PWA — in native this is implicit because Reanimated runs on the
  UI thread.
- **iOS Safari swipe-back blocking.** When the user swipes right with
  `currentIndex > 0`, the PWA calls `e.preventDefault()` to stop iOS
  from intercepting and going back. On native, the equivalent is
  disabling the stack's swipe-back when not on the first clip
  (set `gestureEnabled: false`, restore on first-clip render). Or accept
  iOS swipe-back as the "leave Playback" affordance — it's reasonable,
  and the user is already moving in that direction.
- **Hold while playing → hold while paused.** If the user pauses
  manually (tap the play/pause button), then holds, the hold-released
  resume logic will start playing again because `wasPlayingBeforeHold`
  reads `!video.paused` at touchstart and the video *is* paused
  (`wasPlayingBeforeHold = false`), so no resume. Verified correct in
  source. Native must replicate.
- **Photo handling is a separate code path.** Photos render as `<img>`
  (or `<Image>` in native), advance after `duration * 1000` ms, skip
  the trim/cut logic entirely. The mute / scrub / hold patterns are
  hidden for photos. See `02-interactions-glossary.md` §16.
- **No "loop scrapbook" behavior.** When the last clip ends, the user
  stays on it. PWA does not auto-restart from clip 1. Native: match.

---

## 9. Native translation notes

### Recommended Expo / RN stack for this screen

- **`expo-video`** (Expo SDK 54). Use `useVideoPlayer` per clip slot.
  Three players if pursuing the three-player architecture.
- **`react-native-gesture-handler`** + **Reanimated v3**. See
  `02-interactions-glossary.md` §1, §2, §3, §18.
- **`expo-blur`** for the frosted-glass top-bar buttons.
- **`react-native-safe-area-context`** for the insets (already in
  `package.json`).
- **`@gorhom/bottom-sheet`** for the action sheet. (One-shot, but the
  pan-to-dismiss + spring make it feel right.)
- **`expo-haptics`** *(optional)* for a `Haptics.selectionAsync()` when
  the swipe commits. Free polish.

### Three-player architecture

Build a small component that owns a `useVideoPlayer` and a `<VideoView>`:

```tsx
const ClipSlot = forwardRef<VideoView, { clip: Clip; active: boolean }>(
  ({ clip, active }, ref) => {
    const player = useVideoPlayer(clip.video_url, (p) => {
      p.muted = !active
      p.currentTime = clip.trim_in ?? 0
      if (active) p.play()
    })
    useEffect(() => {
      player.muted = !active
      if (active) player.play()
      else player.pause()
    }, [active])
    return (
      <VideoView
        ref={ref}
        style={styles.video}
        player={player}
        contentFit="cover"
        nativeControls={false}    // we render our own chrome
        allowsFullscreen={false}
        allowsPictureInPicture={false}
      />
    )
  }
)
```

Then mount three in the sliding container (prev / current / next).
**Don't** create one `useVideoPlayer` and call `replaceAsync()` — that's
the current native code, and it guarantees a visible flash on each clip
change.

### Single-player divergence (current native code)

The current `kasette-native/screens/PlaybackScreen.tsx` uses a single
`useVideoPlayer` + `replaceAsync`. This:

- Inherently flashes between clips (the player's video texture is
  cleared while the new source decodes).
- Has no preload — the next clip starts loading only after commit.
- Uses `nativeControls={true}`, which renders iOS's stock video
  scrubber on tap. That's the *opposite* of the PWA's minimal chrome.

To rewrite for parity:

1. Add `<ClipSlot>` component as above.
2. Mount three slots (prev / current / next).
3. Wrap them in an `Animated.View` with the `dragX`-driven translateX.
4. Replace `useEffect on index` (`player.replaceAsync(...)`) with the
   commit-and-shift logic: when `currentIndex` advances, the player
   instance that was "next" *becomes* the current player; a new "next"
   player mounts in its slot.
5. Set `nativeControls={false}`.
6. Render the segmented progress bar, top bar, bottom counter, and
   action sheet as overlays (as the current native already does for
   top-row but partially).

### Memory pressure

Three full-resolution HEVC decoders on an iPhone 11 base model: real.
The user is on an iPhone (recent enough — the brief says "mom's iPhone"
which is unspecified, but TestFlight + recent enrollment implies iOS
17+). Three players is acceptable on iOS 17+ devices; older devices
might JetSam. If you see crashes from `OSStatus = -16969` in TestFlight
logs, drop to **two-player ping-pong** (mount only current + next; back
swipes pre-mount the previous on commit).

### Status bar / immersive mode

PWA is browser-rendered, so the iOS status bar shows over the page.
Native should do the same — don't hide it. Use:

```tsx
<StatusBar style="light" hidden={false} />
```

(Already in `App.tsx`.) Translucent over the dark video reads cleanly.

### Hardware back gesture

iOS swipe-back from the left edge: see "iOS Safari swipe-back blocking"
above and `02-interactions-glossary.md` §1.

### Export — the big native divergence

PWA's export pipeline (`lib/export.js`) is FFmpeg WASM trimming each
clip in turn and concat-demuxing into a single MP4. Native has no
WebAssembly story; the equivalents are:

1. **`ffmpeg-kit-react-native`** — bundles FFmpeg as a native binary
   (~50 MB), supports the exact same `-c copy -movflags +faststart` +
   concat-demuxer flow as the PWA. Heaviest option but a 1:1 port.
2. **Native `AVFoundation` via an Expo Module** — `AVAssetExportSession`
   with `AVAssetExportPresetPassthrough` and an `AVMutableComposition`
   to stitch. Best-in-class iOS perf, smallest binary impact, requires
   writing ~100 lines of Swift in an Expo module. Mid-term ideal.
3. **Defer Export entirely** for v1. Show "Coming soon" on the menu
   item. Acceptable because the user can still Watch + Share via Share
   screen.

Recommendation: option **3 for v0.1**, **2 for v1**. Document option 1
as the "if option 2 stalls" fallback. Don't ship export-via-WASM in
native — there is no WebView with adequate decoder support.

When you do port export, the **progress callback shape** is fixed:

```ts
type ExportProgress =
  | null
  | { phase: 'fetching' | 'trimming' | 'stitching'; current: number; total: number }
  | 'done'
  | { error: string }
```

Match this so the overlay UI is portable.

### Action sheet implementation

Use `@gorhom/bottom-sheet` with `enableDynamicSizing` + `enablePanDownToClose`.
Match the walnut-mid background, walnut-light handle. Four content
rows (or two for non-owners + Export); pad with `useSafeAreaInsets().bottom`.

### Frosted-glass top-bar buttons

Per `00-brand-system.md` §7 and `02-interactions-glossary.md` §15. The
current native fallback (solid rgba) is acceptable for v0.1 but upgrade
when polishing.

### Top safe-area

Current native code: `top: insets.top + 8`. That puts the back button
~52 px from the top of the screen on a notched device. PWA uses `top-10`
(40 px) which lands the same on a notched screen because the PWA viewport
already excludes the notch. The two read identical; either works.

### Initial render performance

Cache hit (from ScrapbookDetail): renders in < 16 ms.
Cold deep-link: ~400 ms to first-frame (one round trip + R2 HEAD).

If TestFlight users report cold-start sluggishness, prewarm three
players inside `<Splash>` so the *first* time the user opens Playback
the players are already JIT'd.

---

## 10. Open product decisions for this screen

1. **Three-player vs two-player vs single-player.** Open. The brief
   wants priority #1 nailed; that requires multiple-player.
   Recommendation: three-player on first port, downgrade to two if
   memory pressure shows on real devices.
2. **Export strategy.** Open. Per §9, recommend deferring export for
   v0.1 with a "Coming soon" pill on the menu item.
3. **Swipe-back behavior on first clip.** Two options:
   a) Leave it — iOS edge-swipe pops the stack to ScrapbookDetail.
   b) Block it — prevent any swipe-back; user must use the Back button.
   PWA blocks it whenever `currentIndex > 0` and lets it through at
   `currentIndex === 0`. Native should do the same.

These are flagged for the porting session, not for this doc to resolve.

---

## 11. Test plan when this screen ships

The "did we nail it" smell test:

- [ ] Open a scrapbook with 5+ clips from ScrapbookDetail (cache hit).
      Should render instantly with no spinner.
- [ ] Swipe between clips. The next clip's first frame should be visible
      *during* the swipe (not appearing after release). No flashing
      between clips on commit.
- [ ] Hold the middle of the screen for 1s — video should pause within
      ~250 ms. Release — video should resume.
- [ ] Touch the bottom 25% — amber scrub bar should appear immediately,
      no 200 ms delay. Drag — video should seek live. Release — playback
      resumes.
- [ ] Captions should sit exactly where the Workspace placed them and
      not float during the swipe (they should drag with their clip).
- [ ] On the last clip, swipe left — rubber band, no commit.
- [ ] On the first clip, swipe right — rubber band (or iOS swipe-back,
      depending on §10 decision).
- [ ] Three-dot menu opens the action sheet over a dimmed backdrop;
      tapping outside or "Cancel" dismisses.
- [ ] Deep link directly to `/scrapbook/<id>/watch` (web)
      → equivalent native deep link → loads with a brief cassette reel
      spinner, no broken state.
- [ ] Memory: three clips × 5 minutes each played end-to-end shouldn't
      grow memory more than ~120 MB (single decoder ~40 MB). If
      growing unbounded, suspect prev/next refs not releasing.
- [ ] Audio plays only for the current clip — prev/next are muted.
      Swiping shouldn't briefly double-play audio.
