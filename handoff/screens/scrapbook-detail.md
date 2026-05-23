# screens/scrapbook-detail.md — Scrapbook Detail

> **What it is.** The hub for a single scrapbook. The user lands here
> from Home → tap card. Three primary actions: Watch, Edit, Share.
> Cover-photo hero on top; meta below; secondary actions (rename,
> change cover, export, delete) further down.
>
> **Priority for native.** Medium-to-high. After Home and Playback,
> this is the third screen mom touches in a typical session. Cheap to
> port because it has no novel gestures — just buttons and one bottom
> sheet.

Route: `/scrapbook/:id` · File:
`kasette/app/src/screens/ScrapbookDetailScreen.jsx` (538 lines) · Native:
not yet ported (skipped in current MVP — the native Home goes directly
to Playback).

---

## 1. Purpose & user mental model

She tapped a scrapbook card. She wants:

1. To watch it.
2. Maybe to edit it (add a caption, trim a clip).
3. Maybe to share it.

The screen is one tall column on a 100dvh canvas: a big cover hero,
then a column of action buttons. Watch is the dominant CTA (full-width
amber). Edit / Share / Export are a secondary row of three smaller
buttons. Below that, in a settings-style group, are Rename & Redate
and Change Cover. At the bottom is Delete.

For shared scrapbooks (`!isOwner`), only the cover, the metadata, and
the Watch button render. Edit / Share / Export / settings / delete are
all hidden.

She tap-taps. The screen barely needs gestures.

---

## 2. Layout (top to bottom)

```
┌──────────────────────────────────────────────────┐
│  [← Library]                                     │  ← absolute top-12 left-4
│                                                  │
│         [cover image, ~42% of screen height]     │  ← hero
│                                                  │
│  2026 Cassette                                   │  ← Fraunces 28px bold, wheat
│  2026 · 87 clips · 17 min                        │  ← rust 12px (with ● uploading dot if active)
├──────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────┐  │
│  │           ▶  Watch                         │  │  ← full-width amber CTA, py-4
│  └────────────────────────────────────────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │  ✏  Edit │ │  ↗  Share│ │  ⬇  Export│         │  ← 3 buttons in a row
│  └──────────┘ └──────────┘ └──────────┘          │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  ✏  Rename & Redate                       ›  │  │
│  │  ────────────────────────────────────────  │  │
│  │  🖼  Change Cover Photo                   ›  │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  🗑  Delete Scrapbook                       │  │  ← sienna text, bordered
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

### Measurements (from `ScrapbookDetailScreen.jsx`)

| Element | Position / size | Style |
|---|---|---|
| Container | `flex flex-col bg-walnut`, `h-100dvh` | use `flex: 1` + safe-area in RN |
| Hero zone | 42% of screen height, `flex-shrink-0` | overlay gradient on cover |
| Back button | `absolute top-12 left-4` | arrow + "Library" text (sans semibold 13 px) |
| Hero gradient | `linear-gradient(180deg, rgba(44,26,14,0.3) 0%, rgba(44,26,14,0.0) 30%, rgba(44,26,14,0.85) 100%)` | over the cover |
| Title | Fraunces SemiBold 28 px, wheat | `absolute bottom-5 left-5 right-5` |
| Subtitle/meta | rust 12 px | year · clip count · duration · upload indicator |
| Actions container | `flex-1 overflow-y-auto`, vertical column | px-4 |
| Watch button | full-width amber, py-4, mb-3 | Fraunces 16 px walnut bold "Watch" with Play icon |
| Edit/Share/Export row | flex row of 3 buttons, gap-2 | each flex-1, py-3.5, gap-1.5 icon+label, border + walnut-mid bg |
| Settings card | rounded-2xl bg-walnut-mid, border walnut-light | contains 2 rows |
| Settings row | py-3.5 px-4, border-b walnut-light (except last) | icon + label + chevron right |
| Delete button | px-4 py-3.5, sienna icon + text, bordered | full width, mt-4 |
| Launching overlay | full viewport, z-50 | cassette reels + text |
| Export overlay | full viewport, z-50 | progress bar + phase label |
| Rename sheet | bottom sheet, z-50 + backdrop z-40 | walnut-mid, rounded-t-3xl |
| Delete sheet | bottom sheet, same structure | walnut-mid, sienna CTA |

The Watch CTA must be **the** dominant visual on the screen — full width,
amber, py-4. The Edit/Share/Export row is intentionally smaller and
darker so it doesn't compete.

---

## 3. State machine

```ts
const [scrapbook, setScrapbook] = useState<Scrapbook|null>(null)
const [clips, setClips] = useState<Clip[]>([])
const [loading, setLoading] = useState(true)

// Rename
const [renaming, setRenaming] = useState(false)
const [renameDraft, setRenameDraft] = useState('')
const [renameYear, setRenameYear] = useState(new Date().getFullYear())
const [renameMonth, setRenameMonth] = useState<number|null>(null)

// Delete
const [confirmDelete, setConfirmDelete] = useState(false)
const [deleting, setDeleting] = useState(false)

// Export
const [exportState, setExportState] = useState<…|null>(null)
const [exportBlob, setExportBlob] = useState<Blob|null>(null)

// Launch (Watch button)
const [isLaunching, setIsLaunching] = useState(false)

// Upload context (background upload progress in hero)
const { isActive, completedClips, totalClips, scrapbookId: uploadingId } = useUpload()

// Refs
const coverInputRef = useRef<HTMLInputElement>(null)
```

### Derived

```ts
const isOwner = session?.user?.id === scrapbook?.user_id
const totalDuration = clips.reduce((sum, c) =>
  sum + ((c.trim_out ?? c.duration ?? 0) - (c.trim_in ?? 0)), 0)
const showUploadingDot = isActive && uploadingId === scrapbook?.id
```

---

## 4. Data fetches

Parallel on mount:

```ts
Promise.all([
  supabase.from('scrapbooks').select('*').eq('id', id).single(),
  supabase.from('clips')
    .select('id, video_url, thumbnail_url, duration, trim_in, trim_out, caption_text, caption_x, caption_y, caption_size, order, recorded_at')
    .eq('scrapbook_id', id)
    .order('order', { ascending: true }),
]).then(([{ data: sb }, { data: cl }]) => {
  if (sb && cl) {
    setScrapbook(sb)
    setClips(cl)
    cacheScrapbook(id, sb, cl)        // populate dataCache for Playback / Workspace
    preloadClips(cl, 2).then(() => preloadRest(cl, 2))   // warm first 2 blobs, then rest
  }
  setLoading(false)
})
```

**The data-cache population is important.** PlaybackScreen and
WorkspaceScreen both check `getCached(id)` first; landing on either
from Detail means they render instantly (no spinner).

The Detail screen also schedules `preloadClips(cl, 2)` (blocking on
first two) and `preloadRest(cl, 2)` (fire-and-forget for the rest) so
that hitting Watch is fast. **In native**, this blob-cache pattern is
optional — see `03-data-model.md` §8. Skip it for v1 and let
`expo-video`'s HTTP cache do the work.

---

## 5. Every interaction

### 5.1 Back arrow

Top-left "← Library" → `navigate('/')` → Home.

Native: `navigation.goBack()`.

### 5.2 Watch CTA

Tap → `handleWatch()`:

```ts
async function handleWatch() {
  setIsLaunching(true)
  const minDelay = new Promise(r => setTimeout(r, 2000))
  const firstReady = preloadClips(clips, 1)      // blocks on first blob
  preloadRest(clips, 1)                          // non-blocking
  await Promise.all([minDelay, firstReady])
  navigate(`/scrapbook/${id}/watch`)
}
```

The min-2s delay is intentional — it shows the cassette-reel launching
animation as branded experience ("crafting your experience…"). It is
*not* there because the data needs that long; it's branded loading
theater. Match it in native.

### 5.3 Edit / Share / Export buttons (owner only)

- **Edit** → `navigate('/scrapbook/' + id + '/edit')` → Workspace.
- **Share** → `navigate('/scrapbook/' + id + '/share')` → Share.
- **Export** → fires `handleExport()`:

  ```ts
  async function handleExport() {
    setExportState({ phase: 'fetching', current: 1, total: clips.length })
    try {
      const blob = await exportScrapbook(clips, (progress) => setExportState(progress))
      setExportBlob(blob)
      setExportState('done')
    } catch (e) {
      setExportState({ error: e.message })
    }
  }
  ```

  The full-screen overlay shows phase labels ("Fetching clip 3 of 12…",
  "Trimming clip 7 of 12…", "Stitching your scrapbook…", "Done!"). On
  done: a Save/Share button that uses Web Share API
  (`navigator.share({ files: […] })`) or falls back to download link.

**Native divergence:** Export is the same question as on Playback — see
`screens/playback.md` §9 "Export — the big native divergence". For v0.1
on this screen too, the Export button should either be hidden or open
a "Coming soon" sheet.

### 5.4 Rename & Redate

Tap row in settings card → opens bottom sheet. Form fields:

- Name (text input, autoFocus, maxLength 60, Enter → save)
- Year (PickerDropdown — 2015 to current year)
- Month (PickerDropdown — "···" / null + 12 months)

Save (disabled if `!renameDraft.trim()`) → optimistic local update +
`from('scrapbooks').update({ name, year, month }).eq('id', id)`.

The `<PickerDropdown>` is the same component as Home's — port once,
reuse.

### 5.5 Change Cover Photo

Tap row in settings card → opens hidden file input → on selection:

```ts
async function handleCoverChange(e) {
  const file = e.target.files?.[0]
  // optimistic preview via FileReader
  // resize to 800px max, JPEG 85%
  // upload to R2 at `${userId}/covers/${sbId}.jpg`
  // bust URL with `?v=${Date.now()}`
  // update DB
  // update state with bustUrl
}
```

Native: use `expo-image-picker` + `expo-image-manipulator`. See
`screens/home.md` §9 "Native divergence: handling the cover upload" —
same pattern.

### 5.6 Delete Scrapbook

Tap bottom Delete button → opens delete-confirmation sheet. Sheet copy:

> Delete {scrapbook.name}?
> This will permanently delete the scrapbook and all clips. This action
> cannot be undone.

Two buttons: **Delete** (sienna) and **Cancel** (rust). Tap Delete:

```ts
async function handleDelete() {
  setDeleting(true)
  await safeDeleteClipFiles(clips)
  await supabase.from('clips').delete().eq('scrapbook_id', id)
  await supabase.from('scrapbooks').delete().eq('id', id)
  navigate('/', { replace: true })
}
```

`{ replace: true }` is important — back navigation from Home shouldn't
return to a 404 detail page. Native: `navigation.reset({ index: 0,
routes: [{ name: 'Home' }] })`.

### 5.7 Action sheet (Export progress)

Full-screen overlay (z-50) with cassette reels + phase label + progress
bar (filling). When phase transitions to `'done'`, a Save/Share button
appears + a "Done" link. Done dismisses the overlay (clears
`exportState` and `exportBlob`).

On error: sienna heading "Export failed", rust subtext, mono-font error
line with `error.message`, "Dismiss" link.

---

## 6. Animations & micro-feel

### 6.1 Launching overlay (Watch tap)

Two cassette reels (asymmetric: forward 2.1s, reverse 1.7s) separated by
sienna connector lines. Title "crafting your experience…" (Fraunces
italic 22 px amber). Subtitle "just a moment" (rust 13 px).

The 2-second min delay is *the brand moment* — don't shorten it on
native. The wait is intentional: it gives Watch a sense of import.

### 6.2 Export progress bar

1 px tall, full width, walnut-light track, amber fill.
- Fetching / trimming phases: width = `((current - 1) / total) * 90%`
- Stitching phase: width = `100%` (final jump)
- Transition: 500 ms `transition: all` (so the bar visibly slides between
  phases).

### 6.3 Watch button press

Standard `active:scale-[0.98]` + amber stays amber. See
`02-interactions-glossary.md` §10.

### 6.4 Sheets

Bottom sheets (rename, delete) slide up over backdrop. PWA doesn't
animate the slide; native should add a 300 ms Gentle Enter for polish.

---

## 7. Empty / loading / error states

### Loading

`flex flex-col bg-walnut`, full screen. PWA: small amber spinner
centered. **Native: cassette reel.**

### Empty (clips = 0)

The hero shows the cover (or gradient placeholder). Subtitle says
"0 clips". Watch is disabled (gray-out or hide?). PWA actually keeps
the Watch button enabled — tapping leads to Playback's own "No clips
in this scrapbook" empty state. Both are acceptable; in native, prefer
disabling Watch when `clips.length === 0` for clarity.

The Edit button is still shown (so the user can add clips via the
"Add Clips" tool in Workspace).

### Fetch failure

Not handled explicitly in PWA — `loading` would hang true. **Native
should fix**: if the parallel fetch rejects, render an error state with
a retry button.

### Cover upload failure

Optimistic preview reverts. No toast.

---

## 8. Known gotchas & "why it works"

- **`dataCache` priming** — without it, navigating to Workspace or
  Playback re-fetches the same data the Detail screen just got. Don't
  drop this on native.
- **The 2-second min Watch delay is brand, not data.** It's intentional
  loading theater for the most important navigation in the app. Match
  it exactly.
- **Owner-only buttons** (Edit / Share / Export / Rename / Cover /
  Delete) — `isOwner = session.user.id === scrapbook.user_id`. RLS
  would block writes anyway, but rendering the buttons would be
  confusing UX. Hide them.
- **`navigate('/', { replace: true })` after delete** — preserve in
  native via `navigation.reset(...)`. Tapping back after delete must
  not return to the deleted scrapbook.
- **Cover URL cache bust** — append `?v={Date.now()}` after a successful
  upload so the in-memory image cache re-fetches. `expo-image` honors
  query params for cache differentiation.

---

## 9. Native translation notes

### Recommended stack for this screen

- **`expo-image`** for the cover (better caching, fade-in).
- **`expo-linear-gradient`** for the hero overlay.
- **`expo-image-picker`** + **`expo-image-manipulator`** for cover change.
- **`@gorhom/bottom-sheet`** for rename / delete sheets.
- **`react-native-safe-area-context`** for safe-area handling.
- **`lucide-react-native`** for the icons (Play, Edit, Share2, Download,
  Pencil, Image, Trash2, ArrowLeft, ChevronRight).

### Hero with safe-area-aware back button

```tsx
const insets = useSafeAreaInsets()

<View style={styles.hero}>
  <ExpoImage source={{ uri: scrapbook.cover_image_url }} style={styles.cover} />
  <LinearGradient
    colors={['rgba(44,26,14,0.3)', 'rgba(44,26,14,0)', 'rgba(44,26,14,0.85)']}
    locations={[0, 0.3, 1]}
    style={StyleSheet.absoluteFill}
  />
  <Pressable
    onPress={() => navigation.goBack()}
    hitSlop={12}
    style={[styles.backBtn, { top: insets.top + 8 }]}
  >
    <ArrowLeft size={16} strokeWidth={1.75} color={colors.wheat} />
    <Text style={styles.backBtnLabel}>Library</Text>
  </Pressable>
  <View style={styles.heroBottom}>
    <Text style={styles.title}>{scrapbook.name}</Text>
    <Text style={styles.subtitle}>
      {scrapbook.year} · {clips.length} clips · {formatDuration(totalDuration)}
      {showUploadingDot && '  ●  Uploading…'}
    </Text>
  </View>
</View>
```

### Watch flow with launching overlay

```tsx
async function handleWatch() {
  setIsLaunching(true)
  await Promise.all([
    new Promise(r => setTimeout(r, 2000)),
    // optionally: prefetch first clip if doing blob cache, otherwise no-op
  ])
  setIsLaunching(false)
  navigation.navigate('Playback', { scrapbookId: id, scrapbookName: scrapbook.name })
}
```

`<LaunchingOverlay />` is its own component — two cassette reels + the
"crafting your experience…" / "just a moment" copy. Brand-doc §7 has
the reel SVG.

### Settings rows pattern

```tsx
<View style={styles.settingsCard}>
  <SettingsRow icon={Pencil} label="Rename & Redate" onPress={() => setRenaming(true)} />
  <View style={styles.divider} />
  <SettingsRow icon={Image} label="Change Cover Photo" onPress={pickCover} />
</View>
```

`<SettingsRow>` is a small flex row with icon (16 px amber) + label
(wheat 15 px) + chevron-right (12 px rust).

### Native divergence: Export menu item

For v0.1 / v0.5 native, do one of:

- Hide the Export button entirely.
- Show it; tap → "Coming soon" full-screen modal (use Remix's existing
  "Coming soon" modal as a template — see `screens/remix-film-fest.md`
  §6).

Either is acceptable. Recommend showing with "Coming soon" — it sets
expectation that this feature is on the roadmap.

### What to defer

For native v0.5:

- **In scope:** Cover hero, Watch CTA + launching overlay, Edit nav,
  Share nav, Rename sheet, Delete sheet.
- **Out of scope (Day N):** Export overlay (defer per `screens/playback.md` §9),
  cover-change picker (the user can change cover from the web for now).

---

## 10. Test plan when this screen ships

- [ ] From Home → tap card → Detail renders instantly (cache hit) or
      with reel spinner (cold).
- [ ] Owner sees Edit/Share/Export/Rename/Cover/Delete. Non-owner
      (shared scrapbook) sees only Watch.
- [ ] Watch button → 2-second branded launch screen → Playback opens.
      Back from Playback returns to Detail with state preserved.
- [ ] Edit button → Workspace renders instantly (cache hit).
- [ ] Share button → Share screen opens.
- [ ] Rename → optimistic update on Detail header, persists to DB.
- [ ] Delete → 2 confirmations (sheet then button), navigates to Home
      with the scrapbook gone, back-swipe doesn't return to Detail.
- [ ] Cover change (when implemented) → optimistic preview, upload,
      cache-bust URL persists.
- [ ] Upload-in-progress indicator: while a background upload is
      running for this scrapbook, the subtitle shows the amber dot and
      "Uploading N clips…" suffix.

---

*Cross-references:* `00-brand-system.md` §1, §7 (reel); `02-interactions-glossary.md`
§10 (tap feedback), §11 (sheets), §17 (optimistic + revert);
`03-data-model.md` §7 (the query that primes dataCache);
`screens/playback.md` (where Watch goes, and the export divergence).
