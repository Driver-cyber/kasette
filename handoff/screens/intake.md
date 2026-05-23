# screens/intake.md — Intake (Upload Flow)

> **What it is.** The primary job of the app. Mom in the waiting room
> picks ~30 videos from her camera roll, names the scrapbook, taps
> Create, and the app silently uploads everything to R2 while she does
> something else.
>
> **Priority for native.** High — but **deferred for first TestFlight
> install** per `NEXT-SESSION.md`. Mom's v0.1 install lets her watch
> her existing PWA-created scrapbooks; she does upload from the web
> for now. Intake is the *next* hard port after v0.1 ships.
>
> **Heaviest native divergence in the app.** The PWA uses
> `<input type="file" multiple accept="video/*">` + FFmpeg WASM for
> remux. Neither exists natively. See §9.

Route: `/intake` (with `?addTo=:id` for add-to-existing) · File:
`kasette/app/src/screens/IntakeScreen.jsx` (1006 lines) · Native: not
yet ported.

---

## 1. Purpose & user mental model

She's in the waiting room. She wants to:

1. Pick some videos from her camera roll (10–80 is a normal batch).
2. See them as thumbnails, deselect a few that didn't turn out.
3. Name the scrapbook ("Beach Trip"), pick a year/month.
4. Tap Create.
5. Watch a calming reel-spinner animation while clip 1 uploads.
6. Get bounced to the Scrapbook Detail screen the moment clip 1 is in
   — *the rest upload in the background while she scrolls around*.

She can also enter Intake from Workspace's "Add Clips" tool — same
flow, but adding to an existing scrapbook (no name sheet, just pick →
upload).

The brand voice is intentional throughout:

- Step 1 header: "Pick your clips"
- Step 2 heading: "*Almost there.*"
- Upload phase: "Getting ready…" → "Saving memories…"
- Done: navigation happens silently; no celebratory toast.

---

## 2. Layout (3 distinct surfaces)

### Surface A — Empty (no clips picked yet)

```
┌──────────────────────────────────────────────────┐
│  [←]      New Scrapbook                          │  ← header
│                                                  │
│                                                  │
│              [video-camera icon]                 │
│              Pick your clips                     │  ← Fraunces SemiBold 22px
│        Choose some videos from your              │  ← rust 14px
│        camera roll to get started.               │
│                                                  │
│         ┌────────────────────────────┐           │
│         │  Open Camera Roll          │           │  ← amber CTA
│         └────────────────────────────┘           │
└──────────────────────────────────────────────────┘
```

### Surface B — Pick step (clips picked, selecting which to keep)

```
┌──────────────────────────────────────────────────┐
│  [←]    Pick your clips              [All/None]  │
│  ▰▰▰▰▰▰▰▰▰▱▱▱▱   N imported / M selected         │  ← horizontal 3px gradient progress
├──────────────────────────────────────────────────┤
│  December 25, 2024                               │  ← date group heading (Fraunces semibold)
│  ┌─────────┐ ┌─────────┐                         │
│  │  thumb  │ │  thumb  │                         │  ← 2-column grid, aspectRatio 9/12
│  │   [✓]   │ │         │                         │  ← amber checkmark when selected
│  │ 0:12    │ │ 0:24    │                         │  ← duration bottom-left
│  └─────────┘ └─────────┘                         │
│  December 24, 2024                               │
│  ...                                             │
├──────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────┐        │
│  │   12 selected · ~3 min   [Continue ›]│        │  ← sticky bottom bar
│  └──────────────────────────────────────┘        │
└──────────────────────────────────────────────────┘
```

### Surface C — Name sheet (step 'name', over a dimmed grid)

```
┌──────────────────────────────────────────────────┐
│  [────  drag handle  ────]                       │  ← bottom sheet, rounded-t-3xl
│  Almost there.                                   │  ← Fraunces italic, mixed amber+sienna, ~36px
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  Name your scrapbook                       │  │  ← input, Fraunces, autoFocus
│  └────────────────────────────────────────────┘  │
│                                                  │
│  Year                  Month                     │  ← two PickerDropdowns side by side
│  [▾ 2026          ]    [▾ March           ]      │
│                                                  │
│  Cover photo (optional)                          │
│  ┌──────┐                                        │
│  │  +   │  Tap to choose                         │  ← 60×60 placeholder, or thumbnail
│  └──────┘                                        │
│                                                  │
│  ● 12 clips · ~3 min · Dec 22–25, 2024           │  ← summary pill
│                                                  │
│  ⓘ Optimizing clip 1 while you type…             │  ← pre-remux indicator (rust)
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │           Create Scrapbook                  │  │  ← full-width amber CTA
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

### Surface D — Upload overlay (full-screen, after Create)

```
┌──────────────────────────────────────────────────┐
│                                          [X]     │  ← cancel button, top-right
│                                                  │
│                                                  │
│            [◯ reel] [◯ reel]                     │  ← two cassette reels, gap 10px
│                                                  │
│            Getting ready…                        │  ← Fraunces italic 28px amber
│                                                  │
│            Clip 1                                │  ← rust 12px label
│            ▰▰▰▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱  47%             │  ← lerping progress bar + %
│                                                  │
│            11 more clips queued                  │  ← rust 12px with divider lines
│                                                  │
│        ┌────────────────────────────────────┐    │
│        │  You can start editing right away  │    │  ← info card
│        │  Your clips will keep uploading    │    │
│        │  in the background.                │    │
│        └────────────────────────────────────┘    │
└──────────────────────────────────────────────────┘
```

After clip 1 lands (R2 + DB insert), the screen disappears and the user
lands on ScrapbookDetail. Clips 2..N continue uploading via
`UploadContext` — a small banner appears on every other screen
("Uploading 8 more clips…").

---

## 3. State machine

```ts
// Items (clips picked from picker)
const [items, setItems] = useState<Item[]>([])              // { id, file, duration, thumbnail, selected, date, mediaType }
const [metaLoaded, setMetaLoaded] = useState(0)
const [metaTotal, setMetaTotal] = useState(0)

// Step
const [step, setStep] = useState<'pick'|'name'>('pick')

// Name sheet form
const [name, setName] = useState('')
const [year, setYear] = useState(new Date().getFullYear())
const [month, setMonth] = useState<number|null>(null)
const [coverFile, setCoverFile] = useState<File|null>(null)
const [coverPreview, setCoverPreview] = useState<string|null>(null)

// Upload progress
const [uploading, setUploading] = useState(false)
const [uploadPhase, setUploadPhase] = useState<'remuxing'|'uploading'>('remuxing')
const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 1 })
const [displayPct, setDisplayPct] = useState(0)        // smoothed via lerp
const [error, setError] = useState<string|null>(null)

// Pre-remux (the optimization that runs while the user types the name)
const [preRemuxReady, setPreRemuxReady] = useState(false)

// Refs
const fileInputRef = useRef<HTMLInputElement>(null)
const nameInputRef = useRef<HTMLInputElement>(null)
const coverInputRef = useRef<HTMLInputElement>(null)
const wakeLockRef = useRef<any>(null)          // navigator.wakeLock sentinel
const cancelledRef = useRef(false)
const preRemuxRef = useRef<{ result: File } | null>(null)
const smoothPctRef = useRef(0)
const uploadPhaseRef = useRef<'remuxing'|'uploading'>('remuxing')
const uploadProgressRef = useRef({ current: 0, total: 1 })

// URL query
const [searchParams] = useSearchParams()
const addToId = searchParams.get('addTo')       // null for new scrapbook
```

### Item shape

```ts
type Item = {
  id: string         // local UUID
  file: File         // browser File object
  duration: number   // seconds
  thumbnail: string  // data URL or null
  selected: boolean  // toggled by tap on card
  date: Date         // from file.lastModified
  mediaType: 'video' | 'photo'
}
```

### Step transitions

```
[empty]   --(file picker selects N files)-->   [pick]
[pick]    --(tap Continue, ≥1 selected)-->     [name]   (also starts pre-remux of clip 1)
[name]    --(tap ← back)-->                    [pick]
[name]    --(tap Create)-->                    [uploading]
[uploading] --(clip 1 done)-->                 navigates away; background upload of 2..N continues
[uploading] --(tap X cancel)-->                navigates back, releases wake lock
```

---

## 4. Data fetches & writes

### On step `'name'` mount (pre-remux optimization)

```ts
useEffect(() => {
  if (step !== 'name') return
  const firstClip = items.find(i => i.selected)
  if (!firstClip || firstClip.mediaType === 'photo') {
    setPreRemuxReady(true)
    return
  }
  // Silently remux clip 1 in background
  remuxWithFaststart(firstClip.file).then(result => {
    preRemuxRef.current = { result }
    setPreRemuxReady(true)
  })
}, [step, items])
```

If the user types slower than the remux takes, the result is ready by
Create-tap. Saves ~1–3 seconds of perceived load.

### `handleCreate()` — the full upload flow

(For new scrapbook; `handleAddClips` is analogous for `addToId` mode.)

```ts
async function handleCreate() {
  if (!name.trim() || !items.some(i => i.selected)) return
  setUploading(true)
  setUploadPhase('remuxing')
  cancelledRef.current = false

  // 1. Wake lock
  try { wakeLockRef.current = await navigator.wakeLock.request('screen') } catch {}

  // 2. Get clip 1 (use pre-remuxed if ready, else remux now)
  const selected = items.filter(i => i.selected)
  const first = selected[0]
  let firstFile = preRemuxRef.current?.result ?? await remuxWithFaststart(first.file)
  if (cancelledRef.current) { release(); return }

  // 3. Create scrapbook
  const { data: sb, error: sbErr } = await supabase
    .from('scrapbooks')
    .insert({ user_id: session.user.id, name: name.trim(), year, month })
    .select().single()
  if (sbErr) { setError(sbErr.message); release(); return }

  // 4. Auto-share defaults (non-blocking)
  applySharingDefaults(sb.id).catch(() => {})

  // 5. Cover upload (if provided)
  if (coverFile) {
    const resized = await resizeCoverImage(coverFile)
    const coverKey = `${session.user.id}/covers/${sb.id}.jpg`
    try {
      const url = await uploadToR2(coverKey, resized, 'image/jpeg')
      await supabase.from('scrapbooks').update({ cover_image_url: url }).eq('id', sb.id)
    } catch { /* non-blocking */ }
  }

  // 6. Clip 1 upload + thumbnail
  setUploadPhase('uploading')
  setUploadProgress({ current: 0, total: 1 })
  const clipId = crypto.randomUUID()
  const storagePath = `${session.user.id}/${sb.id}/${clipId}.mp4`
  let videoUrl
  try {
    videoUrl = await uploadToR2(
      storagePath, firstFile, 'video/mp4',
      (frac) => setUploadProgress({ current: frac, total: 1 })
    )
  } catch (e) {
    // Orphan cleanup
    await supabase.from('scrapbooks').delete().eq('id', sb.id)
    setError(e.message); release(); return
  }

  if (cancelledRef.current) { release(); return }

  // 7. Thumbnail (videos only)
  let thumbnailUrl = videoUrl  // for photos, thumbnail = video_url
  if (first.mediaType === 'video' && first.thumbnail) {
    const thumbPath = `${session.user.id}/${sb.id}/${clipId}_thumb.jpg`
    try {
      thumbnailUrl = await uploadToR2(thumbPath, dataURLtoBlob(first.thumbnail), 'image/jpeg')
    } catch { thumbnailUrl = null }
  }

  // 8. Insert clip 1 row
  await supabase.from('clips').insert({
    id: clipId,
    scrapbook_id: sb.id,
    storage_path: storagePath,
    video_url: videoUrl,
    thumbnail_url: thumbnailUrl,
    order: 0,
    trim_in: 0,
    trim_out: first.duration,
    duration: first.duration,
    recorded_at: first.date.toISOString(),
    media_type: first.mediaType,
  })

  // 9. Hand off background upload of 2..N
  startBackgroundUpload({ scrapbookId: sb.id, clips: selected.slice(1), userId: session.user.id, concurrency: 3 })

  // 10. Release wake lock & navigate
  release()
  navigate(`/scrapbook/${sb.id}`, { replace: true })
}

function release() {
  try { wakeLockRef.current?.release() } catch {}
  setUploading(false)
}
```

### Lerping progress (verbatim shape)

```ts
useEffect(() => {
  if (!uploading) return
  const tick = setInterval(() => {
    const target = uploadPhaseRef.current === 'remuxing'
      ? (uploadProgressRef.current.current / uploadProgressRef.current.total) * 40
      : 40 + (uploadProgressRef.current.current / uploadProgressRef.current.total) * 55
    smoothPctRef.current += (target - smoothPctRef.current) * 0.05
    setDisplayPct(smoothPctRef.current)
  }, 80)
  return () => clearInterval(tick)
}, [uploading])
```

Phase mapping:
- Remuxing: 0–40%
- Uploading clip 1: 40–95%
- Reserved 95–100% for navigation overhead

See `02-interactions-glossary.md` §8.

### Background upload (`UploadContext.startBackgroundUpload`)

Concurrency-limited pool of 3 parallel workers. Each worker:

```ts
async function uploadOne(clip: Item, idx: number) {
  if (cancelledRef.current) return
  const remuxed = clip.mediaType === 'video'
    ? await remuxWithFaststart(clip.file)
    : clip.file
  if (cancelledRef.current) return
  const clipId = crypto.randomUUID()
  const storagePath = `${userId}/${scrapbookId}/${clipId}.${ext}`
  const videoUrl = await uploadToR2(storagePath, remuxed, contentType)
  let thumbUrl = videoUrl
  if (clip.mediaType === 'video' && clip.thumbnail) {
    const thumbPath = `${userId}/${scrapbookId}/${clipId}_thumb.jpg`
    thumbUrl = await uploadToR2(thumbPath, dataURLtoBlob(clip.thumbnail), 'image/jpeg')
  }
  await supabase.from('clips').insert({
    id: clipId,
    scrapbook_id: scrapbookId,
    storage_path: storagePath,
    video_url: videoUrl,
    thumbnail_url: thumbUrl,
    order: orderOffset + idx,
    trim_in: 0,
    trim_out: clip.duration,
    duration: clip.duration,
    recorded_at: clip.date.toISOString(),
    media_type: clip.mediaType,
  })
  setCompletedClips(c => c + 1)
}
```

No retry. Failed clips push their index to `failedClips` and the loop
moves on. The user sees the banner reflect remaining count.

---

## 5. Every interaction

### 5.1 File picker (empty state)

Tap "Open Camera Roll" → triggers hidden `<input type="file" multiple accept="video/*,image/*">`. PWA uses the browser's native picker — iOS Safari shows the camera roll directly.

On file selection (`handleFilePick`):
1. Build initial `items` array with placeholder metadata.
2. `setMetaTotal(files.length)`.
3. For each file, fire `getVideoMeta` or `getPhotoMeta` *in parallel*.
4. As each metadata extraction completes, update that item and
   `setMetaLoaded(n => n + 1)`.
5. Auto-transition to `step = 'pick'` once the first item is ready.

Metadata extraction:
- **Video:** create a `<video>` element, load metadata, seek to 10% or
  0.5 s (whichever is smaller), capture frame as JPEG poster, 8s
  timeout safeguard.
- **Photo:** read file as data URL via FileReader; `duration = 5`.

### 5.2 Grid selection

Tap a card → `toggleItem(id)` flips `selected`. Selected cards get
amber 2 px border + checkmark; deselected cards dim to 50% brightness.

The progress bar at the top is `N imported / M selected` — N updates
as metadata extraction completes, M as selection toggles.

All/None toggle: top-right button flips `selected` for every item.

### 5.3 Continue button

Sticky bottom bar shows running count + duration. Tap "Continue":
- `setStep('name')` opens the bottom sheet over the dimmed grid.
- Pre-fills year/month from earliest selected clip's date.
- Auto-focuses the name input after 200 ms.
- Kicks off the pre-remux of clip 1 in the background.

### 5.4 Name sheet form

- Name input: autoFocus, maxLength 60, Enter → `handleCreate()`.
- Year picker: 2015 to current year.
- Month picker: "···" + 12 months.
- Cover picker: tap → hidden file input → on selection, FileReader for
  preview + `setCoverFile(file)`.
- Clear cover: X button on preview → `setCoverFile(null); setCoverPreview(null)`.

Summary pill shows:
- N selected clips
- ~M min total duration
- Date range (formatted: same day = single date, same year =
  "Dec 22–25", crossing years = "Dec 28, 2024–Jan 2, 2025")

### 5.5 Pre-remux indicator

Rust 13 px text below the cover picker. States:
- `preRemuxReady = false`: small inline reel + "Optimizing clip 1 *while you type…*"
- `preRemuxReady = true`: amber check + "Clip 1 ready"

Cosmetic only. Doesn't gate Create.

### 5.6 Create button

Disabled if `!name.trim()`. Otherwise fires `handleCreate()` (see §4).

### 5.7 Upload overlay

Renders when `uploading = true`. Two reels (forward + reverse), phase
label, progress bar, queued count, info card.

Phase labels:
- Remuxing: "Getting ready…"
- Uploading: "Saving memories…"

Below the bar: "Clip {1} · {displayPct}%". The clip counter is always
"Clip 1" — only clip 1 happens on this screen; the rest are background.

### 5.8 Cancel (X top-right of upload overlay)

Tap → `handleCancel()`:
```ts
function handleCancel() {
  cancelledRef.current = true
  try { wakeLockRef.current?.release() } catch {}
  navigate(-1)        // or to /scrapbook/{addToId} for add mode
}
```

The async upload loop checks `cancelledRef.current` after each step and
bails. If clip 1 already started uploading, there's a window where the
upload completes despite cancel — the orphan cleanup in §4 handles
this (deletes the orphaned scrapbook row).

### 5.9 Background upload banner

Once `handleCreate` navigates away, `UploadContext.isActive === true`
shows a top-bar banner across other screens: reel + "Uploading N more
clips…". Tappable to navigate to the scrapbook detail.

---

## 6. Animations & micro-feel

### 6.1 Cassette reels

See `00-brand-system.md` §7. Two reels, asymmetric durations (2.1s /
1.7s), 10 px gap, centered.

### 6.2 Lerping progress bar

See `02-interactions-glossary.md` §8. The 80 ms tick + 0.05 multiplier
is what makes the bar feel calm. **Don't replace with `withTiming`.**

### 6.3 Sheet slide-up

Name sheet appears with a Gentle Enter (300 ms ease-out, cubic-bezier(0,0,0.2,1)).

### 6.4 Card tap feedback

`active:scale-[0.96]` (slightly more pronounced than the global 0.98 —
the cards are large). Native: `Pressable` pressed state.

### 6.5 Progress bar fill animation

CSS: `transition: width 0.08s linear`. So the *fill* updates in 80 ms
chunks (matching the lerp interval). Native: just set `width: pct%` —
the lerp already runs on 80 ms ticks, so each render lands smoothly.

---

## 7. Empty / loading / error states

### Empty

The "Open Camera Roll" call-to-action screen (Surface A above).

### Loading clip metadata

While `metaLoaded < metaTotal`: progress bar at top of pick screen
shows progress. Cards render as soon as their metadata resolves — no
all-or-nothing.

### No items selected

Continue button disabled (50% opacity).

### Create failed

`error` state shows in the name sheet (sienna text below Create). Common
causes: scrapbook insert RLS failure (very rare), R2 upload network
failure.

### Upload failed mid-flight

Two cases:
- Clip 1 fails: orphan cleanup runs, user sees error message in upload
  overlay (sienna heading "Couldn't save your scrapbook" + error text +
  Try Again button).
- Background clip fails: index pushed to `failedClips`. The banner
  shows "N uploaded, M failed". Failed clips remain in
  `UploadContext` state; the user can theoretically retry, though PWA
  doesn't expose a retry UI in v1.

### Network drops mid-upload

Same as upload failure. XMLHttpRequest's `onerror` fires, the await
rejects, the catch handler runs. No retry.

---

## 8. Known gotchas & "why it works"

- **Pre-remux is amortized over the user's typing.** The user types
  the scrapbook name (5–15 seconds). FFmpeg WASM remux of one clip
  takes 1–3 seconds. If the user types slow, remux is done by Create-
  tap and the upload starts immediately. If they type fast (i.e.
  the user *commits the name field via paste*), the remux blocks
  briefly. This optimization is non-trivial — match it in native if
  remux is in-process.
- **Wake lock is re-acquired on `visibilitychange`.** Going to home
  screen and back during an upload re-grabs the lock. Native:
  `expo-keep-awake` persists across backgrounding, so no
  re-acquisition needed.
- **The cancel check is per-step, not per-byte.** A 10 MB clip
  uploading at 50 KB/s will run to completion even if the user hit
  cancel 20 seconds in. Acceptable for v1 — true mid-upload abort
  would need an `AbortController` on the XHR, which complicates the
  R2 helper. Skip for now.
- **`{ replace: true }` on navigation after create** — back-button
  should not return to the upload overlay. Native:
  `navigation.reset(...)`.
- **Photos use `video_url` for the image URL.** No separate column.
  Same `duration` semantics (default 5s display).
- **`order` assignment is `orderOffset + idx` in background uploads.**
  `orderOffset` is `max(existing) + 1` from the `clips` table query at
  start of `startBackgroundUpload`. Sequential within the batch but
  not globally — if two background uploads ran simultaneously to the
  same scrapbook they'd collide. PWA prevents this by only allowing
  one upload session at a time (a single `UploadContext`).
- **HEIC photos:** iPhone photos from the picker arrive as `.heic`.
  Browser can't render them without decoding — the PWA shows a broken
  image. Native should use `expo-image-manipulator` to convert HEIC
  → JPEG on intake.

---

## 9. Native translation notes

### The big ones — three native divergences

#### 9.1 Replace `<input type="file">` with `expo-image-picker`

```ts
import * as ImagePicker from 'expo-image-picker'

const result = await ImagePicker.launchImageLibraryAsync({
  mediaTypes: ImagePicker.MediaTypeOptions.All,    // videos + photos
  allowsMultipleSelection: true,
  selectionLimit: 0,                                // unlimited
  quality: 1,
  videoMaxDuration: 0,                              // no max
})
if (result.canceled) return
```

Permissions:
- `NSPhotoLibraryUsageDescription` in `app.config.js` `ios.infoPlist`.
  Add a clear copy: "Cassette uses your camera roll so you can choose
  videos for your scrapbooks."
- Recommend `expo-media-library` for the full-fidelity asset access
  (gets EXIF, recorded_at, original duration, no resize). The
  `image-picker` is simpler but resizes/compresses by default.

For **best fidelity**, prefer `expo-media-library`:

```ts
import * as MediaLibrary from 'expo-media-library'

const { status } = await MediaLibrary.requestPermissionsAsync()
if (status !== 'granted') return

const album = await MediaLibrary.getAssetsAsync({
  first: 100,
  mediaType: ['video', 'photo'],
  sortBy: 'creationTime',
})
// album.assets — full metadata (uri, duration, creationTime, mediaType)
```

Then render your own picker UI (matching the PWA's 2-column grid with
checkmarks) rather than the iOS native sheet. **This matches the PWA
better.** The PWA's grid IS its picker; the file input is a one-off
to grab the items, then the grid takes over for selection.

Recommendation: **`expo-media-library` + custom grid**.

#### 9.2 Remux strategy — **THREE options, decide before porting**

The PWA uses `@ffmpeg/ffmpeg` WASM to remux every clip to FastStart
MP4 before upload, so iOS can stream-decode (move `moov` atom to the
front). Native has three paths:

**Option A — Skip remux entirely (v1 recommendation)**
- `expo-image-picker` and `expo-media-library` output MP4s on iOS that
  are already FastStart-correct in most cases (the system encoder
  emits a streaming-friendly layout).
- Test on real iPhone footage (HEVC .MOV → exported MP4). If the
  resulting clip seeks cleanly in Playback's scrub bar, you're fine
  with no remux.
- Pros: no FFmpeg dependency, tiny binary, fast.
- Cons: HEVC clips may not play in all browsers if the user *also*
  opens them on the PWA — but the scope is iOS-native, so this is
  acceptable.
- **Recommended for v1.**

**Option B — `ffmpeg-kit-react-native`**
- Bundle FFmpeg as a native module. 1:1 functional port of the PWA's
  remux + export.
- ~50 MB binary bloat. Requires EAS dev client (no Expo Go).
- Maintained, well-documented.
- **Recommend only if option A produces playback issues.**

**Option C — Custom Expo Module wrapping AVFoundation**
- `AVAssetExportSession` with `AVAssetExportPresetPassthrough` and
  `shouldOptimizeForNetworkUse = true` produces a FastStart MP4
  natively.
- ~100 lines of Swift in an Expo module.
- Best long-term: native perf, no binary bloat, no third-party
  dependency.
- More upfront work.
- **Recommend for v1+ once option A is proven insufficient.**

The handoff brief asked us to document all three and let the porter
decide. **My recommendation is A → C → B in that order.** Option A is
the right v1 bet because we don't *know* there's a problem until we
try.

#### 9.3 Wake lock — `expo-keep-awake`

```ts
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake'

await activateKeepAwakeAsync('upload')
try {
  // upload flow
} finally {
  deactivateKeepAwake('upload')
}
```

See `02-interactions-glossary.md` §13. **Always tag** the lock —
namespacing matters.

### Other native specifics

#### Bottom sheet for Step 2

`@gorhom/bottom-sheet` with `snapPoints={['CONTENT_HEIGHT']}` +
`enableDynamicSizing`. Walnut-mid background, walnut-light handle.

#### Pre-remux behind the scenes

If you go with option A (no remux), there's no pre-remux to do.

If option B/C: trigger the remux on `step === 'name'` transition,
update `preRemuxReady` when done. The pattern from §4 ports directly.

#### Upload UI

The 80 ms lerping interval ports verbatim — see
`02-interactions-glossary.md` §8.

#### Cancel button

Wrap the upload work in a function that checks `cancelledRef.current`
after each `await`. Native makes this *more* important — iOS aggressive
background-task termination means the user might hit cancel right as
iOS suspends the app.

#### Background upload pattern

In RN there's no Web Worker, but JS is single-threaded anyway — the
concurrency-3 pool is just `Promise.all` of 3 async loops. Port from
`UploadContext.jsx` directly:

```ts
const queue = [...clips]
async function worker() {
  while (queue.length && !cancelledRef.current) {
    const next = queue.shift()
    await uploadOne(next!)
  }
}
await Promise.all([worker(), worker(), worker()])
```

#### iOS background task

If the user backgrounds the app mid-upload, iOS gives ~30 seconds
before suspending JavaScript. To extend this for uploads, use
`expo-task-manager` + `expo-background-fetch` — but this is a
significant complication. For v1, the realistic pattern is:
- Acquire keep-awake.
- Show the user "keep this screen open" copy (the PWA does).
- Accept that backgrounding for a long time may pause the upload until
  the user returns.

#### What to defer

For native v0.5 (just-after-TestFlight):

- **In scope:** Custom grid picker (expo-media-library), name sheet,
  basic upload (option A — no remux), lerping progress, cancel, wake
  lock, background banner via UploadContext, cover picker.
- **Out of scope:** Pre-remux optimization (only useful w/ option B/C),
  HEIC → JPEG conversion (defer; modern iOS handles HEIC),
  retry-failed-clips UI, mid-upload abort (graceful exit at next
  step boundary is enough).

---

## 10. Test plan when this screen ships

- [ ] Empty state → tap "Open Camera Roll" → permission prompt → grid
      loads with thumbnails as metadata extracts.
- [ ] Tap cards to select; selection state visible (amber border +
      check). Tap All / None toggles whole batch.
- [ ] Continue → name sheet opens; year/month pre-filled from earliest
      selected clip's date.
- [ ] Type name; pre-remux indicator (if applicable) updates.
- [ ] Tap Create → upload overlay shows; reel spins; progress bar
      lerps smoothly through 0→40 (remux) → 40→95 (upload).
- [ ] Cancel during upload → wake lock released, navigate back, no
      orphaned scrapbook row.
- [ ] Clip 1 lands → navigates to ScrapbookDetail. Top-bar banner
      shows "Uploading N more clips…".
- [ ] Background upload completes within reasonable time on flaky
      WiFi (don't time it; just verify it works at all).
- [ ] Failed clip in background: banner shows partial count, no crash.
- [ ] Add Clips mode (`?addTo=...`): no name sheet, picker → upload
      with `orderOffset > 0` → navigates back to Workspace.
- [ ] HEIC photo: renders correctly on Playback (will need conversion
      step if option A fails).

---

*Cross-references:* `00-brand-system.md` §7 (cassette reel),
`02-interactions-glossary.md` §8 (lerping progress), §11 (bottom sheet),
§13 (wake lock), §16 (photo handling); `03-data-model.md` §6 (R2 paths
+ worker), §7 (clip insert shape); `screens/scrapbook-detail.md` (the
destination after successful upload).
