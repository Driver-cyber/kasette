# screens/workspace.md — Workspace (Edit)

> **What it is.** The editing environment. Where mom trims her clips,
> writes captions on them, splits out boring middles, reorders the
> playlist, and adjusts photo display durations. The densest screen in
> the app and the slowest to port — but the second the user touches
> it, "made this with my phone" becomes "made this with intent."
>
> **Priority for native.** High, but Day-N. Mom can still upload from
> the web and Watch from native for v0.5. The wife's TestFlight install
> doesn't need Workspace. But it's the only screen where the *editor*
> personality of Cassette lives, and it has to ship eventually.

Route: `/scrapbook/:id/edit` *(CLAUDE.md drift: it says `/workspace`)*
File: `kasette/app/src/screens/WorkspaceScreen.jsx` (**1606 lines** —
the largest file in the codebase) · Native: not yet ported.

---

## 1. Purpose & user mental model

She has 20 clips in a scrapbook. She wants to:

- Trim the awkward 4 seconds off the start of one.
- Cut out the boring middle of another (a "split").
- Write a tiny caption — "*the day you turned 6*" — on a clip and
  drop it in the bottom-third of the frame.
- Mute a clip that has wind noise.
- Reorder them so the cake-cutting comes after the present-opening.
- Tap Save.

The screen is *one fixed layout* — no scrolling. Top half is the
preview; bottom half is the clip strip + tool drawer. Everything she
touches lives in view at once. There are no separate edit screens for
each tool — they all use the same preview + filmstrip workspace.

Tools are mutually exclusive: TRIM, SPLIT, or one of the lesser tools
(Caption / Reorder / Mute / Add Clips / Remove). The crafting drawer's
header row toggles between them.

All edits **auto-save** continuously. The Save button is just a
navigation shortcut to ScrapbookDetail. The amber "saved" flash next
to it confirms each persist.

---

## 2. Layout (top to bottom — fixed)

```
┌───────────────────────────────────────────────────────────────┐
│  [←]   Scrapbook Title           [saved] [↶ Undo]  [✓ Save]   │  ← header (h ~52px)
├───────────────────────────────────────────────────────────────┤
│  (pending uploads notice, conditional)                        │  ← red 10px text
├───────────────────────────────────────────────────────────────┤
│                                                               │
│                                                               │
│                                                               │
│                  [VIDEO PREVIEW]                              │  ← flex: 1 1 0
│                                                               │
│                                                               │
│           [▶ play button, centered]                           │
│                                                               │
│                                                               │
├───────────────────────────────────────────────────────────────┤
│  ▰▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱        │  ← mini timeline (6px slim bar)
├───────────────────────────────────────────────────────────────┤
│  [TRIM] | [SPLIT] | [TOOLS]    0:04 → 0:18 · 0:14 kept        │  ← crafting drawer header
├───────────────────────────────────────────────────────────────┤
│  (expanded filmstrip when TRIM or SPLIT — 64px tall)          │
├───────────────────────────────────────────────────────────────┤
│  (tool row when TOOLS expanded)                               │
│  [🔇 Mute] [T Caption] [+ Add Clips] [↕ Reorder] [🗑 Remove]    │
├───────────────────────────────────────────────────────────────┤
│  ┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐ → → →                   │  ← horizontal clip strip (64×64 cards)
│  │1 ││2 ││3 ││4 ││5 ││6 ││7 ││8 ││9 │                         │  ← scrollable; active = amber border
│  └──┘└──┘└──┘└──┘└──┘└──┘└──┘└──┘└──┘                         │
└───────────────────────────────────────────────────────────────┘
```

### Variant: Reorder mode

The horizontal clip strip and tool row collapse; a *vertical*
drag-to-reorder list fills the bottom half. Header shows "Hold & drag
to reorder" + a Done button.

### Variant: Caption mode

The horizontal clip strip stays. A bottom panel slides up with:
- Text input (Fraunces italic, walnut-mid bg)
- Size slider (14–42)
- Done button

The caption overlay on the preview becomes draggable (dashed amber
border around it).

### Measurements (verbatim from `WorkspaceScreen.jsx`)

| Element | Position / size | Style |
|---|---|---|
| Header | flex-shrink-0, `px-5 pt-12 pb-2` | bottom border walnut-light |
| Back btn | 18 px ArrowLeft | rust |
| Title | font-display 18 px, truncated max 160 px | wheat, center |
| Saved flash | 12 px font-semibold, amber, italic Fraunces | conditional render |
| Undo btn | 32×32 rounded-full | amber 25%-bg, amber 15-stroke border, Undo2 15 px |
| Save btn | amber pill, py-2 px-4 | walnut text 13 px semibold + Check icon |
| Preview zone | `flex: 1 1 0`, `rounded-2xl`, `mx-4`, `bg-deep` | wraps video element |
| Video element | absolute fill, object-contain (NOT cover) | poster = thumbnail_url |
| Preview overlay gradient | `linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.5) 100%)` | for chrome contrast |
| Clip counter badge | top-left, frosted glass | "Clip 3 of 12" amber 11 px |
| Duration badge | top-right, frosted glass | "0:14 kept" wheat 11 px |
| Play btn | 44×44 amber circle, center | shadow `0 4px 16px rgba(0,0,0,0.3)` |
| Mini timeline | 6 px tall, mx-4 my-2 | track rgba(amber, 0.45) for kept; rgba(0,0,0,0.5) for cut; white playhead dot 3×3 |
| Crafting drawer header | flex justify-between, `px-4 py-2`, border-t/b walnut-light | left: 3 buttons; right: timestamps when TRIM/SPLIT |
| TRIM button | px-3.5 py-1.5 rounded-lg | active = amber border + bg `rgba(amber, 0.1)` |
| SPLIT button | same | active = sienna |
| TOOLS button | same | active = amber |
| Filmstrip (when expanded) | 64 px tall, mx-4, rounded-lg | gradient bg + overlays |
| Tool row | 5 buttons, `px-4 py-2`, border-b | 9×9 icon in 39×39 button + 9 px caps label below |
| Clip strip | horizontal scroll, `px-4 pt-3 pb-1` | gap-2 |
| Clip card | 64×64, rounded-xl, border | active = amber border + amber-10 bg |
| Reorder list | vertical, `px-4 pb-6`, gap-1.5 | rows are 44 px tall |
| Caption panel | flex-shrink-0, border-t, `px-5 pt-3.5` | text input + slider |
| Remove sheet | bottom sheet, walnut-mid, rounded-t-3xl | sienna CTA |

The whole layout fits inside the iPhone safe-area on every device. **No
scroll on the page itself.** The clip strip scrolls horizontally; the
reorder list scrolls vertically when in reorder mode.

---

## 3. State machine — modes and tools

Workspace has many state vars but the *behavior* reduces to a small
set of mutually exclusive modes:

### Modes

| Mode | Trigger | Visible UI changes |
|---|---|---|
| **Idle** | default | clip strip + preview + mini timeline |
| **TRIM** | tap `TRIM` button | filmstrip expands; trim handles drag |
| **SPLIT** | tap `SPLIT` button | filmstrip expands; two split handles drag |
| **TOOLS** | tap `TOOLS` button | tool row appears below crafting drawer |
| **Caption** | tap Caption tool (inside TOOLS) | caption controls panel slides up; preview overlay becomes draggable |
| **Reorder** | tap Reorder tool | clip strip replaced w/ vertical reorder list |
| **Remove confirmation** | tap Remove tool | confirmation sheet over everything |

### Top-level state variables

```ts
// Data
const [scrapbook, setScrapbook] = useState<Scrapbook|null>(null)
const [clips, setClips] = useState<Clip[]>([])
const [activeClipId, setActiveClipId] = useState<string|null>(null)
const [loading, setLoading] = useState(true)

// Modes
const [trimMode, setTrimMode] = useState<null|'trim'|'split'>(null)
const [toolsExpanded, setToolsExpanded] = useState(false)
const [activeTool, setActiveTool] = useState<null|'caption'|'mute'|'reorder'|'remove'>(null)
const [reorderMode, setReorderMode] = useState(false)
const [confirmRemoveId, setConfirmRemoveId] = useState<string|null>(null)

// Playback
const [isPlaying, setIsPlaying] = useState(false)
const [playheadPct, setPlayheadPct] = useState(0)         // 0..100

// Trim handles transient visibility
const [trimHandlesActive, setTrimHandlesActive] = useState(false)

// Split
const [splitInPct, setSplitInPct] = useState(35)          // 0..100
const [splitOutPct, setSplitOutPct] = useState(65)

// Undo
const [undoable, setUndoable] = useState<UndoSnapshot|null>(null)

// Caption drafts (synced from activeClip on change, persisted on Done)
const [captionDraft, setCaptionDraft] = useState('')
const [captionSizeDraft, setCaptionSizeDraft] = useState(24)
const [captionPosDraft, setCaptionPosDraft] = useState({ x: 50, y: 85 })

// Saved flash
const [savedFlash, setSavedFlash] = useState(false)
const savedFlashTimer = useRef<NodeJS.Timeout|null>(null)

// Reorder drag (touch)
const [dragState, setDragState] = useState<{ fromIndex: number; currentIndex: number }|null>(null)
const [ghostClip, setGhostClip] = useState<Clip|null>(null)
const [ghostInitialY, setGhostInitialY] = useState(0)
const [isActiveDragging, setIsActiveDragging] = useState(false)
const longPressTimer = useRef<NodeJS.Timeout|null>(null)
const longPressData = useRef<{ index: number; clientY: number; rowEl: HTMLElement }|null>(null)
const ghostOffsetRef = useRef(0)
const wasReorderDrag = useRef(false)
const clipsRef = useRef<Clip[]>([])

// Refs to DOM/RN elements
const videoRef = useRef<HTMLVideoElement|null>(null)
const captionRef = useRef<HTMLDivElement|null>(null)
const previewRef = useRef<HTMLDivElement|null>(null)
const filmstripRef = useRef<HTMLDivElement|null>(null)
const clipStripRef = useRef<HTMLDivElement|null>(null)
const captionInputRef = useRef<HTMLInputElement|null>(null)
```

### Derived

```ts
const activeClip = clips.find(c => c.id === activeClipId)
const isVideo = activeClip?.media_type !== 'photo'
const trimIn = activeClip?.trim_in ?? 0
const trimOut = activeClip?.trim_out ?? activeClip?.duration ?? 0
const keptDuration = trimOut - trimIn
const trimInPct = activeClip?.duration ? (trimIn / activeClip.duration) * 100 : 0
const trimOutPct = activeClip?.duration ? (trimOut / activeClip.duration) * 100 : 100
```

### `UndoSnapshot` shape

```ts
type UndoSnapshot = {
  type: 'clip'
  clipId: string
  prev: Partial<Clip>          // fields to revert (e.g. { trim_in: 4.5, trim_out: 18 })
}
```

Single-level only. Every new save snapshots and overwrites
`undoable`.

---

## 4. Data fetches & writes

### Mount

```ts
// Try cache first (populated by ScrapbookDetail)
const cached = getCached(id)
if (cached?.scrapbook) {
  setScrapbook(cached.scrapbook)
  setClips(cached.clips)
  setActiveClipId(cached.clips[0]?.id ?? null)
  setLoading(false)
}

// Refetch in parallel for freshness
Promise.all([
  supabase.from('scrapbooks').select('id, name, user_id').eq('id', id).single(),
  supabase.from('clips')
    .select('id, scrapbook_id, video_url, thumbnail_url, duration, trim_in, trim_out, cut_in, cut_out, caption_text, caption_x, caption_y, caption_size, order, recorded_at, media_type')
    .eq('scrapbook_id', id)
    .order('order', { ascending: true }),
]).then(([{ data: sb }, { data: cl }]) => {
  if (sb) setScrapbook(sb)
  if (cl) {
    setClips(cl)
    if (!activeClipId) setActiveClipId(cl[0]?.id ?? null)
  }
  if (!cached) setLoading(false)
})
```

### `saveClipChanges(clipId, changes)` — the auto-save core

Every edit goes through this:

```ts
async function saveClipChanges(clipId: string, changes: Partial<Clip>) {
  const prevClip = clips.find(c => c.id === clipId)
  updateClipLocal(clipId, changes)         // optimistic

  const { error } = await supabase.from('clips').update(changes).eq('id', clipId)
  if (error) {
    // Revert
    if (prevClip) {
      const revert = Object.fromEntries(Object.keys(changes).map(k => [k, prevClip[k] ?? null]))
      updateClipLocal(clipId, revert)
    }
    return
  }
  // Saved flash
  if (savedFlashTimer.current) clearTimeout(savedFlashTimer.current)
  setSavedFlash(true)
  savedFlashTimer.current = setTimeout(() => setSavedFlash(false), 2500)
}
```

**Mute is the exception** — it's client-side only state, not saved.

### Reorder commit

```ts
async function commitReorder(newOrder: Clip[]) {
  setClips(newOrder)
  for (let i = 0; i < newOrder.length; i++) {
    await supabase.from('clips').update({ order: i }).eq('id', newOrder[i].id)
  }
  // No saved flash for reorder — too much to flash on
}
```

**Sequential loop, not parallel** — see
`02-interactions-glossary.md` §5 and `03-data-model.md` §2.

### Remove clip

```ts
async function removeClip(clipId: string) {
  const target = clips.find(c => c.id === clipId)
  const remaining = clips.filter(c => c.id !== clipId)

  // Optimistic
  setClips(remaining)
  setActiveClipId(remaining[0]?.id ?? null)
  setConfirmRemoveId(null)

  // Persist
  await supabase.from('clips').delete().eq('id', clipId)
  // Renumber orders
  for (let i = 0; i < remaining.length; i++) {
    if (remaining[i].order !== i) {
      await supabase.from('clips').update({ order: i }).eq('id', remaining[i].id)
    }
  }
  // Delete R2 files if no other clip references the URLs
  await safeDeleteClipFiles([target!])
}
```

---

## 5. Every interaction

### 5.1 Tool toggle (header row)

The crafting drawer has three tab buttons:

- **TRIM** — sets `trimMode = 'trim'` (toggles off if already trim).
- **SPLIT** — sets `trimMode = 'split'` (toggles off if already split).
- **TOOLS** — sets `toolsExpanded = !toolsExpanded`.

TRIM and SPLIT are mutually exclusive. Tapping TRIM while SPLIT is
active switches to TRIM (and vice versa). TOOLS is independent —
TOOLS-expanded can coexist with TRIM-active (filmstrip + tool row both
visible).

When `activeTool === 'caption'` and the user toggles TRIM or SPLIT,
the caption panel closes (call `saveCaptionDraft()` first to persist
pending caption edits).

### 5.2 Trim handle drag (TRIM mode)

See `02-interactions-glossary.md` §6. Workspace-specific:

- Handle visual: 52 px wide (centered on the trim line via `marginLeft: -26`), amber bg, `box-shadow: 0 0 8px rgba(amber, 0.7)`, three vertical dot indicators inside.
- Min gap: `trim_out - trim_in >= 0.5` (don't let the user trim the clip to zero).
- On release: snapshot `undoable = { type:'clip', clipId, prev:{ trim_in: initial, trim_out: initial } }`, save, set `trimHandlesActive = false` after 2000 ms.
- Video pauses on drag start, doesn't resume after release.

#### Cut handles (when `cut_in` / `cut_out` exist)

In TRIM mode, if the active clip has a cut, additional sienna handles
appear *between* the trim handles. Drag them to adjust the cut region.
Same drag mechanics, sienna styling.

### 5.3 Split tool (3-step flow)

In SPLIT mode (no existing cut):

1. Tap SPLIT → filmstrip expands; two sienna draggable bars appear at
   ~30% and ~70% of the clip's duration. Excluded zone shades between
   them (`rgba(sienna, 0.22)`). Button below filmstrip says
   "Split · {duration} cut".
2. Drag the bars to position the cut region.
3. Tap "Split" button → `commitSplit()`:

   ```ts
   async function commitSplit() {
     const cutIn = (splitInPct / 100) * activeClip.duration
     const cutOut = (splitOutPct / 100) * activeClip.duration
     setUndoable({
       type: 'clip',
       clipId: activeClip.id,
       prev: { cut_in: activeClip.cut_in ?? null, cut_out: activeClip.cut_out ?? null }
     })
     await saveClipChanges(activeClip.id, { cut_in: cutIn, cut_out: cutOut })
     setTrimMode(null)
   }
   ```

If the active clip *already has* a cut (`cutIn != null`):

- SPLIT mode shows only "Remove cut" button. Tap → `removeSplit()`:

  ```ts
  async function removeSplit() {
    setUndoable({ ... })
    await saveClipChanges(activeClip.id, { cut_in: null, cut_out: null })
    setTrimMode(null)
  }
  ```

**Don't reintroduce the deprecated `confirmSplitPoint()` function** —
the current `advanceSplitStep()` / commitSplit unified flow is the
final pattern. The two bars are both grabbable from the start; there's
no "lock the first bar then place the second."

#### Min gap on split

```ts
const minGapPct = Math.min(2 / activeClip.duration * 100, 5)
```

Whichever is smaller of "2 seconds" or "5% of clip" — prevents
zero-length cuts.

#### Auto-center on enter

When SPLIT mode opens, `useEffect` auto-centers the two bars at
~30%-distance around the playable midpoint:

```ts
useEffect(() => {
  if (trimMode !== 'split' || !activeClip) return
  const start = activeClip.trim_in ?? 0
  const end = activeClip.trim_out ?? activeClip.duration
  const range = end - start
  const center = start + range * 0.5
  const half = Math.max(1, range * 0.15)
  const inTime = Math.max(start + 0.1, center - half)
  const outTime = Math.min(end - 0.1, center + half)
  setSplitInPct(activeClip.duration > 0 ? (inTime / activeClip.duration) * 100 : 35)
  setSplitOutPct(activeClip.duration > 0 ? (outTime / activeClip.duration) * 100 : 65)
}, [trimMode, activeClip?.id])
```

### 5.4 Mini-timeline scrub

See `02-interactions-glossary.md` §7. Workspace-specific: the timeline
clamps scrubbing to `[trim_in, trim_out]`. Tap-and-drag along the bar
seeks within the kept region. No commit threshold; immediate seek.

### 5.5 Preview swipe between clips

The preview zone has touch handlers — swipe left = next clip, swipe
right = prev clip. Thresholds:
- `Math.abs(dx) >= 50` (horizontal distance)
- `Math.abs(dy) <= 0.8 * Math.abs(dx)` (favor horizontal)

Updates `activeClipId`.

This is a smaller / less polished version of the Playback swipe — no
preloaded next, no rubber-band. Native: same lightweight pattern (just
gate it differently from the trim/split handle gestures).

### 5.6 Caption tool

Tap "Caption" in TOOLS row → `setActiveTool('caption')`. Then:

- Caption controls panel slides up from bottom (text input + slider).
- Caption overlay on preview becomes draggable (dashed amber border).
- 200 ms later, `captionInputRef.current?.focus()`.

#### Caption drag (free placement)

See `02-interactions-glossary.md` §4. Workspace-specific: drag updates
DOM directly during motion (no React re-render mid-drag); persists on
release via `saveClipChanges`.

#### Size slider

Range input 14–42, accent-amber. Updates `captionSizeDraft` live.
On Done, persists with rest of caption fields.

#### Done (caption tool)

Tap "Done" → `saveCaptionDraft()`:

```ts
async function saveCaptionDraft() {
  setUndoable({
    type: 'clip',
    clipId: activeClip.id,
    prev: {
      caption_text: activeClip.caption_text,
      caption_size: activeClip.caption_size,
      caption_x: activeClip.caption_x,
      caption_y: activeClip.caption_y,
    }
  })
  await saveClipChanges(activeClip.id, {
    caption_text: captionDraft.trim() || null,
    caption_size: captionSizeDraft,
    caption_x: captionPosDraft.x,
    caption_y: captionPosDraft.y,
  })
  setActiveTool(null)
}
```

#### Remove caption

If a caption exists, there's a "Remove caption" link in the controls
panel — clears `captionDraft` and triggers the save.

### 5.7 Mute tool

Tap "Mute" → `toggleMute()`:

```ts
function toggleMute() {
  const newMuted = !activeClip.muted    // client-side only
  setUndoable({ type:'clip', clipId: activeClip.id, prev: { muted: activeClip.muted || false } })
  setClips(prev => prev.map(c => c.id === activeClip.id ? { ...c, muted: newMuted } : c))
  if (videoRef.current) videoRef.current.muted = newMuted
}
```

**No DB write.** Mute is session-scoped. Survives within the
Workspace + Playback session but not page refresh.

### 5.8 Add Clips tool

Tap "Add Clips" → `navigate('/intake?addTo=' + id)` → Intake in add-to
mode. After upload completes, navigation returns to Workspace.

### 5.9 Reorder tool

Tap "Reorder" → `setReorderMode(true)`. The horizontal clip strip is
replaced by a vertical drag-to-reorder list.

See `02-interactions-glossary.md` §5. Workspace-specific:

- Long-press: 400 ms touch (10 px vertical jitter cancellation).
- Ghost card style: `scale: 1.03, opacity: 0.97, boxShadow: '0 12px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(amber, 0.2)'`.
- Empty slot: dashed amber border + amber 5% bg.
- Done button (top-right of reorder list) returns to idle mode.

### 5.10 Remove tool

Tap "Remove" → `setConfirmRemoveId(activeClipId)`. Bottom sheet:

> Remove this clip?
> *(small subtext)* The clip won't be deleted from your camera roll.

Two buttons: **Remove Clip** (sienna) and **Cancel**. Tap Remove →
`removeClip(activeClipId)` (see §4).

### 5.11 Photo duration stepper (photos only)

When `activeClip.media_type === 'photo'`, the tool row also shows a
duration stepper:

```
Display Duration
[−]  5 sec  [+]
```

- Tap `−`: `setDuration(Math.max(1, current - 1))` then save.
- Tap `+`: `setDuration(Math.min(30, current + 1))` then save.
- Bounds: 1–30 seconds.
- Persisted: `{ duration, trim_out: duration }`.

### 5.12 Clip strip — select clip

Tap a card in the horizontal strip → `setActiveClipId(clipId)`. The
strip auto-scrolls the active card into view:

```ts
useEffect(() => {
  if (!activeClipId || !clipStripRef.current) return
  const card = clipStripRef.current.querySelector(`[data-clip-card="${activeClipId}"]`)
  card?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
}, [activeClipId])
```

Native: `<ScrollView ref>`.`scrollTo({ x, animated: true })` — compute
`x` from the card's index × card width.

### 5.13 Undo

Tap Undo button (visible only when `undoable !== null`):

```ts
async function handleUndo() {
  if (!undoable) return
  updateClipLocal(undoable.clipId, undoable.prev)
  if ('trim_in' in undoable.prev) {
    // re-seek video to new trim_in
    if (videoRef.current) videoRef.current.currentTime = undoable.prev.trim_in!
  }
  await supabase.from('clips').update(undoable.prev).eq('id', undoable.clipId)
  setUndoable(null)
}
```

Single-level. Once you do another edit, the previous undo is lost.

### 5.14 Save button

Tap Save → just `navigate('/scrapbook/' + id)` → ScrapbookDetail. There
are no pending writes to flush — auto-save handles it. The button is a
navigation affordance.

### 5.15 Back button

Tap ← → `navigate('/scrapbook/' + id)`. Same as Save effectively.

### 5.16 Play/pause

The center play button toggles. Also, *every* trim drag pauses the
video on start (doesn't resume on release). Manual play resumes
playback.

### 5.17 Video time update — auto-skip cut + auto-loop trim

Same as Playback (see `screens/playback.md` §5.5, §5.6) but at
`trim_out` reaches Workspace pauses and loops back to `trim_in`
instead of advancing:

```ts
function handleTimeUpdate() {
  const video = videoRef.current
  if (!video || !activeClip) return
  // Cut skip
  if (activeClip.cut_in != null && activeClip.cut_out != null &&
      video.currentTime >= activeClip.cut_in && video.currentTime < activeClip.cut_out) {
    video.currentTime = activeClip.cut_out
  }
  setPlayheadPct((video.currentTime / video.duration) * 100)
  // Loop within trim
  if (video.currentTime >= trimOut) {
    video.pause()
    video.currentTime = trimIn
  }
}
```

This loop-on-trim-out is Workspace-specific — Playback advances to the
next clip; Workspace loops the same clip so the editor can keep
re-watching.

---

## 6. Animations & micro-feel

### 6.1 Saved flash

See `02-interactions-glossary.md` §12. 2500 ms instant on, instant off.
Amber Fraunces italic 12 px. The user notices it on every successful
save — the most important micro-feedback in the app.

### 6.2 Filmstrip expand (TRIM / SPLIT)

The filmstrip grows from 0 height to 64 px when TRIM or SPLIT
activates. PWA does this with conditional render (no animation). Native:
optional 200 ms ease, but conditional render is fine.

### 6.3 Trim handles fade

After release, the trim handles hold full opacity for 2000 ms, then
fade. PWA: not actually animated, just conditional render after the
timeout (`trimHandlesActive = false`). Native: same; if you want polish,
add a 200 ms opacity tween before unmount.

### 6.4 Caption drag

Live DOM updates during motion, no React re-render. Native: see
`02-interactions-glossary.md` §4 — Reanimated shared value writes
straight to UI thread.

### 6.5 Active clip card border

Switching clips changes which card has the amber border. PWA does no
animation. Native: optional 150 ms border-color tween.

### 6.6 Reorder ghost card

`scale: 1.03, opacity: 0.97` on drag start. PWA: snap (no tween).
Native: 150 ms ease-out spring scale up on press.

### 6.7 Tool button active state

Switching from idle to active state shows amber border + bg via
conditional render. No tween. Match in native.

---

## 7. Empty / loading / error states

### Loading

Cache hit: instant. Cold (deep link directly to Workspace): cassette
reel for ~300 ms.

### Empty (clips = 0)

Workspace doesn't really handle this — a scrapbook with 0 clips
shouldn't exist (Intake creates a scrapbook + clip 1 together). But
defensive: if `clips.length === 0`, render an empty state with a CTA
to add clips ("Tap + Add Clips to start").

### Save error

Already handled inline by `saveClipChanges` — revert + no flash.

### Video decode error

`<video>` `onerror` fires. PWA logs; doesn't surface to user. Native:
acceptable for v1 but log to console.

### Trim out-of-bounds

Clamps. Trim_in min 0, max `trim_out - 0.5`. Trim_out min `trim_in + 0.5`,
max `duration`. Sliders enforce.

---

## 8. Known gotchas & "why it works"

- **No `muted` column.** Don't add one. Survives Workspace + Playback
  session via `clips` state.
- **`(scrapbook_id, order)` unique constraint** — see `03-data-model.md` §2.
  Reorder commits in a sequential loop; split insertions of new clips
  (if you ever add "split into two clips" rather than the current
  "skip a region") would need careful order shifting first.
- **Single-level undo only.** Each new edit clobbers `undoable`. The
  user gets one chance; if she does two trims and wants to undo the
  first, she can't. This is a *deliberate* simplicity decision —
  multi-level undo opens a UX can of worms.
- **Auto-save fires per-tool-finalization, not per-keystroke.** Trim
  saves on handle release. Split saves on Confirm tap. Caption saves
  on Done tap. Mute changes are *not* saved. This is intentional — no
  network spam.
- **`updateClipLocal(clipId, changes)` is reusable.** Defined once
  near the top: `setClips(prev => prev.map(c => c.id === clipId ? { ...c, ...changes } : c))`.
- **Trim handles auto-hide.** 2000 ms after release. Both PWA and the
  port should hide them so the kept region reads cleanly without UI
  noise. Re-appear on next drag-start (well, the user has to enter
  TRIM mode first, but the toggle persists).
- **Photo duration loop fix.** When the active clip is a photo and the
  user changes its display duration, `trim_out` must also be updated —
  the saveClipChanges call passes both `{ duration, trim_out }`.
- **The caption drag persists DOM directly, not via React.** That's
  why caption position drag feels smooth — bypassing reconciliation
  for 60 FPS. Native equivalent: Reanimated shared values on the UI
  thread.
- **Mini-scrub seeks within `[trim_in, trim_out]`, not full duration.**
  The user is editing the kept region; scrubbing outside that range
  would be confusing.

---

## 9. Native translation notes

### Recommended stack for Workspace

- **`expo-video`** with one `useVideoPlayer` for the preview. (No need
  for three; this is single-clip editing.)
- **`react-native-gesture-handler`** + **Reanimated v3** for all drag
  gestures (trim handles, split handles, caption drag, mini-scrub).
- **`react-native-draggable-flatlist`** for the reorder list (see
  `02-interactions-glossary.md` §5).
- **`@gorhom/bottom-sheet`** for the Remove confirmation.
- **`@react-native-community/slider`** or
  **`@miblanchard/react-native-slider`** for the caption size range
  (amber accent — pass via `minimumTrackTintColor`).
- **`react-native-svg`** for any filmstrip rendering tricks (gradient
  strip + masks).

### Layout: fixed not scrollable

Use `flex: 1` + flex children with `flex-shrink: 0` / `flex-grow: 1`
to pin the layout. Only the horizontal clip strip and the vertical
reorder list scroll.

```tsx
<View style={{ flex: 1, backgroundColor: colors.walnut }}>
  <Header />               {/* flex-shrink: 0 */}
  <Preview style={{ flex: 1 }} />
  <MiniTimeline />         {/* flex-shrink: 0 */}
  <CraftingDrawerHeader />
  {trimMode && <Filmstrip />}
  {toolsExpanded && <ToolRow />}
  <ClipStrip />            {/* horizontal scroll */}
  {/* OR */}
  {reorderMode && <ReorderList style={{ flex: 1 }} />}
  {activeTool === 'caption' && <CaptionControls />}
</View>
```

### Filmstrip rendering

The PWA uses a CSS gradient + overlays. Native equivalent:

```tsx
const STRIP_COLORS = [/* 10 brown gradient stops */]

function Filmstrip({ clip, mode, ... }) {
  return (
    <View style={styles.strip}>
      {/* Base gradient — multiple LinearGradient layers or one with many stops */}
      <LinearGradient colors={STRIP_COLORS} style={StyleSheet.absoluteFill} />

      {/* Trimmed-out regions (dark overlay) */}
      <View style={[styles.trimOverlay, { left: 0, width: `${trimInPct}%` }]} />
      <View style={[styles.trimOverlay, { right: 0, width: `${100 - trimOutPct}%` }]} />

      {/* Cut region overlay */}
      {clip.cut_in != null && (
        <View style={[styles.cutOverlay, { left: `${cutInPct}%`, width: `${cutWidthPct}%` }]} />
      )}

      {/* Top/bottom amber accent lines for kept region */}
      <View style={[styles.keptAccentTop, { left: `${trimInPct}%`, width: `${trimWidthPct}%` }]} />
      <View style={[styles.keptAccentBottom, { left: `${trimInPct}%`, width: `${trimWidthPct}%` }]} />

      {/* Playhead */}
      <View style={[styles.playhead, { left: `${playheadPct}%` }]} />

      {/* Trim handles or split handles */}
      {mode === 'trim' && <TrimHandles ... />}
      {mode === 'split' && <SplitHandles ... />}
    </View>
  )
}
```

Use `position: 'absolute'` and percentage-based `left` / `width` to
match the PWA's layout math.

### Single-player + seek-on-trim-drag

```tsx
const player = useVideoPlayer(activeClip?.video_url, (p) => {
  p.muted = activeClip?.muted ?? false
  p.currentTime = activeClip?.trim_in ?? 0
})

useEffect(() => {
  // Listener for trim-out loop
  const sub = player.addListener('timeUpdate', (e) => {
    if (activeClip?.cut_in != null && activeClip?.cut_out != null &&
        e.currentTime >= activeClip.cut_in && e.currentTime < activeClip.cut_out) {
      player.currentTime = activeClip.cut_out
    }
    if (e.currentTime >= trimOut) {
      player.pause()
      player.currentTime = trimIn
    }
    setPlayheadPct((e.currentTime / activeClip.duration) * 100)
  })
  return () => sub.remove()
}, [player, activeClip, trimIn, trimOut])
```

Note: `expo-video` doesn't have a `'timeUpdate'` event with the same
semantics — check the actual API. There's a `progressTimeIntervalSec`
config (~0.25s) or `useEvent(player, 'timeUpdate', ...)` hook in SDK
54. Don't poll with `setInterval` if the SDK exposes a listener.

### Trim handle gesture composition

Two separate `Pan` gestures (one per handle), composed with the
mini-scrub `Pan` and the caption-drag `Pan` (when active). Use
`Gesture.Race` to ensure only the correct one fires per touch.

### Reorder native pattern

`react-native-draggable-flatlist`'s `delayLongPress={400}` matches the
PWA. See `02-interactions-glossary.md` §5 for the full sketch. Wire
`onDragEnd` to `commitReorder`.

### Native divergence: the caption text input

PWA's text input is a native browser `<input>`. Native's `<TextInput>`
behaves differently:
- Use `autoFocus` + `selectTextOnFocus={false}` (don't select all when
  refocused on switching clips).
- Set `placeholder="Write a caption…"` rust 14 px.
- Multi-line is *not* allowed in PWA — match with `multiline={false}`.
- Keyboard pushes UI up — use `KeyboardAvoidingView` or
  `react-native-keyboard-controller` for smooth handling.

### Active clip auto-scroll

```ts
const stripRef = useRef<ScrollView>(null)
useEffect(() => {
  const idx = clips.findIndex(c => c.id === activeClipId)
  if (idx < 0) return
  const cardX = idx * (64 + 8) - SCREEN_W / 2 + 32   // center the card
  stripRef.current?.scrollTo({ x: Math.max(0, cardX), animated: true })
}, [activeClipId])
```

### What to defer (a longer list for Workspace)

For initial Workspace native port:

- **In scope:** Layout, active clip selection, mini timeline, basic
  trim handle drag, single-level undo, mute toggle, photo duration
  stepper, saved-flash, navigation back to Detail.
- **Defer:** Split tool (3-step is doable but not v1 critical),
  caption drag (and pinch — the slider is the must-ship), reorder
  (use the web for now), Add Clips tool nav (works only once Intake
  lands natively).

**Critical:** if Workspace ships but the auto-save loop is broken,
you'll quietly corrupt mom's data. Test the optimistic-revert path
thoroughly with throttled network in dev tools (or `Network Link
Conditioner` on real device).

---

## 10. Test plan when this screen ships

- [ ] Open Workspace from Detail Edit button → instant render (cache).
- [ ] Tap a clip in the strip → active card changes; preview seeks to
      the clip's `trim_in`.
- [ ] Tap TRIM → filmstrip expands; handles visible.
- [ ] Drag IN handle → video seeks live. Release → "saved" flash.
- [ ] Tap Undo → trim reverts; "saved" flash.
- [ ] Tap SPLIT → two sienna bars at ~30%/70%; drag them; tap "Split" →
      cut saved; saved flash.
- [ ] Open existing cut → SPLIT shows "Remove cut" only.
- [ ] Tap Caption → controls panel slides up; preview overlay shows
      dashed amber border.
- [ ] Drag the caption box → moves with finger, clamped to 5–95%.
      Release → "saved" flash.
- [ ] Adjust size slider → font size updates live.
- [ ] Tap Mute on a video clip → audio mutes; icon changes; *no*
      "saved" flash (client-side only).
- [ ] Tap Reorder → vertical list. Long-press a row 400 ms → drag.
      Release → orders persist in order 0..N.
- [ ] Tap Remove → confirmation sheet; tap Remove → clip gone; orders
      renumbered; R2 files deleted.
- [ ] Save → returns to ScrapbookDetail with edits reflected.
- [ ] Bad network: throttle to 100 Kbps, make a trim edit → optimistic
      update; if save fails after timeout, revert visible.
- [ ] Photo clip: trim/split/mute hidden; duration stepper visible.
- [ ] Mini timeline scrub stays within `[trim_in, trim_out]`.

---

*Cross-references:* `00-brand-system.md` §1–§3 (palette/fonts/spacing),
§7 (reel — not used here but listed for context);
`02-interactions-glossary.md` §4 (caption drag), §5 (reorder),
§6 (trim handles), §7 (mini-scrub), §12 (saved flash), §17 (optimistic
update); `03-data-model.md` §2 (clips table + unique-order constraint),
§7 (update query shape); `screens/scrapbook-detail.md` (the entry and
exit point).
