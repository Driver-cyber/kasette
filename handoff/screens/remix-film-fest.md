# screens/remix-film-fest.md — Remix / Film Fest

> **What it is.** A filter workspace. Pick years and months; the app
> assembles a cross-scrapbook playlist and hands it to Discovery in
> remix mode. Also home of "Surprise Me" — a single button that picks
> 10–15 random clips (including optionally shared clips) and runs the
> same handoff. Also home of the "Save as Scrapbook" combine flow.
>
> **Priority for native.** Medium. Nice-to-have for v1; Home + Detail
> + Playback + Discovery (library mode only) get the user 80% of the
> joy.

Route: `/remix` · File: `kasette/app/src/screens/RemixScreen.jsx`
(906 lines) · Native: not yet ported.

---

## 1. Purpose & user mental model

She tapped the Shuffle icon on Home. Or she tapped the Disc3 sheet's
"Stay in Film Fest" earlier. Either way, she lands here.

Three things she might do:

1. **Filter and watch.** Pick years + months → tap Watch → pick which
   scrapbooks from the matches → tap Watch again → loading → Discovery
   in "Film Fest" mode with that filtered cross-scrapbook playlist.
2. **Surprise Me.** Tap the "Surprise Me" pill top-right → loading →
   Discovery with a random 10–15 clips drawn from her whole library
   (and optionally shared clips per a Settings toggle).
3. **Combine.** From the select-scrapbooks step, tap "Save as
   Scrapbook" → name sheet → a new scrapbook is created in the library
   containing all chosen clips (denormalized — linked, not copied — see
   §8).

The voice is playful: "Film Fest" / "Rolling the dice…" / "Making it
groovy…" / "Mixtape" naming suggestions.

---

## 2. Layout (four phases)

The screen has four phases tracked by a single `phase` state var:
`'studio' | 'select' | 'loading' | 'loading-surprise'`.

### 2.1 Studio phase (default — filter entry point)

```
┌──────────────────────────────────────────────────┐
│  [← Library]              [💾 saves] [✦ Surprise]│  ← top row
│                                                  │
│                                                  │
│  Film Fest                                       │  ← Fraunces 52 px / lh 1.05 / -0.02em
│  Watch clips across your whole library           │  ← rust 14 px
│                                                  │
│  Filter your film              [Clear ✕]         │  ← section label + clear
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  Year                                  ▾    │  │  ← multi-select dropdown
│  └────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────┐  │
│  │  Month                                 ▾    │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  (error message, conditional, sienna)            │
│                                                  │
│  ┌─────────────┐  ┌─────────────┐                │
│  │  ⬇ Download │  │  ▶  Watch    │                │  ← Download = stub, Watch = primary
│  └─────────────┘  └─────────────┘                │
└──────────────────────────────────────────────────┘
```

### 2.2 Select phase (after Watch — pick which scrapbooks)

```
┌──────────────────────────────────────────────────┐
│  [← Filters]   Your Film Fest    [Select all]    │
│  [2026] [March] (filter summary pills)           │
│                                                  │
│  ┌──────────────────────────────────────────────┐│
│  │ [thumb]  Beach Trip                  ▢       ││  ← scrapbook row
│  │          March 2026 · 12 clips                ││
│  └──────────────────────────────────────────────┘│
│  ┌──────────────────────────────────────────────┐│
│  │ [thumb]  ...                          ▣       ││  ← checked = amber
│  └──────────────────────────────────────────────┘│
│  ...                                             │
│                                                  │
│  ┌─────────────────────┐ ┌──────────────────┐    │
│  │  Save as Scrapbook  │ │  Watch · 4       │    │  ← secondary + primary
│  └─────────────────────┘ └──────────────────┘    │
└──────────────────────────────────────────────────┘
```

### 2.3 Loading phase (in both Watch and Surprise Me)

```
┌──────────────────────────────────────────────────┐
│                                          [X]     │  ← cancel
│                                                  │
│                                                  │
│            [◯ reel] [◯ reel]                     │
│                                                  │
│        "Preparing your film…"                    │
│             or                                   │
│        "Rolling the dice…"                       │
│                                                  │
│        Loading 47 clips…                         │
│             or                                   │
│        Picking a mix just for you                │
│                                                  │
└──────────────────────────────────────────────────┘
```

### 2.4 Combine sheet (Save as Scrapbook — bottom sheet over select)

```
┌──────────────────────────────────────────────────┐
│  [────  handle  ────]                            │
│                                                  │
│  Save as New Scrapbook                       [×] │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  2024–2026 Mixtape                         │  │  ← name input, pre-filled
│  └────────────────────────────────────────────┘  │
│                                                  │
│  87 clips from 4 scrapbooks                      │  ← summary
│  Clips are linked, not copied.                   │  ← (small note)
│                                                  │
│  (error, conditional)                            │
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │      Create Scrapbook                    │    │  ← amber CTA
│  └──────────────────────────────────────────┘    │
└──────────────────────────────────────────────────┘
```

---

## 3. State machine

```ts
// Phase
const [phase, setPhase] = useState<'studio'|'select'|'loading'|'loading-surprise'>('studio')

// Filters
const [availableYears, setAvailableYears] = useState<number[]>([])
const [selectedYears, setSelectedYears] = useState<number[]>([])
const [selectedMonths, setSelectedMonths] = useState<number[]>([])

// Select phase
const [scrapbooksToSelect, setScrapbooksToSelect] = useState<Scrapbook[]>([])
const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
const [loadingClipCount, setLoadingClipCount] = useState(0)

// Saved filter configs
const [savedConfigs, setSavedConfigs] = useState<FilmFestSave[]>([])
const [showSavesSheet, setShowSavesSheet] = useState(false)
const [saveNameInput, setSaveNameInput] = useState('')
const [showSaveInput, setShowSaveInput] = useState(false)

// Combine
const [showCombineSheet, setShowCombineSheet] = useState(false)
const [combineNameInput, setCombineNameInput] = useState('')
const [combineWorking, setCombineWorking] = useState(false)
const [combineError, setCombineError] = useState<string|null>(null)

// Error
const [errorMsg, setErrorMsg] = useState<string|null>(null)

// Coming Soon modal (Download stub)
const [comingSoon, setComingSoon] = useState(false)

// Refs
const cancelledRef = useRef(false)
const loadingSourceRef = useRef<'studio'|'select'>('studio')
```

---

## 4. Data fetches & writes

### On mount

1. **Available years** — `from('scrapbooks').select('year, created_at').eq('user_id', uid)` → derive unique years for the filter dropdown.
2. **Saved configs** — `from('film_fest_saves').select('*').eq('user_id', uid)`.
3. **Profile setting** — `from('profiles').select('surprise_me_include_shared').eq('user_id', uid).single()` for the Surprise Me toggle.
4. **Prewarm** — fire-and-forget: fetch 5 random clips' video+thumb blobs to warm cache.

### Watch flow (`handleWatch`)

```ts
async function handleWatch() {
  // 1. Query scrapbooks with the filter
  const { data } = await supabase
    .from('scrapbooks')
    .select(`id, name, year, month, cover_image_url, created_at, clips(${CLIP_SELECT})`)
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false })

  // 2. Filter client-side
  const filtered = data.filter(sb =>
    (selectedYears.length === 0 || selectedYears.includes(sb.year ?? new Date(sb.created_at).getFullYear())) &&
    (selectedMonths.length === 0 || selectedMonths.includes(sb.month ?? 0)) &&
    (sb.clips || []).some(c => c.video_url)
  )

  if (filtered.length === 0) {
    setErrorMsg('No clips match those filters.')
    return
  }

  // 3. Move to select phase with all books pre-checked
  setScrapbooksToSelect(filtered)
  setCheckedIds(new Set(filtered.map(sb => sb.id)))
  setPhase('select')
}
```

`CLIP_SELECT` constant (verbatim, shared by Watch and Surprise Me):

```ts
const CLIP_SELECT = 'id, video_url, thumbnail_url, duration, trim_in, trim_out, cut_in, cut_out, caption_text, caption_x, caption_y, caption_size'
```

### Watch selected (`handleWatchSelected`)

```ts
async function handleWatchSelected() {
  setPhase('loading')
  cancelledRef.current = false
  loadingSourceRef.current = 'select'

  // Flatten checked books into a clip pool
  const pool = scrapbooksToSelect
    .filter(sb => checkedIds.has(sb.id))
    .flatMap(sb => (sb.clips || []).map(clip => ({
      ...clip,
      scrapbook: { id: sb.id, name: sb.name, year: sb.year },
    })))
  setLoadingClipCount(pool.length)

  // Prewarm thumbnails (web-only optimization)
  pool.forEach(c => { if (c.thumbnail_url) { const img = new Image(); img.src = c.thumbnail_url } })

  // Min 2s loading + warm first 1–3 blobs
  const minDelay = new Promise(r => setTimeout(r, 2000))
  const firstReady = preloadClips(pool, Math.min(3, pool.length))
  pool.slice(3).forEach(c => preloadClip(c.video_url))
  await Promise.all([minDelay, firstReady])

  if (cancelledRef.current) return

  navigate('/discover', { state: { clips: pool, isRemix: true, screenTitle: 'Film Fest' } })
}
```

### Surprise Me (`handleSurpriseMe`)

```ts
async function handleSurpriseMe() {
  setPhase('loading-surprise')
  cancelledRef.current = false
  loadingSourceRef.current = 'studio'

  // 1. Fetch own clips
  const { data: own } = await supabase
    .from('scrapbooks')
    .select(`id, name, year, created_at, clips(${CLIP_SELECT})`)
    .eq('user_id', session.user.id)

  let pool = own.flatMap(sb => (sb.clips || []).map(c => ({ ...c, scrapbook: { id: sb.id, name: sb.name, year: sb.year ?? new Date(sb.created_at).getFullYear() } })))

  // 2. Optionally include shared
  if (profile.surprise_me_include_shared) {
    const { data: shared } = await supabase
      .from('scrapbook_shares')
      .select(`scrapbooks(id, name, year, created_at, clips(${CLIP_SELECT}))`)
      .eq('shared_with_id', session.user.id)
    const sharedClips = shared.flatMap(s => (s.scrapbooks?.clips || []).map(c => ({ ...c, scrapbook: { id: s.scrapbooks.id, name: s.scrapbooks.name, year: s.scrapbooks.year } })))
    pool = [...pool, ...sharedClips]
  }

  if (pool.length === 0) {
    setErrorMsg("Couldn't find any clips to surprise you with.")
    setPhase('studio')
    return
  }

  // 3. Shuffle and pick 10–15
  pool = pool.sort(() => Math.random() - 0.5)
  const pickCount = Math.min(pool.length, Math.floor(Math.random() * 6) + 10)   // 10–15
  pool = pool.slice(0, pickCount)

  // Same preload + min 2s + navigate as Watch
  // ...
  navigate('/discover', { state: { clips: pool, isRemix: true, screenTitle: 'Surprise Me' } })
}
```

### Saved configs

```ts
// Save
await supabase.from('film_fest_saves').insert({
  user_id: session.user.id,
  name: saveNameInput.trim(),
  filter_config: { years: selectedYears, months: selectedMonths },
}).select().single()

// Delete
await supabase.from('film_fest_saves').delete().eq('id', configId)

// Load
setSelectedYears(config.filter_config.years)
setSelectedMonths(config.filter_config.months)
setShowSavesSheet(false)
```

### Combine ("Save as Scrapbook")

```ts
async function handleCombine() {
  if (!combineNameInput.trim() || combineWorking) return
  setCombineWorking(true)
  setCombineError(null)

  const checkedBooks = scrapbooksToSelect.filter(sb => checkedIds.has(sb.id))
  // Decide year/month/cover for new scrapbook
  const years = [...new Set(checkedBooks.map(b => b.year))]
  const year = years.length === 1 ? years[0] : null
  const months = [...new Set(checkedBooks.map(b => b.month))]
  const month = (years.length === 1 && months.length === 1) ? months[0] : null
  const cover = checkedBooks.find(b => b.cover_image_url)?.cover_image_url ?? null

  try {
    // 1. Create scrapbook
    const { data: newSb, error: sbErr } = await supabase
      .from('scrapbooks')
      .insert({ user_id: session.user.id, name: combineNameInput.trim(), year, month, cover_image_url: cover })
      .select().single()
    if (sbErr) throw sbErr

    // 2. Fetch all clips
    const { data: sourceClips } = await supabase
      .from('clips')
      .select('*')
      .in('scrapbook_id', checkedBooks.map(b => b.id))

    // 3. Sort: preserve scrapbook order from select screen, then clip order within
    const bookOrder = checkedBooks.map(b => b.id)
    const sortedClips = [...(sourceClips || [])].sort((a, b) => {
      const ai = bookOrder.indexOf(a.scrapbook_id)
      const bi = bookOrder.indexOf(b.scrapbook_id)
      if (ai !== bi) return ai - bi
      return (a.order ?? 0) - (b.order ?? 0)
    }).filter(c => c.video_url)

    // 4. Insert with new orders 0..N
    const clipRows = sortedClips.map((clip, i) => ({
      scrapbook_id: newSb.id,
      storage_path: clip.storage_path,
      video_url: clip.video_url,
      thumbnail_url: clip.thumbnail_url,
      duration: clip.duration,
      trim_in: clip.trim_in ?? 0,
      trim_out: clip.trim_out,
      cut_in: clip.cut_in,
      cut_out: clip.cut_out,
      caption_text: clip.caption_text,
      caption_x: clip.caption_x ?? 50,
      caption_y: clip.caption_y ?? 85,
      caption_size: clip.caption_size ?? 24,
      recorded_at: clip.recorded_at,
      media_type: clip.media_type,
      order: i,
    }))
    if (clipRows.length > 0) {
      await supabase.from('clips').insert(clipRows)
    }

    navigate(`/scrapbook/${newSb.id}`)
  } catch (e) {
    setCombineError(e.message)
    setCombineWorking(false)
  }
}
```

---

## 5. Every interaction

### 5.1 Year / month filter dropdowns

Multi-select dropdowns. Behavior:

- Closed: shows "All Years" / "All Months" if empty selection; otherwise shows the selected values (or "{N} selected" if more than 3).
- Open: full list with checkboxes. "All Years" / "All Months" entry at top clears selection.
- Tap an item: toggles its presence.
- Tap outside: closes (no commit; selections are live).

**Native equivalent:** custom `<MultiSelectDropdown>` component
(matches PWA's inline implementation). Bottom-sheet-style dropdown
might be nicer on iOS — consider for v2.

### 5.2 Clear filters

Tap "Clear ✕" → both selections reset to `[]`.

### 5.3 Saves bookmark icon

Tap → opens "Saved Filters" bottom sheet:

- Each saved config: row with name + ✕ delete button. Tap row → load
  config.
- At bottom: input + Save button (or `+ Save current filters` text
  link to expand the input).

### 5.4 Watch button

Tap → `handleWatch()` (see §4). On success → select phase. On no
matches → red error message.

### 5.5 Download button

Tap → `setComingSoon(true)` → "Coming soon" modal:

> Download is on the way.
> *Hold tight — this feature is coming in a future update.*

Single dismiss button. **Stub.** Native: same — render the modal,
keep the stub. The PWA's `comingSoon` modal pattern is the right
template.

### 5.6 Surprise Me pill

Tap → `handleSurpriseMe()` (see §4). Switches phase to `'loading-
surprise'`.

### 5.7 Select-phase scrapbook checkbox

Tap row → toggle in `checkedIds` Set. Watch button count updates.

### 5.8 Select all / Deselect all

Top-right toggle in select phase.

### 5.9 Watch · {count} button (select phase)

Disabled if `checkedIds.size === 0`. Tap → `handleWatchSelected()`.

### 5.10 Save as Scrapbook button (select phase)

Tap → `openCombineSheet()`:

```ts
function openCombineSheet() {
  const years = [...new Set(scrapbooksToSelect.filter(b => checkedIds.has(b.id)).map(b => b.year))]
  let suggested = 'Mixtape'
  if (years.length === 1) suggested = `${years[0]} Mixtape`
  else if (years.length >= 2) {
    const min = Math.min(...years)
    const max = Math.max(...years)
    suggested = `${min}–${max} Mixtape`
  }
  setCombineNameInput(suggested)
  setShowCombineSheet(true)
}
```

### 5.11 Create Scrapbook (combine sheet)

Tap → `handleCombine()` (see §4). On success → navigates to new
scrapbook's detail. On error → red message in sheet.

### 5.12 Cancel on loading screens

Tap X top-right → `cancelledRef.current = true`; phase returns to
`loadingSourceRef.current` (which records whether the user came from
studio or select).

### 5.13 Back button (studio → Library)

Top-left ← → `navigate('/')` → Home.

### 5.14 Back button (select → studio)

Top-left "← Filters" → `setPhase('studio')`.

---

## 6. Animations & micro-feel

### 6.1 Cassette reels

Same pair-of-asymmetric-reels (2.1s + 1.7s) as elsewhere. See
`00-brand-system.md` §7.

### 6.2 Min 2 s loading

Watch and Surprise Me both enforce a minimum 2-second loading screen.
This is *branded loading*, not data delay — see
`screens/scrapbook-detail.md` §5.2 for the same pattern. Don't shorten
it in native.

### 6.3 Multi-select dropdown chevron

`transform: rotate(180deg)` when open, 0.15 s ease.

### 6.4 Coming Soon modal

Fade-in backdrop + slide-up card. PWA uses no transition — native can
add a 200 ms ease-out.

### 6.5 Filter summary pills (select phase)

Amber background with rounded-full borders; small (`text-[11px]`),
horizontal flex. No animation.

---

## 7. Empty / loading / error states

### Loading

Cassette reels + phase text. Each phase has its own copy:

- `'loading'` → "Preparing your film…" / "Loading {n} clip{s}…"
- `'loading-surprise'` → "Rolling the dice…" / "Picking a mix just for you"

### Empty filter result

Red `errorMsg`: "No clips match those filters."

### Empty library (Surprise Me with 0 own clips and no shares)

`errorMsg`: "Couldn't find any clips to surprise you with."

### Combine error

Sienna text in the combine sheet.

---

## 8. Known gotchas & "why it works"

- **Combine "links, not copies."** The newly inserted clip rows point
  to the same R2 `video_url` as the source clips. If you delete a
  source scrapbook, the combined scrapbook's clips break. PWA's
  `safeDeleteClipFiles` checks for other clips referencing the URL
  before deleting from R2 — preserves the combined scrapbook. **Don't
  break this on native.** When porting Workspace's "Remove clip" flow,
  ensure the same multi-ref check runs (see `lib/mediaDelete.js`).
- **Min 2 s loading on every transition** — brand, not data.
- **Surprise Me range is 10–15.** `Math.floor(Math.random() * 6) + 10`.
- **Year filter empty = "All Years".** Not zero clips. The query just
  drops the `.in('year', ...)` filter.
- **Month=0 in the data structure** = ungrouped bucket. The filter
  passes `0` through verbatim if "···" is selected.
- **Prewarm runs on mount silently.** 5 random clips' video+thumb
  blobs loaded. No UI. Improves perceived Surprise Me speed.
- **The shared CLIP_SELECT constant** — defined once at top of file.
  Native: define once and import from a shared constants file.

---

## 9. Native translation notes

### Recommended stack

- **`expo-blur`** for the top-bar buttons (optional).
- **`@gorhom/bottom-sheet`** for Saves sheet and Combine sheet.
- A custom `<MultiSelectDropdown>` component (write once, reuse here).
- **`lucide-react-native`** for Disc3 (used in Discovery), Shuffle,
  Bookmark, X.

### Multi-select dropdown component

Sketch:

```tsx
function MultiSelectDropdown<T>({
  label, options, selected, onChange,
  allLabel = 'All',
}: { ... }) {
  const [open, setOpen] = useState(false)
  const displayText =
    selected.length === 0 ? allLabel :
    selected.length > 3 ? `${selected.length} selected` :
    selected.map(v => options.find(o => o.value === v)?.label).join(', ')

  return (
    <View>
      <Pressable onPress={() => setOpen(!open)} style={styles.button}>
        <Text style={styles.label}>{displayText}</Text>
        <ChevronDown size={18} color={colors.amber}
          style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} />
      </Pressable>
      {open && (
        <View style={styles.menu}>
          <Pressable onPress={() => { onChange([]); setOpen(false) }} style={styles.option}>
            <Checkbox checked={selected.length === 0} />
            <Text>{allLabel}</Text>
          </Pressable>
          {options.map(opt => (
            <Pressable key={opt.value} onPress={() => {
              const next = selected.includes(opt.value)
                ? selected.filter(v => v !== opt.value)
                : [...selected, opt.value]
              onChange(next)
            }} style={styles.option}>
              <Checkbox checked={selected.includes(opt.value)} />
              <Text>{opt.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  )
}
```

### Remix handoff to Discovery

See `01-navigation-flow.md` §1 — module-scoped buffer pattern.

### Prewarm

In native (without blob cache), prewarm reduces to `Image.prefetch()`
on thumbnails. Skip the video prewarm — let `expo-video` cache via
HTTP.

### What to defer

For v1:

- **In scope:** Filter studio, Watch flow, Surprise Me, loading screens, navigation to Discovery.
- **Out of scope:** Saved filter configs (UI complexity); the Combine
  flow (data-shape complexity — multi-scrapbook insert + ordering);
  Download stub (just hide the button).

---

## 10. Test plan when this screen ships

- [ ] Open Remix from Home Shuffle icon → studio phase, title "Film
      Fest" centered, dropdowns empty (= All).
- [ ] Tap Year → dropdown opens. Tap "2026" → closes? No — multi-select
      stays open. Tap outside → closes.
- [ ] Watch → if filtered results empty: red error.  Else → select
      phase with all books pre-checked.
- [ ] Uncheck some → Watch · count updates → tap → 2s loading reel →
      Discovery in remix mode.
- [ ] Back from Discovery → returns to Remix studio (not Home).
- [ ] Surprise Me → 2s loading "Rolling the dice…" → Discovery with
      10–15 random clips.
- [ ] Cancel on loading screen → returns to source phase, no nav.
- [ ] Save as Scrapbook (combine): pre-filled name "2024–2026 Mixtape"
      → tap Create → new scrapbook in library, navigate to its detail.
- [ ] Download button → "Coming soon" modal, dismiss works.

---

*Cross-references:* `00-brand-system.md` §7 (reels);
`02-interactions-glossary.md` §11 (sheets);
`screens/discovery.md` (the destination for remix mode);
`03-data-model.md` §2 (`film_fest_saves`), §7 (the CLIP_SELECT pattern).
