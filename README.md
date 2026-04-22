# Handoff: Upload Flow Overhaul
**Feature:** Background Upload Queue + Optimistic Navigation  
**Repo:** `Driver-cyber/kasette` · `app/src/`  
**Goal:** < 15 seconds from "Create Scrapbook" tap to next screen, for any batch size  
**Design reference files:** `Upload Flow Prototype.html`, `Upload Strategy.html`

---

## About the Design Files

The `.html` files in this bundle are **design references built in HTML** — interactive prototypes showing the intended look and behavior. Do **not** ship them directly. Your task is to recreate these interactions in the existing React + Vite + Tailwind codebase at `app/src/`, using its established patterns, brand tokens, and component conventions as documented in `DECISIONS.md`.

## Fidelity

**High-fidelity.** The prototype shows exact colors, typography, component layout, and animation behavior. Match it closely. All brand tokens (Amber, Sienna, Wheat, Walnut, etc.) already exist in `app/src/index.css` as Tailwind theme variables. Use them.

---

## What's Being Built

The current upload flow blocks the user on a full-screen loading overlay until **all** clips are uploaded — which can take 10+ minutes for large batches. This overhaul does three things:

1. **Pre-remuxes clip 1 silently** while the user types the scrapbook name  
2. **Navigates to the next screen** as soon as clip 1 (and only clip 1) is uploaded — target < 15 seconds  
3. **Drains the remaining clips** in a global background upload context, 3 concurrent, with a persistent non-blocking banner and per-clip status in the workspace

---

## Files to Create / Modify

| File | Action | Summary |
|---|---|---|
| `src/context/UploadContext.jsx` | **CREATE** | Global background upload queue manager |
| `src/App.jsx` | **MODIFY** | Wrap with UploadContext provider; add persistent upload banner |
| `src/screens/IntakeScreen.jsx` | **MODIFY** | Pre-remux clip 1 on name sheet open; navigate early after clip 1 |
| `src/screens/WorkspaceScreen.jsx` | **MODIFY** | Clip upload states (uploading shimmer, queued, ready); unready toast |
| `src/screens/ScrapbookDetailScreen.jsx` | **MODIFY** | Show upload progress subtitle when queue is active |

---

## 1. New File: `src/context/UploadContext.jsx`

This is the core of the change. It owns the async upload queue, survives navigation, and exposes state to any screen via a hook.

### State shape

```js
{
  scrapbookId: string | null,   // which scrapbook is being uploaded to
  totalClips: number,           // total clips in this batch
  completedClips: number,       // how many have successfully landed in R2 + DB
  failedClips: Array<number>,   // indices of clips that errored (for retry UI later)
  isActive: boolean,            // true while queue is draining
  cancel: () => void,           // cancels remaining uploads
}
```

### API surface

```js
// Hook — use in any screen
const { isActive, scrapbookId, completedClips, totalClips } = useUpload()

// Called by IntakeScreen after clip 1 is uploaded + navigated
startBackgroundUpload({
  scrapbookId: string,
  clips: Array<{ file, thumbnail, duration, date, mediaType }>, // clips 2..N (already remuxed)
  userId: string,
  concurrency: 3,   // how many uploads run simultaneously
})
```

### Queue implementation

Use a simple concurrency-limited pool. No external libraries needed.

```js
async function runPool(tasks, concurrency, onComplete) {
  let i = 0
  async function worker() {
    while (i < tasks.length) {
      const idx = i++
      await tasks[idx]()
      onComplete(idx)
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
}
```

Each task in the pool:
1. Remux the clip via `remuxWithFaststart(clip.file)` — FFmpeg WASM is a singleton so only one remux runs at a time; uploads overlap with the current remux automatically
2. Upload video file via `uploadToR2(storagePath, remuxedFile)`
3. Upload thumbnail via `uploadToR2(thumbPath, thumbBlob)` (non-blocking catch)
4. Insert clip row into Supabase `clips` table
5. Call `onComplete(idx)` to increment `completedClips`

### Wake lock

The context should acquire `navigator.wakeLock.request('screen')` when `startBackgroundUpload` is called, and release it when the queue is fully drained or cancelled. Re-acquire on `visibilitychange` if `document.visibilityState === 'visible'` and `isActive` is still true. This is the same pattern already in `IntakeScreen.jsx` — move it into the context.

### Full file scaffold

```jsx
// src/context/UploadContext.jsx
import { createContext, useContext, useRef, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { uploadToR2 } from '../lib/r2'
import { remuxWithFaststart } from '../lib/remux'

const UploadContext = createContext(null)

export function UploadProvider({ children }) {
  const [state, setState] = useState({
    scrapbookId: null,
    totalClips: 0,
    completedClips: 0,
    failedClips: [],
    isActive: false,
  })
  const cancelledRef = useRef(false)
  const wakeLockRef = useRef(null)

  async function acquireWakeLock() {
    try {
      if ('wakeLock' in navigator)
        wakeLockRef.current = await navigator.wakeLock.request('screen')
    } catch {}
  }
  function releaseWakeLock() {
    try { wakeLockRef.current?.release() } catch {}
    wakeLockRef.current = null
  }

  useEffect(() => {
    if (!state.isActive) return
    function onVisibility() {
      if (document.visibilityState === 'visible') acquireWakeLock()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [state.isActive])

  async function startBackgroundUpload({ scrapbookId, clips, userId, concurrency = 3 }) {
    cancelledRef.current = false
    await acquireWakeLock()
    setState({ scrapbookId, totalClips: clips.length, completedClips: 0, failedClips: [], isActive: true })

    // Get current max order offset
    const { data: existing } = await supabase
      .from('clips').select('order').eq('scrapbook_id', scrapbookId)
      .order('order', { ascending: false }).limit(1)
    const orderOffset = existing?.length > 0 ? existing[0].order + 1 : 1 // +1 because clip 0 already inserted

    const tasks = clips.map((clip, idx) => async () => {
      if (cancelledRef.current) return
      try {
        const isPhoto = clip.mediaType === 'photo'
        const remuxed = isPhoto ? clip : await remuxWithFaststart(clip.file)
        if (cancelledRef.current) return

        const clipId = crypto.randomUUID()
        const ext = clip.file.name.split('.').pop()?.toLowerCase() || (isPhoto ? 'jpg' : 'mp4')
        const storagePath = `${userId}/${scrapbookId}/${clipId}.${ext}`
        const publicUrl = await uploadToR2(storagePath, remuxed.file ?? remuxed)

        let thumbnailUrl = isPhoto ? publicUrl : null
        if (!isPhoto && clip.thumbnail) {
          try {
            const thumbBlob = dataURLtoBlob(clip.thumbnail)
            thumbnailUrl = await uploadToR2(`${userId}/${scrapbookId}/${clipId}_thumb.jpg`, thumbBlob, 'image/jpeg')
          } catch {}
        }

        const duration = isPhoto ? (clip.duration || 5) : (clip.duration || null)
        await supabase.from('clips').insert({
          id: clipId,
          scrapbook_id: scrapbookId,
          storage_path: storagePath,
          video_url: publicUrl,
          thumbnail_url: thumbnailUrl,
          order: orderOffset + idx,
          duration,
          trim_in: 0,
          trim_out: duration,
          recorded_at: clip.date?.toISOString(),
          media_type: clip.mediaType || 'video',
        })

        setState(prev => ({ ...prev, completedClips: prev.completedClips + 1 }))
      } catch {
        setState(prev => ({ ...prev, failedClips: [...prev.failedClips, idx] }))
      }
    })

    // Run pool
    let running = 0, i = 0
    async function next() {
      while (i < tasks.length && !cancelledRef.current) {
        const task = tasks[i++]
        running++
        task().finally(() => { running--; next() })
        if (running >= concurrency) return
      }
    }
    await new Promise(resolve => {
      function check() {
        next()
        if (i >= tasks.length && running === 0) resolve()
        else setTimeout(check, 200)
      }
      check()
    })

    releaseWakeLock()
    setState(prev => ({ ...prev, isActive: false }))
  }

  function cancel() {
    cancelledRef.current = true
    releaseWakeLock()
    setState(prev => ({ ...prev, isActive: false }))
  }

  return (
    <UploadContext.Provider value={{ ...state, startBackgroundUpload, cancel }}>
      {children}
    </UploadContext.Provider>
  )
}

export function useUpload() {
  return useContext(UploadContext)
}

// helper — same as IntakeScreen's version
function dataURLtoBlob(dataURL) {
  const [header, data] = dataURL.split(',')
  const mime = header.match(/:(.*?);/)[1]
  const binary = atob(data)
  const arr = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i)
  return new Blob([arr], { type: mime })
}
```

> **Note:** The pool implementation above uses a polling approach for simplicity. If you prefer a cleaner recursive promise chain, that's fine — just keep concurrency at 3.

---

## 2. Modify `src/App.jsx`

### Add UploadProvider wrapper

```jsx
import { UploadProvider } from './context/UploadContext'

// Wrap the router outlet:
<UploadProvider>
  <RouterOutlet />  {/* or however AuthGate/routes are structured */}
</UploadProvider>
```

### Add persistent upload banner

Render `<UploadBanner />` **inside** `UploadProvider` but **outside** the route outlet, so it persists across navigation. Place it above the route outlet, not as a portal — it should push content down slightly rather than overlay it (avoids blocking the top of each screen).

```jsx
// UploadBanner component (define in App.jsx or a shared components file)
function UploadBanner() {
  const { isActive, completedClips, totalClips, scrapbookId, cancel } = useUpload()
  if (!isActive) return null

  const remaining = totalClips - completedClips
  const pct = totalClips > 0 ? (completedClips / totalClips) * 100 : 0

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-walnut-light"
         style={{ background: 'rgba(26,15,8,0.97)' }}>
      {/* Cassette reel animation — same <Reel /> SVG from IntakeScreen */}
      <Reel size={18} />
      <div className="flex-1">
        <div className="flex justify-between mb-1">
          <span className="text-amber text-[11px] font-bold">
            Uploading {remaining} more clip{remaining !== 1 ? 's' : ''}
          </span>
          <span className="text-rust text-[10px]">{Math.round(pct)}%</span>
        </div>
        <div className="h-[2px] bg-walnut-light rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #F2A24A, #E8855A)' }}
          />
        </div>
      </div>
      <button onClick={cancel} className="text-rust/50 text-[11px] font-semibold active:opacity-70 ml-1">
        Cancel
      </button>
    </div>
  )
}
```

The `Reel` SVG component is already defined in `IntakeScreen.jsx` — move it to a shared location (e.g., `src/components/Reel.jsx`) and import it in both places.

---

## 3. Modify `src/screens/IntakeScreen.jsx`

This has the most changes. There are three distinct modifications:

### 3a. Pre-remux clip 1 when name sheet opens

Add a `preRemuxRef` to hold the in-progress remux result, and kick it off the moment `step` transitions to `'name'`:

```js
const preRemuxRef = useRef(null)   // holds { promise, result } once started
const [preRemuxReady, setPreRemuxReady] = useState(false)

useEffect(() => {
  if (step !== 'name') return
  // Find the first video clip (skip photos — they don't need remux)
  const firstVideoClip = selectedItems.find(i => i.mediaType !== 'photo')
  if (!firstVideoClip) { setPreRemuxReady(true); return }

  preRemuxRef.current = { result: null }
  remuxWithFaststart(firstVideoClip.file).then(remuxed => {
    preRemuxRef.current.result = { ...firstVideoClip, file: remuxed }
    setPreRemuxReady(true)
  }).catch(() => {
    // fallback — upload original
    preRemuxRef.current.result = firstVideoClip
    setPreRemuxReady(true)
  })
}, [step])
```

Show a subtle indicator in the name sheet UI while this runs (see UI section below).

### 3b. Update `handleCreate()` — navigate after clip 1, hand off the rest

Replace the existing `handleCreate` function entirely:

```js
async function handleCreate() {
  if (!name.trim() || !selectedItems.length || uploading) return
  cancelledRef.current = false
  setUploading(true)
  setError(null)
  await acquireWakeLock()  // keep for this brief loading phase

  try {
    // 1. Get remuxed clip 1 (either from pre-remux or do it now)
    let clip1
    if (preRemuxRef.current?.result) {
      clip1 = preRemuxRef.current.result
    } else {
      const first = selectedItems[0]
      clip1 = first.mediaType === 'photo'
        ? first
        : { ...first, file: await remuxWithFaststart(first.file) }
    }

    // 2. Create scrapbook record
    const { data: sb, error: sbErr } = await supabase
      .from('scrapbooks')
      .insert({ name: name.trim(), user_id: session.user.id, year, month })
      .select().single()
    if (sbErr) throw sbErr

    // 3. Auto-share defaults (unchanged — same fire-and-forget pattern)
    try {
      const { data: shareDefaults } = await supabase
        .from('sharing_defaults').select('recipient_id').eq('user_id', session.user.id)
      if (shareDefaults?.length > 0) {
        await supabase.from('scrapbook_shares').upsert(
          shareDefaults.map(d => ({
            scrapbook_id: sb.id, owner_id: session.user.id, shared_with_id: d.recipient_id,
          })),
          { onConflict: 'scrapbook_id,shared_with_id', ignoreDuplicates: true }
        )
      }
    } catch {}

    // 4. Upload cover if provided (unchanged)
    if (coverFile) {
      const ext = coverFile.name.split('.').pop()?.toLowerCase() || 'jpg'
      try {
        const coverUrl = await uploadToR2(`${session.user.id}/covers/${sb.id}.${ext}`, coverFile)
        await supabase.from('scrapbooks').update({ cover_image_url: coverUrl }).eq('id', sb.id)
      } catch {}
    }

    // 5. Upload clip 1 + thumbnail, insert DB row
    const clipId = crypto.randomUUID()
    const ext = clip1.file.name.split('.').pop()?.toLowerCase() || (clip1.mediaType === 'photo' ? 'jpg' : 'mp4')
    const storagePath = `${session.user.id}/${sb.id}/${clipId}.${ext}`
    const publicUrl = await uploadToR2(storagePath, clip1.file)

    let thumbnailUrl = clip1.mediaType === 'photo' ? publicUrl : null
    if (clip1.mediaType !== 'photo' && clip1.thumbnail) {
      try {
        const thumbBlob = dataURLtoBlob(clip1.thumbnail)
        thumbnailUrl = await uploadToR2(`${session.user.id}/${sb.id}/${clipId}_thumb.jpg`, thumbBlob, 'image/jpeg')
      } catch {}
    }

    const duration = clip1.mediaType === 'photo' ? (clip1.duration || 5) : (clip1.duration || null)
    const { error: clipErr } = await supabase.from('clips').insert({
      id: clipId,
      scrapbook_id: sb.id,
      storage_path: storagePath,
      video_url: publicUrl,
      thumbnail_url: thumbnailUrl,
      order: 0,
      duration,
      trim_in: 0,
      trim_out: duration,
      recorded_at: clip1.date?.toISOString(),
      media_type: clip1.mediaType || 'video',
    })
    if (clipErr) throw clipErr

    // 6. ★ Navigate NOW — clip 1 is live
    releaseWakeLock()
    setUploading(false)

    // 7. Hand remaining clips to background context
    const remainingClips = selectedItems.slice(1)  // clips 2..N (un-remuxed — context handles remux)
    if (remainingClips.length > 0) {
      startBackgroundUpload({
        scrapbookId: sb.id,
        clips: remainingClips,
        userId: session.user.id,
        concurrency: 3,
      })
    }

    navigate(`/scrapbook/${sb.id}`)

  } catch (err) {
    console.error(err)
    releaseWakeLock()
    setError(err.message || 'Upload failed. Please try again.')
    setUploading(false)
  }
}
```

Import `useUpload` at the top of the file:
```js
import { useUpload } from '../context/UploadContext'
// inside the component:
const { startBackgroundUpload } = useUpload()
```

### 3c. Loading overlay — replace full-screen blocker with focused two-clip view

The existing full-screen upload overlay (`if (uploading) { return <...> }`) is replaced with a lighter version that only shows clip 1 uploading (since that's all we're waiting for). Key changes:

- **Remove the "Keep this screen open until it's done" note** — no longer needed
- **Show clip 1 progress** with a real progress bar
- **Show clip 2 starting concurrently** (it starts uploading alongside clip 1 in the background context) with a lighter progress indicator
- **Add reassurance blurb:** `"You can start editing right away. Any trimming or captions you add are saved instantly and won't be lost."`

Track clip 1 upload progress by wiring a `onUploadProgress` callback through `uploadToR2` — or simply animate a smooth progress bar using the existing lerp pattern already in IntakeScreen (it already has `smoothPctRef` / `displayPct` — keep that).

The two-clip loading UI from the prototype (see `Upload Flow Prototype.html` → "Loading" screen) is the exact target.

### 3d. Name sheet — pre-remux indicator

In the name sheet UI, add a small status row between the summary pill and the Create button:

```jsx
{/* Pre-remux status — only show for batches with video clips */}
{selectedItems.some(i => i.mediaType !== 'photo') && (
  <div className="flex items-center gap-2.5 rounded-xl px-3 py-2 mb-4 border border-walnut-light"
       style={{ background: '#2C1A0E' }}>
    {preRemuxReady ? (
      <div className="w-4 h-4 rounded-full bg-amber flex items-center justify-center flex-shrink-0">
        <Check size={9} strokeWidth={3} className="text-walnut" />
      </div>
    ) : (
      <div className="w-4 h-4 rounded-full border-2 border-amber border-t-transparent animate-spin flex-shrink-0" />
    )}
    <span className="text-[11px] font-semibold" style={{ color: preRemuxReady ? '#F2A24A' : '#F5DEB3' }}>
      {preRemuxReady ? 'Clip 1 optimized and ready' : 'Optimizing clip 1 while you type…'}
    </span>
  </div>
)}

{/* Create button — fully opaque when preRemuxReady, slightly muted before */}
<button
  onClick={handleCreate}
  disabled={!name.trim() || uploading}
  className="w-full bg-amber text-walnut font-sans font-bold text-[15px] rounded-2xl py-4 active:opacity-85 transition-all disabled:opacity-40"
  style={{ opacity: name.trim() ? (preRemuxReady ? 1 : 0.75) : undefined }}
>
  Create Scrapbook
</button>
```

The button is **never disabled** just because pre-remux isn't done — if the user taps before it finishes, `handleCreate` falls back to remuxing inline (the `if (preRemuxRef.current?.result)` check handles this). The opacity just provides a visual cue.

---

## 4. Modify `src/screens/WorkspaceScreen.jsx`

### 4a. Detect which clips are "ready" vs "still uploading"

The WorkspaceScreen already fetches clips from Supabase. Clips that haven't uploaded yet simply don't exist in the DB yet — they have no row. So the workspace will naturally only show uploaded clips.

**The change:** Subscribe to Supabase Realtime on the `clips` table filtered by `scrapbook_id` to pick up new clip rows as they land from the background upload. When a new row arrives, append it to the local clips array.

```js
useEffect(() => {
  const channel = supabase
    .channel(`clips:${scrapbookId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'clips',
      filter: `scrapbook_id=eq.${scrapbookId}`,
    }, payload => {
      setClips(prev => {
        // Avoid duplicates
        if (prev.some(c => c.id === payload.new.id)) return prev
        return [...prev, payload.new].sort((a, b) => a.order - b.order)
      })
    })
    .subscribe()

  return () => supabase.removeChannel(channel)
}, [scrapbookId])
```

### 4b. Show upload count in workspace header

```jsx
const { isActive, completedClips, totalClips, scrapbookId: uploadingScrapbookId } = useUpload()
const uploadingThisScrapbook = isActive && uploadingScrapbookId === scrapbookId
const pendingCount = uploadingThisScrapbook ? totalClips - completedClips : 0
```

In the workspace nav or below it, when `pendingCount > 0`:
```jsx
{pendingCount > 0 && (
  <p className="text-rust text-[10px] text-center pb-1">
    {pendingCount} clip{pendingCount !== 1 ? 's' : ''} still uploading in the background
  </p>
)}
```

### 4c. No shimmer needed — the workspace only shows uploaded clips

Because clips appear via Realtime INSERT as they land, the workspace never needs to show "uploading" shimmer states. Clips arrive already uploaded. This is simpler than the prototype showed — the prototype visualized the queue for clarity, but the implementation is cleaner: clips just pop into existence as they're ready.

> **Exception:** If the user navigates to workspace faster than expected and some clips haven't landed yet, the Realtime subscription will add them without any user action needed.

---

## 5. Modify `src/screens/ScrapbookDetailScreen.jsx`

Show upload progress when the background queue is active for this scrapbook:

```jsx
const { isActive, completedClips, totalClips, scrapbookId: uploadingId } = useUpload()
const uploadingHere = isActive && uploadingId === scrapbook?.id
const pending = totalClips - completedClips

// In the detail screen UI, below the scrapbook title:
{uploadingHere && (
  <div className="flex items-center gap-2 mt-1">
    <div className="w-1.5 h-1.5 rounded-full bg-amber animate-pulse" />
    <span className="text-amber text-[11px] font-semibold">
      Uploading {pending} more clip{pending !== 1 ? 's' : ''}…
    </span>
  </div>
)}
```

---

## 6. Modify `handleAddClips()` in `IntakeScreen.jsx`

The `handleAddClips` function (used when `addToId` is set) needs the same treatment as `handleCreate`:

- Upload clip 1 first, navigate back to `/scrapbook/${addToId}/edit` as soon as clip 1 lands
- Hand clips 2..N to `startBackgroundUpload({ scrapbookId: addToId, clips: remaining, ... })`
- Pre-remux clip 1 during the name sheet phase (skip — there's no name sheet for addTo flow, so just start remuxing clip 1 immediately when the upload begins, same as today but isolated to clip 1)

---

## Design Tokens (already in `index.css`)

```
amber:        #F2A24A   (--color-amber)
sienna:       #E8855A   (--color-sienna)
wheat:        #F5DEB3   (--color-wheat)
walnut:       #2C1A0E   (--color-walnut)
walnut-mid:   #3D2410   (--color-walnut-mid)
walnut-light: #4A2E18   (--color-walnut-light)
rust:         #7A3B1E   (--color-rust)
deep:         #1A0F08   (--color-deep)
```

Typography: `font-display` = Fraunces, `font-sans` = Plus Jakarta Sans.

---

## Key Behaviors to Preserve

- **Wake lock** — already in IntakeScreen. Move the acquire/release logic into UploadContext so it covers the background drain phase, not just the clip-1 phase
- **Cancel** — the X button in the current upload overlay should cancel only the clip-1 phase. Cancelling the background queue (in the banner) is a separate action and should prompt confirmation: "Cancel upload? Clips already uploaded will remain."
- **Error handling** — if clip 1 fails to upload, stay on the loading screen and show the error (same as today). If a background clip fails, increment `failedClips` — surface a retry option later (out of scope for this sprint, just track it)
- **The `dataURLtoBlob` helper** is duplicated between IntakeScreen and UploadContext — extract it to `src/lib/utils.js`
- **The `Reel` SVG component** is defined in IntakeScreen — extract it to `src/components/Reel.jsx` for reuse in the banner

---

## Testing Checklist

- [ ] Name sheet opens → pre-remux spinner appears → resolves to checkmark within 2s
- [ ] Create Scrapbook tap → loading screen shows clip 1 + clip 2 bars
- [ ] Navigation fires within 15s on a typical clip (< 100MB)
- [ ] Upload banner appears on detail screen and workspace; updates as clips land
- [ ] Workspace Realtime subscription adds clips without refresh
- [ ] Tapping away from the app mid-upload (background app) → return → wake lock re-acquired, upload resumes
- [ ] Cancel from banner → remaining clips stop; already-uploaded clips persist in DB
- [ ] 30-clip batch: all 30 clips present in workspace within ~3 minutes on home WiFi
- [ ] `handleAddClips` (Add Clips to existing scrapbook) works with same pattern

---

## Files in This Package

| File | Purpose |
|---|---|
| `README.md` | This spec |
| `Upload Flow Prototype.html` | Interactive prototype — 4-screen clickable flow |
| `Upload Strategy.html` | Full strategy doc — diagnosis, speed plan, reliability plan |
