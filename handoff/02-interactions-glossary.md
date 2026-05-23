# 02 — Interactions Glossary

> **Purpose.** Per-screen docs reference these patterns by name; defining
> them once here keeps each screen doc shorter and prevents drift between
> implementations of the same gesture. If you change a pattern below,
> update everywhere it's referenced.

Each entry follows the same shape: **what** the pattern is, **where**
it appears, **exact thresholds & timings** from PWA source, the
**native (Expo/RN) translation** with concrete library + API, and any
**traps** that bite if you naively port.

The native stack used throughout this doc:

- **`react-native-gesture-handler`** — every drag, swipe, pinch, long-press
- **`react-native-reanimated`** (v3) — every animated property, lerping
- **`expo-video`** (Expo SDK 54) — video element, replaces `<video>` and
  `expo-av`
- **`@gorhom/bottom-sheet`** — for any sheet that has snap points / pan-
  to-dismiss (Intake step 2, Discovery remix info sheet); plain
  positioned views are fine for one-button confirmation sheets
- **`expo-image-picker`** — file picker
- **`expo-blur`** — frosted-glass top-bar buttons
- **`expo-keep-awake`** — wake-lock equivalent
- **`expo-haptics`** — optional micro-feedback on long-press / commit

None of these are installed yet in `kasette-native` except where noted
elsewhere; add as each screen's port pulls them in.

---

## §1 Horizontal clip-swipe (Playback & Discovery)

The single most important interaction in Cassette. Defines the "feel"
the user calls out.

### What it does (PWA)

- Three video elements mounted simultaneously: previous, current, next
  (and Discovery additionally preloads `next+1`). All three render
  inside a sliding container that is `300vw` wide and translated left by
  `100vw` so the *current* clip sits in the viewport.
- Touch drag moves the container in real time (`translateX(-dragOffset)`)
  so the user sees the next clip drag in from the right edge as they
  swipe left, with no flash and no spinner.
- Release crosses a commit threshold → animate to `±100vw` → swap
  `currentIndex` → snap container back to `0` with no transition.
- Rubber-band resistance at boundaries (`* 0.15`, capped at 50 px) so the
  edge of the playlist feels like a wall, not a glitch.

### Source ground truth

`PlaybackScreen.jsx` (lines ~265–395) and `DiscoveryScreen.jsx`
(lines ~184–336). Side-by-side:

| Constant | Playback | Discovery | Notes |
|---|---|---|---|
| Commit threshold (px) | `window.innerWidth * 0.3` | `window.innerWidth * 0.3` | 30% of screen width |
| Animation duration | **300ms** | **280ms** | Discovery is 20ms faster; brand spec says 380, neither matches — keep source values |
| Easing | `cubic-bezier(0.25, 0.46, 0.45, 0.94)` | same | "page turn" curve, brand-guide "Playback Swipe" |
| Boundary rubber band | `Math.sign(dx) * Math.min(Math.abs(dx) * 0.15, 50)` | same | 15% drag with 50px cap |
| Tap-vs-drag deadband | `Math.abs(dragOffsetRef.current) > 8` | `Math.abs(offset) < 8` for quick-tap nav | If offset < 8 at touchEnd, it's a tap |
| Vertical-gesture ignore | `dy > Math.abs(dx) * 0.8 && Math.abs(dx) < 24` → no-op | same | Lets the user scroll/pinch system gestures pass through |
| Hold-to-pause timer | 200ms | 200ms | Set immediately on touchstart |
| Hold-cancel motion threshold | 15px (Playback), 5px (Discovery) | — | If user drifts more than this during the 200ms timer, hold is cancelled (it's a swipe) |

### Native translation

Use **`react-native-gesture-handler`'s `Pan` gesture** + **Reanimated**
shared values. The naive `FlatList` + `pagingEnabled` approach
**will not work** because:

1. FlatList unmounts off-screen items aggressively — the next clip's
   video would need to mount fresh on every swipe (kills priority #1).
2. You lose the rubber-band-at-boundary, the hold-to-pause coexistence,
   and the scrub-bar bottom zone.

Better pattern:

```tsx
// Three VideoView instances laid out left-to-right at -W, 0, +W
// positions; a shared `dragX` drives translateX of the wrapping View.

const dragX = useSharedValue(0)   // px; 0 = current clip centered

const pan = Gesture.Pan()
  .onUpdate((e) => {
    const atBoundary =
      (e.translationX < 0 && currentIndex >= clips.length - 1) ||
      (e.translationX > 0 && currentIndex <= 0)
    dragX.value = atBoundary
      ? Math.sign(e.translationX) * Math.min(Math.abs(e.translationX) * 0.15, 50)
      : e.translationX
  })
  .onEnd((e) => {
    const THRESHOLD = SCREEN_W * 0.3
    if (e.translationX < -THRESHOLD && currentIndex < clips.length - 1) {
      dragX.value = withTiming(-SCREEN_W, { duration: 300, easing: PLAYBACK_EASE },
        () => runOnJS(commitNext)())
    } else if (e.translationX > THRESHOLD && currentIndex > 0) {
      dragX.value = withTiming( SCREEN_W, { duration: 300, easing: PLAYBACK_EASE },
        () => runOnJS(commitPrev)())
    } else {
      dragX.value = withTiming(0, { duration: 300, easing: PLAYBACK_EASE })
    }
  })

const containerStyle = useAnimatedStyle(() => ({
  transform: [{ translateX: dragX.value }],
}))
```

with `PLAYBACK_EASE = Easing.bezier(0.25, 0.46, 0.45, 0.94)`. `commitNext`
and `commitPrev` set state on the JS thread (advance `currentIndex`,
reset `dragX.value = 0` without animation, restart playback).

### Three-player vs single-player trade-off (decision pending)

The PWA mounts three `<video>` elements simultaneously. On iOS via
`expo-video`, **mounting three `VideoView`s with three `useVideoPlayer`s
is permitted** (the SDK 54 docs explicitly support multiple players),
but memory cost is real — three full-res HEVC decoders. On older
devices this might pressure the JetSamming heuristic.

Three options the port can take:

1. **Three-player (PWA parity).** Best feel, highest memory. Each player
   `replace()`s when the slot wraps (prev → next becomes the
   `currentIndex+1` slot).
2. **Two-player ping-pong.** Mount only `current` and `next` at any
   time. On commit-next, the `next` becomes `current` and a new
   `next-player` instance is created in-place. Slightly worse feel
   (back-swipe re-mounts the previous), much cheaper memory.
3. **Single-player + `replaceAsync()` (current native code).** Cheapest;
   visibly flashes between clips. Fails priority #1.

The current native PlaybackScreen uses option 3. **Open product
decision** documented in `screens/playback.md` — pick before the real
port lands.

### Traps

- `useNativeDriver` is irrelevant under Reanimated v3 — it always runs
  on the UI thread via worklets. Don't set it.
- The PWA's `e.preventDefault()` on horizontal swipes blocks iOS Safari's
  swipe-back. Native equivalent: turn off the stack swipe-back gesture
  on Playback/Discovery via `gestureEnabled: false` in the screen options
  (Playback) or `gestureDirection: 'vertical'` (Discovery's remix mode
  could allow swipe-down-to-dismiss; treat as v2).
- The PWA also does `dragActiveRef.current = false` on the first-clip
  back-swipe (boundary) so iOS Safari can run its own back gesture
  unobstructed. Native doesn't need this — first-clip back swipe just
  shows the rubber band.

### Reusable hooks suggestion

Pull this into a `useClipSwipe(clips, currentIndex)` hook in
`lib/playback/`. Both Playback and Discovery will consume it.

---

## §2 Hold-to-pause

### What it does (PWA)

- Touch begins anywhere on the video → 200ms timer starts.
- If the touch is still down at 200ms with < 15px of motion, the video
  pauses *cleanly* (no overlay, no dim).
- Release → if it was playing when the hold began, resume; otherwise
  stay paused.
- If the user moves more than 15px during the 200ms timer, the timer is
  cancelled and the motion is interpreted as a swipe.

### Source ground truth

`PlaybackScreen.jsx:284–300` (touchstart sets `wasPlayingBeforeHold` and
starts `holdTimerRef`), `:309–318` (touchmove cancels timer if motion
exceeds 15px), `:343–395` (touchend resumes if was-playing and no
nav happened).

### Native translation

`react-native-gesture-handler` `LongPress` gesture composed with the
swipe `Pan`:

```tsx
const longPress = Gesture.LongPress()
  .minDuration(200)
  .maxDistance(15)
  .onBegin(() => {
    wasPlayingBeforeHoldRef.current = player.playing
    player.pause()
  })
  .onFinalize(() => {
    if (wasPlayingBeforeHoldRef.current && !didCommitSwipeRef.current) {
      player.play()
    }
  })

const composed = Gesture.Simultaneous(pan, longPress, /* scrub */)
```

`Gesture.Simultaneous` lets pan + long-press track the same touch; the
long-press only fires if pan stays under the `maxDistance`.

### Traps

- Don't add an overlay (semi-transparent dim, "PAUSED" text, anything).
  The PWA UX is "the screen freezes; that's the feedback." Adding chrome
  ruins it.
- `player.pause()` on `expo-video` is synchronous; `player.play()`
  returns a promise that can reject if the player is in a bad state —
  swallow the rejection (`.catch(() => {})`).
- Don't pause from `onBegin` of `LongPress` if you want symmetric
  "touch starts → pause immediately" feel from the PWA — actually do.
  PWA pauses immediately on touchstart (not at 200ms). The 200ms only
  gates "did the user actually intend a hold" for the post-release
  decision. Native should mirror: pause in the `Pan.onBegin`, and only
  resume in `Pan.onEnd` if no swipe committed.

---

## §3 Scrub bar (bottom-25% touch zone)

### What it does (PWA)

- Touch in the **bottom 25%** of the viewport opens scrub mode
  immediately (no hold; no 200ms wait).
- The amber timeline appears at the bottom of the screen with the
  current trim-in time on the left, the trim duration on the right, and
  an amber dot at the playhead.
- Drag along the bar (full screen width) seeks the video.
- Release ends scrub mode and resumes playback if it was playing.

### Source ground truth

`PlaybackScreen.jsx:267–282` (touchstart in bottom 25% sets
`scrubActiveRef`, pauses video, calls `updateScrubFromTouch`),
`:302–307` (touchmove updates), `:344–352` (touchend ends scrub),
`:604–636` (the scrub bar JSX).

```ts
function updateScrubFromTouch(clientX) {
  const pct = Math.max(0, Math.min(1, clientX / window.innerWidth))
  const trimIn = currentClip.trim_in || 0
  const trimOut = currentClip.trim_out || video.duration
  const newTime = trimIn + pct * (trimOut - trimIn)
  video.currentTime = newTime
}
```

### Native translation

Another `Pan` gesture composed with the swipe pan. Disambiguate via the
**Y of `onBegin`** — if `event.absoluteY > SCREEN_H * 0.75`, it's a
scrub; otherwise it's a swipe-or-hold.

```tsx
const scrub = Gesture.Pan()
  .activateAfterLongPress(0)        // immediate, no long-press needed
  .onBegin((e) => {
    if (e.absoluteY < SCREEN_H * 0.75) return  // not in scrub zone
    scrubActive.value = true
    player.pause()
    seekToX(e.absoluteX)
  })
  .onUpdate((e) => {
    if (!scrubActive.value) return
    seekToX(e.absoluteX)
  })
  .onEnd(() => {
    if (!scrubActive.value) return
    scrubActive.value = false
    if (wasPlayingBeforeScrub) player.play()
  })

const composed = Gesture.Race(scrub, pan, longPress)   // scrub wins if in bottom 25%
```

Use `Gesture.Race` (or equivalent priority handling) so a scrub starting
in the bottom 25% beats the swipe Pan that would also match.

### Traps

- `expo-video`'s `useVideoPlayer.currentTime` setter is synchronous and
  pause/seek interacts with the iOS decoder buffering — seeking while
  playing is fine, but if the user scrubs fast across a 30s clip, the
  decoder may briefly stutter. Acceptable.
- The bar lives at `bottom: max(48, insets.bottom)` per PWA's
  `paddingBottom: 'max(3rem, env(safe-area-inset-bottom))'`. Use
  `useSafeAreaInsets()`.
- The bar must hide the bottom counter / play-pause button while
  scrubbing (`!isScrubbing && <BottomInfo />`). One state flag, mirrored
  in native.

---

## §4 Caption drag (Workspace) — free placement

### What it does (PWA)

- In Workspace, when the Caption tool is active, the caption overlay on
  the preview becomes draggable.
- Position is stored as `caption_x` / `caption_y` percent of the *frame*
  (0–100), clamped to 5–95% so the caption can't disappear off-edge.
- Drag updates DOM directly during motion (no React re-render mid-drag);
  state updates only on release. Persisted to DB on the same release.

### Source ground truth

`WorkspaceScreen.jsx` `startCaptionDrag(e)` (around lines 700–760):

```ts
function startCaptionDrag(e) {
  e.preventDefault()
  const previewBounds = previewRef.current.getBoundingClientRect()
  const start = { x: captionPosDraft.x, y: captionPosDraft.y }
  const startTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY }

  function onMove(ev) {
    ev.preventDefault()
    const dx = ev.touches[0].clientX - startTouch.x
    const dy = ev.touches[0].clientY - startTouch.y
    const newX = Math.max(5, Math.min(95, start.x + (dx / previewBounds.width) * 100))
    const newY = Math.max(5, Math.min(95, start.y + (dy / previewBounds.height) * 100))
    captionRef.current.style.left = `${newX}%`
    captionRef.current.style.top  = `${newY}%`
  }

  function onEnd() {
    const final = { x: parseFloat(captionRef.current.style.left), y: parseFloat(captionRef.current.style.top) }
    setCaptionPosDraft(final)
    saveClipChanges(activeClip.id, { caption_x: final.x, caption_y: final.y })
  }
}
```

### Native translation

`Gesture.Pan()` on the caption `<View>`, driving a Reanimated shared
value for position. Persist only on release.

```tsx
const captionX = useSharedValue(activeClip.caption_x ?? 50)
const captionY = useSharedValue(activeClip.caption_y ?? 85)
const startX = useSharedValue(0)
const startY = useSharedValue(0)

const captionPan = Gesture.Pan()
  .onBegin(() => {
    startX.value = captionX.value
    startY.value = captionY.value
  })
  .onUpdate((e) => {
    captionX.value = clamp(startX.value + (e.translationX / previewW.value) * 100, 5, 95)
    captionY.value = clamp(startY.value + (e.translationY / previewH.value) * 100, 5, 95)
  })
  .onEnd(() => {
    runOnJS(saveCaption)(captionX.value, captionY.value)
  })

const captionStyle = useAnimatedStyle(() => ({
  left:    `${captionX.value}%`,
  top:     `${captionY.value}%`,
  transform: [{ translateX: -50 }, { translateY: -50 }],
}))
```

`previewW.value` / `previewH.value` are shared values updated from the
preview's `onLayout`. `clamp` is a worklet helper (write it once in
`lib/utils.ts`).

### Pinch-to-resize (size 14–42)

PWA uses a `<input type="range">` slider on the caption controls panel
to adjust `caption_size` (14–42px). It is **not** a pinch on the caption
itself — the slider lives below the preview in the Caption controls
panel. Native should match: a `Slider` component (or a custom amber
range) on the caption controls. Implementing real pinch on the caption
view (`Gesture.Pinch()`) is a nice-to-have but not in PWA scope. Leave
the slider as primary; layer pinch on later if the user asks.

### Traps

- The preview frame size changes (rotation, safe area) — re-measure
  `previewW` / `previewH` on every `onLayout`, not just first mount.
- The caption box itself shouldn't capture the gesture if Caption tool
  isn't active (it's just visual then) — gate `Gesture.Pan()` with
  `.enabled(activeTool === 'caption')`.
- Save on release only — do not call `saveClipChanges` during `onUpdate`;
  it'll spam Supabase with 60 updates/sec.

---

## §5 Reorder long-press drag (Workspace, reorder mode)

### What it does (PWA)

- In Workspace, tap the "Reorder" tool → switches to a vertical list of
  clips (separate from the horizontal strip).
- Long-press (touch only — desktop has a drag handle) of 400ms on a row
  starts a drag. The row becomes a "ghost" floating card that follows
  the finger; the underlying list shifts a placeholder slot to where the
  finger is.
- Release commits the new order: writes one `update` per clip with new
  `order` values 0..N in a sequential loop.

### Source ground truth

`WorkspaceScreen.jsx` around `handleClipTouchStart`,
`startDragFromTouch`, `handleClipDragMove`, `handleClipDragEnd`.
Constants:

- Long-press timer: **400ms**
- Vertical jitter cancellation: **10px** during the 400ms (touchmove
  cancels the timer if `Math.abs(dy) > 10`)
- Row height (for splice math): `ROW_H = 56` (44 row + 12 gap, approx;
  measure off the rendered list)
- Ghost card style: `scale: 1.03, opacity: 0.97, boxShadow: '0 12px 40px rgba(0,0,0,0.6)'`
- Empty slot: dashed amber border

### Native translation

The most idiomatic option is
**[`react-native-draggable-flatlist`](https://github.com/computerjazz/react-native-draggable-flatlist)**
which wraps Reanimated + Gesture Handler and gives long-press-and-drag
out of the box. Use it.

```tsx
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist'

<DraggableFlatList
  data={clips}
  onDragEnd={({ data }) => commitReorder(data)}
  keyExtractor={(c) => c.id}
  renderItem={({ item, drag, isActive }) => (
    <ScaleDecorator>
      <Pressable onLongPress={drag} delayLongPress={400}>
        {/* row UI */}
      </Pressable>
    </ScaleDecorator>
  )}
  activationDistance={10}
/>
```

`commitReorder(data)` mirrors the PWA loop:

```ts
async function commitReorder(newOrder: Clip[]) {
  setClips(newOrder)  // optimistic
  for (let i = 0; i < newOrder.length; i++) {
    await supabase.from('clips').update({ order: i }).eq('id', newOrder[i].id)
  }
}
```

### Traps

- The `(scrapbook_id, order)` UNIQUE constraint will reject an update if
  another row briefly holds that order. The PWA's sequential
  `for…await` loop avoids this because each update completes before the
  next; **don't `Promise.all` it.** A "shift to negative then renumber"
  trick is unnecessary if you keep it sequential.
- If the user kills the app mid-loop, you get a corrupted order. Wrap
  the loop in a try/catch + re-sort fallback: on next mount, normalize
  orders to 0..N if there are gaps.
- Long-press triggers iOS's text-magnifier on web — irrelevant on RN,
  but ensure no surrounding `<TextInput>` captures focus when the user
  long-presses.
- Trigger a haptic via `Haptics.selectionAsync()` from `expo-haptics` on
  drag start. Free polish.

---

## §6 Trim handle drag (Workspace, TRIM mode)

### What it does (PWA)

- Tap "TRIM" tab in the crafting drawer → the clip strip expands into a
  full-width filmstrip with two amber drag handles on either side of the
  kept region.
- Drag a handle to set `trim_in` (left) or `trim_out` (right). Video
  seeks live as you drag.
- Release → snapshot for undo, persist `trim_in` / `trim_out` to DB,
  trigger "saved" flash.
- If a cut (split) already exists, cut handles also appear (sienna,
  draggable, between trim handles).

### Source ground truth

`WorkspaceScreen.jsx` `startTrimDrag(handle, e)` — `handle` is one of
`'in' | 'out' | 'cut_in' | 'cut_out'`. Clamping rules:

- `'in'`: `Math.max(0, Math.min(trim_out - 0.5, newIn))` — leaves at
  least 0.5s of kept region
- `'out'`: `Math.max(trim_in + 0.5, Math.min(duration, newOut))`
- `'cut_in'`: clamped between `trim_in` and `cut_out - 0.5`
- `'cut_out'`: clamped between `cut_in + 0.5` and `trim_out`
- After release: 2000ms before handles fade (`trimHandlesActive = false`)

### Native translation

`Gesture.Pan()` per handle, driving the same shared values as the
filmstrip math. Each handle is its own gesture detector — you do *not*
want them composed (a pan starting on the In handle should never
accidentally drag the Out handle).

```tsx
const trimIn = useSharedValue(clip.trim_in ?? 0)
const trimOut = useSharedValue(clip.trim_out ?? clip.duration)

function makeHandleGesture(which: 'in' | 'out') {
  return Gesture.Pan()
    .onUpdate((e) => {
      const x = clamp(e.absoluteX - stripLeft.value, 0, stripWidth.value)
      const secs = (x / stripWidth.value) * clip.duration
      if (which === 'in')  trimIn.value  = clamp(secs, 0, trimOut.value - 0.5)
      else                 trimOut.value = clamp(secs, trimIn.value + 0.5, clip.duration)
      runOnJS(seekVideo)(secs)
    })
    .onEnd(() => {
      runOnJS(commitTrim)(trimIn.value, trimOut.value)
    })
}
```

The filmstrip itself is a fixed-height (64px) row with overlays for
trimmed-out regions, kept region, and cut region. See `screens/workspace.md`
for the exact layered rendering plan.

### Traps

- Throttling video seeks: `seekVideo()` will fire on every gesture
  update (~60fps). `expo-video` handles this gracefully but you may want
  to `withSpring` the visual position separately from the seek to avoid
  perceived stutter. Test both — the PWA seeks on every move and feels
  fine.
- The PWA pauses the video on trim drag start. Native should too.
  Resume only if it was playing AND the user is not still in TRIM mode.

---

## §7 Mini-timeline scrub (Workspace preview)

### What it does (PWA)

- The 6px slim bar above the clip strip is touch-active. Touch and drag
  along it seeks the video. Same math as the Playback scrub bar but
  scoped to the active clip's `[trim_in, trim_out]` range.

### Source ground truth

`WorkspaceScreen.jsx` `startMiniScrub(e)`:

```ts
function startMiniScrub(e) {
  const rect = filmstripRef.current.getBoundingClientRect()
  function onMove(ev) {
    const x = (ev.touches?.[0] || ev).clientX - rect.left
    const pct = Math.max(0, Math.min(1, x / rect.width))
    videoRef.current.currentTime = pct * videoRef.current.duration
  }
  onMove(e)
  // attach window listeners for touchmove/touchend...
}
```

### Native translation

Same as §3, but bound to the bar's width via `onLayout`. Use a single
`Pan` gesture wrapping the bar.

### Traps

- The bar is 28px tall in *touch* size but renders the 6px stripe
  visually. Native equivalent: a 28px-tall `View` with a 6px child
  centered vertically. Tap target stays comfortable.

---

## §8 Lerping progress bar (Intake upload)

### What it does (PWA)

- The upload progress bar smooth-eases toward its target via a JS
  interval, never jumping.
- Mapping: remuxing 0–40% of bar, uploading 40–95%, "navigating" 95–100%.
- Source pattern (verbatim shape, from `IntakeScreen.jsx`):

  ```ts
  const tick = setInterval(() => {
    const target = uploadPhaseRef.current === 'remuxing'
      ? (uploadProgressRef.current.current / uploadProgressRef.current.total) * 40
      : 40 + (uploadProgressRef.current.current / uploadProgressRef.current.total) * 55
    smoothPctRef.current += (target - smoothPctRef.current) * 0.05
    setDisplayPct(smoothPctRef.current)
  }, 80)
  ```

  Eight values to nail: **80ms tick**, **0.05 multiplier**,
  **40% remux ceiling**, **40–95% upload range**, **95% upload ceiling**
  (5% reserved for nav).

### Native translation

Reanimated has the right primitive for this: drive a `useSharedValue`
toward a target on every frame. Two ways:

1. **`useFrameCallback`** (Reanimated v3) — fires every frame. Compute
   the same lerp on the UI thread, write to a shared value.
2. **`setInterval(..., 80)`** in JS land, updating React state. Slower
   but matches the PWA exactly.

Recommended: option 2. The PWA's 80ms tick is intentional — it gives a
calm visual cadence that 60fps undermines. Match it.

```ts
useEffect(() => {
  const tick = setInterval(() => {
    const target = phaseRef.current === 'remuxing'
      ? (progressRef.current.current / progressRef.current.total) * 40
      : 40 + (progressRef.current.current / progressRef.current.total) * 55
    smoothRef.current += (target - smoothRef.current) * 0.05
    setDisplayPct(smoothRef.current)
  }, 80)
  return () => clearInterval(tick)
}, [])
```

The progress bar itself is a fill `<View>` with `width: ${displayPct}%`.

### Traps

- *Don't* animate the bar with `withTiming(target, { duration: 80 })` —
  that produces a different curve. The exponential lerp is the visual
  signature.
- Convert `displayPct` to percentage *and* keep one decimal for the
  rendered label ("47%"), or it'll jitter. Use `Math.round`.

---

## §9 Pull-to-refresh (Home)

### What it does (PWA)

- Touch-handled implementation (not the native PTR mechanism) because
  Safari's overscroll behavior is unreliable. PWA pulls down on the
  scroll container; an amber spinner slides in.
- Constants: 0.5× drag multiplier, 68px max pull, 52px commit threshold,
  44px refreshing height, 200ms height ease-back.

### Source ground truth

`HomeScreen.jsx` `handlePullStart`, `handlePullMove`, `handlePullEnd`
(early in the file). State variables: `pullStartY` (ref), `pullY`
(useState), `refreshing` (useState).

### Native translation

Use `RefreshControl` — the *standard* RN one — with the amber tint. The
current `HomeScreen.tsx` already does this:

```tsx
refreshControl={
  <RefreshControl
    refreshing={refreshing}
    onRefresh={onRefresh}
    tintColor={colors.amber}
    colors={[colors.amber]}   // Android
  />
}
```

You do *not* need to replicate the PWA's custom pull math. The PWA
hand-rolls it because Safari is finicky; native gets the system gesture
for free and it already matches the brand if you tint it amber.

### Traps

- On iOS, `RefreshControl.tintColor` is the spinner color. The
  background dim is system-driven and not customizable — that's fine,
  it sits above the walnut bg cleanly.
- Don't forget the `colors` prop for Android even though iOS-first;
  it costs nothing.
- The PWA also renders an inline `mb-1` amber spinner during refresh
  for desktop fallback — irrelevant on native.

---

## §10 Tap-feedback (`active:scale-[0.98]` everywhere)

### What it does (PWA)

Every interactive element gets a hair of scale-down on press via
Tailwind `active:scale-[0.98]`. Some buttons also dim opacity to ~0.7–0.8
(`active:opacity-80`).

### Native translation

The current native code already does this right via `Pressable`'s
style callback:

```tsx
<Pressable style={({ pressed }) => [
  styles.card,
  pressed && { transform: [{ scale: 0.98 }], opacity: 0.92 },
]}>
```

Bake it into a reusable `TouchCard` wrapper to keep screen code clean.

### Traps

- Don't reach for Reanimated `withSpring` for this — it overshoots and
  feels bouncy. The PWA's instant flat scale is the right feel.
- If a `Pressable` wraps a `Pressable` (e.g. card with options menu
  inside), only the inner one should fire on its hit area. Use
  `hitSlop` to make the inner targets more forgiving and `Pressable`'s
  `onPress` bubbling is fine — no extra work.

---

## §11 Bottom sheet (Intake step 2, Discovery remix info, action sheets)

### What it does (PWA)

- Slide-up sheet anchored to the bottom with rounded top corners,
  shadow above, a 40×4 drag handle, and a dimmed backdrop.
- Three flavors:
  - **Modal sheet with form** (Intake step 2, Rename & Redate, Settings
    confirm). Not dismissible by tapping outside; explicit X or Cancel.
  - **Info sheet** (Discovery remix-mode "Go to this scrapbook"). Tap
    outside dismisses.
  - **Action sheet** (Playback `MoreHorizontal` menu, ScrapbookDetail
    Delete). Tap outside dismisses.

### Native translation

For sheets with snap points / pan-to-dismiss, use **`@gorhom/bottom-sheet`**.
For one-shot confirmation sheets without drag-to-dismiss, an absolutely
positioned `<View>` + `Animated.View` slide-up is simpler and matches
the PWA more closely.

When using `@gorhom/bottom-sheet`:

```tsx
import BottomSheet from '@gorhom/bottom-sheet'

const sheetRef = useRef<BottomSheet>(null)

<BottomSheet
  ref={sheetRef}
  snapPoints={['CONTENT_HEIGHT']}     // dynamic via enableDynamicSizing
  enableDynamicSizing
  enablePanDownToClose
  backgroundStyle={{ backgroundColor: colors.walnutMid, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}
  handleIndicatorStyle={{ backgroundColor: colors.walnutLight, width: 40, height: 4 }}
  backdropComponent={(props) => (
    <BottomSheetBackdrop
      {...props}
      opacity={0.5}
      pressBehavior="close"
      appearsOnIndex={0}
      disappearsOnIndex={-1}
    />
  )}
>
  {/* sheet content */}
</BottomSheet>
```

Per-sheet brand defaults — put them in a `<KasetteBottomSheet>` wrapper
so every screen using one inherits the right look.

### Traps

- `@gorhom/bottom-sheet` needs `react-native-gesture-handler` and
  `react-native-reanimated` installed and the `GestureHandlerRootView`
  wrapping your app entry (set this once in `App.tsx`).
- iOS Dynamic Type / large text can make sheets clip when
  `enableDynamicSizing` measures wrong. Test once with
  Accessibility → Display & Text → Large Text on.
- Backdrop opacity 0.5 matches PWA. Don't make it darker; the PWA
  designed for the dim to *show* the underlying screen as a hint of
  context.

---

## §12 "Saved" amber flash (Workspace)

### What it does (PWA)

Every successful auto-save triggers an amber Fraunces italic "saved"
text in the nav header (`12px font-semibold`) that appears instantly and
disappears 2500ms later. Cleared and re-triggered on every save — back-
to-back saves restart the timer.

### Source ground truth

`WorkspaceScreen.jsx` `saveClipChanges()` end-of-function:

```ts
clearTimeout(savedFlashTimer.current)
setSavedFlash(true)
savedFlashTimer.current = setTimeout(() => setSavedFlash(false), 2500)
```

### Native translation

Identical pattern:

```tsx
const flashTimer = useRef<NodeJS.Timeout | null>(null)
const [savedFlash, setSavedFlash] = useState(false)

function triggerSavedFlash() {
  if (flashTimer.current) clearTimeout(flashTimer.current)
  setSavedFlash(true)
  flashTimer.current = setTimeout(() => setSavedFlash(false), 2500)
}

// in render:
{savedFlash && (
  <Text style={{ fontFamily: fonts.displayItalic, fontSize: 13, color: colors.amber }}>
    saved
  </Text>
)}
```

Optionally fade in / out with `withTiming(opacity, { duration: 150 })`.
The PWA has no fade — the flash is instant on and instant off. Match
that.

### Traps

- Clear the timer on unmount or you'll set state on an unmounted
  component. `useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current) }, [])`.
- Don't show the flash for failed saves. The PWA suppresses it on error
  (the `error` branch returns before the flash).

---

## §13 Wake lock during upload

### What it does (PWA)

Calls `navigator.wakeLock.request('screen')` when upload starts,
releases on completion, cancellation, or unload. Re-acquires on
`visibilitychange` if the app becomes visible mid-upload.

### Native translation

`expo-keep-awake` — same intent, simpler API:

```tsx
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake'

async function beginUpload() {
  await activateKeepAwakeAsync('upload')   // tag
  // ...
}

function endUpload() {
  deactivateKeepAwake('upload')
}
```

- No `visibilitychange` handling needed — `expo-keep-awake` persists
  across app backgrounding correctly.
- Always wrap in `try/finally` so the wake lock is released even if
  the upload throws.

### Traps

- Don't `await activateKeepAwakeAsync` from inside a critical path —
  it's fast but not instant. Fire it and move on.
- The tag (`'upload'`) is important — if two screens both call activate
  with default tag and one calls deactivate, both lose the lock.
  Always namespace.

---

## §14 Cassette reel spinner

Defined in detail in `00-brand-system.md` §7. Briefly:

- Two SVG reels, 48–56px depending on context.
- Forward instance: rotate 360° in 2.1s, infinite, linear.
- Reverse instance: rotate -360° in 1.7s, infinite, linear.
- Always amber on dark background.
- Replaces every "loading" spinner in the app body. Top-bar / refresh
  spinners may use system spinners with amber tint.

### Native translation

`react-native-svg` for the reel SVG; Reanimated for rotation:

```tsx
function Reel({ reverse = false, size = 48 }) {
  const angle = useSharedValue(0)
  useEffect(() => {
    angle.value = withRepeat(
      withTiming(reverse ? -360 : 360, {
        duration: reverse ? 1700 : 2100,
        easing: Easing.linear,
      }),
      -1
    )
  }, [reverse])
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${angle.value}deg` }],
  }))
  return (
    <Animated.View style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size} viewBox="0 0 48 48">
        {/* exact PWA SVG paths from §7 */}
      </Svg>
    </Animated.View>
  )
}
```

Drop this in `kasette-native/components/Reel.tsx` and import everywhere.

### Traps

- Don't use the older `Animated.timing` API — Reanimated `withRepeat`
  loops smoothly; `Animated.loop` works but is one more thing to maintain.
- Two reel instances side-by-side need their own shared values; don't
  reuse one across both or the reverse one stalls.

---

## §15 Frosted-glass top-bar buttons

Defined in `00-brand-system.md` §7. The native current code uses a
fallback solid rgba; for fidelity use `expo-blur` `<BlurView>`. Wrap in
a circular `overflow: hidden` view.

### Native translation

```tsx
import { BlurView } from 'expo-blur'

<View style={{ width: 40, height: 40, borderRadius: 20, overflow: 'hidden' }}>
  <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
  <Pressable
    style={[StyleSheet.absoluteFill, {
      borderWidth: 1,
      borderColor: 'rgba(245,222,179,0.15)',
      borderRadius: 20,
      alignItems: 'center', justifyContent: 'center',
    }]}
    hitSlop={12}
    onPress={...}
  >
    <ArrowLeft size={18} strokeWidth={1.75} color={colors.wheat} />
  </Pressable>
</View>
```

### Traps

- `BlurView`'s `intensity` is iOS only on a `tint` basis; on Android it
  falls back to a translucent overlay. Test on Android only after
  the iOS pass is solid.
- The current PlaybackScreen fallback (solid rgba) is fine for v0.1.
  Upgrade to BlurView when polishing.

---

## §16 Photo media handling

### What it does (PWA)

A clip with `media_type === 'photo'` is shown as a `<img>` instead of
`<video>`. It auto-advances after `duration` seconds (default 5). The
mute tool and trim handles are hidden for photos. Duration is editable
1–30s via a +/- stepper in the Tools row.

### Native translation

- Render `<Image source={{ uri: clip.video_url }} />` (the field name is
  unfortunate but `video_url` holds the image URL for photos — schema
  decision).
- Auto-advance: `setTimeout(() => goNext(), duration * 1000)`.
- Progress bar: simple `Date.now()`-based interval like PWA
  `PlaybackScreen.jsx:144–151`.
- Hide trim / mute / scrub UI when `media_type === 'photo'`.

### Traps

- Don't try to mount a video player for photos — it'll spin trying to
  decode and burn battery.
- The thumbnail_url equals video_url for photos. No separate poster.

---

## §17 Optimistic UI + revert on error

Across the app: every DB write fires *after* state update. On error,
revert local state.

### Source ground truth

`WorkspaceScreen.jsx` `saveClipChanges`:

```ts
const prevClip = clips.find(c => c.id === clipId)
updateClipLocal(clipId, changes)            // optimistic
const { error } = await supabase.from('clips').update(changes).eq('id', clipId)
if (error) {
  // revert: build {key: prevClip[key]} object and re-apply
  const revert = Object.fromEntries(Object.keys(changes).map(k => [k, prevClip[k] ?? null]))
  updateClipLocal(clipId, revert)
  return
}
triggerSavedFlash()
```

### Native translation

Identical. Don't bake in any retry / queue — the PWA doesn't, and adding
it changes the failure semantics. Mom's network being flaky is
acceptable as "the change didn't stick, do it again."

### Traps

- Optimistic update for the *first* change shown immediately, persisted
  after. If two changes overlap (user trims, then immediately changes
  caption), the second optimistic update can stomp the first's revert.
  PWA accepts this — it's vanishingly rare and "last write wins"
  matches the user's mental model.

---

## §18 Tap zones on Playback (left 25% / right 75%)

### What it does (PWA)

Tapping (no drag) in the left 25% of the screen goes to the previous
clip. Tapping in the right 75%+ goes to the next clip. Center tap (25%
< x < 75%) is the "press and hold to pause" zone (since hold is the
default touch action there).

### Source ground truth

`PlaybackScreen.jsx:190–208`:

```ts
function handleTap(e) {
  if (e.target.closest('button')) return
  if (showActionSheet) { setShowActionSheet(false); return }
  if (Math.abs(dragOffsetRef.current) > 8) return
  if (holdOccurredRef.current) { holdOccurredRef.current = false; return }

  const rect = e.currentTarget.getBoundingClientRect()
  const x = e.clientX - rect.left
  if (x < rect.width * 0.25 && currentIndex > 0) goToClip(currentIndex - 1)
  if (x > rect.width * 0.75 && currentIndex < clips.length - 1) goToClip(currentIndex + 1)
}
```

### Native translation

`Tap` gesture composed with the existing pan/long-press, gated by
`absoluteX`:

```tsx
const tap = Gesture.Tap()
  .maxDuration(250)    // exclude long-presses
  .onEnd((e) => {
    const x = e.absoluteX
    if (x < SCREEN_W * 0.25 && currentIndex > 0) runOnJS(goPrev)()
    else if (x > SCREEN_W * 0.75 && currentIndex < clips.length - 1) runOnJS(goNext)()
  })

const composed = Gesture.Race(pan, longPress, scrub, tap)
```

### Traps

- Same as Discovery — Discovery uses the same tap-zone *behavior* but
  via `touchend` quick-tap logic (`Math.abs(offset) < 8`), so the
  decision is bundled into the swipe gesture's `onEnd`. You can match
  either pattern in native; for consistency, treat tap as its own
  gesture composed with the others.

---

## §19 Modal / sheet dismissal hierarchy

When a sheet is open over a screen with its own gestures, the underlying
gestures must be inert. PWA does this with z-index + a tap-on-backdrop
handler. Native equivalent:

- `@gorhom/bottom-sheet` handles this automatically (its backdrop captures
  touches above the underlying view).
- For hand-rolled sheets (`absolute bottom-0`), wrap the backdrop in a
  `Pressable onPress={dismiss}` and rely on RN's pointer event ordering
  (the backdrop is rendered later in the tree so it sits "on top").

Common rules across all sheets:

- Tap backdrop = dismiss (unless the sheet has form data; then no).
- Drag handle visible at the top, 40×4 walnut-light.
- Sheet animates in over `300ms` with `Gentle Enter` easing
  (`Easing.bezier(0, 0, 0.2, 1)`). `@gorhom/bottom-sheet` defaults to
  spring; configure `animationConfigs` with `withTiming` if you want the
  flat ease.

---

*Cross-references:* see `00-brand-system.md` for color/font/motion tokens
referenced above, and the per-screen docs for which interactions live on
each screen (each will say "see §N of `02-interactions-glossary.md`"
rather than re-describe).
