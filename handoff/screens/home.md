# screens/home.md — Home (Library)

> **What it is.** The IA backbone — the user's library of scrapbooks
> grouped by year and month, plus the inbox of scrapbooks shared with
> her. The first thing she sees on every launch.
>
> **Priority for native.** High. After Login, this is the first real
> screen. The current native Home is a flat list — to ship a credible
> v0.5, it needs at least the year-grouping, the FAB → Intake link,
> and the Shuffle → Remix link. The Shared tab can come later.

Route: `/` · File: `kasette/app/src/screens/HomeScreen.jsx` (1218 lines)
· Native counterpart (currently a flat list):
`kasette-native/screens/HomeScreen.tsx`

---

## 1. Purpose & user mental model

Mom opens the app. She sees:

- A warm header — random greeting + the app logo as the brand mark.
- Two tabs: "Your Scrapbooks" and "Shared".
- Under "Your Scrapbooks", a *vertical* list of year folders (newest at
  top). The current year is auto-expanded; other years are collapsed.
- Inside an expanded year: month-headings (e.g., "MARCH" in rust caps
  with a thin divider) and the scrapbook cards under each heading.
- Months that contain only one scrapbook still get their heading — the
  heading is just a label, not a folder.
- The "···" bucket (scrapbooks with no month) sorts last within its
  year.
- A `+` FAB bottom-right (only on Your Scrapbooks) to start a new
  scrapbook.
- Three icon buttons top-right (Shuffle / Search / Settings).

If she switches to Shared, she sees scrapbooks others have sent her,
with an amber dot on the tab if any are unread.

She uses one hand. She might pull down to refresh. She might tap the
three-dot icon on a card to rename / change cover / share / delete.
She'll *never* drag a card to reorder (no reorder gesture on Home).

---

## 2. Layout (top to bottom)

```
┌──────────────────────────────────────────────────┐
│                                                  │  ← safe-area top
│  🎞 Cassette       [⇄] [🔍] [⚙]                   │  ← logo + 3 icon buttons (each 40×40)
│  Hey there, Joelle                               │  ← greeting line (Fraunces italic, wheat/60, 15px)
├──────────────────────────────────────────────────┤
│  [Your Scrapbooks]  [Shared ●]                   │  ← tab bar; active = amber 2px underline; dot if unseen
├──────────────────────────────────────────────────┤
│           ▼ pull-to-refresh band (amber)          │  ← visible only while pulling
│                                                  │
│  YOUR SCRAPBOOKS                                 │  ← eyebrow caps, rust 10/2px tracking
│  12 moments saved                                │  ← Fraunces 30px; numeric amber, italic sienna
│                                                  │
│  ▾ 2026                  [✓]                     │  ← year header (chevron + year + close-year button OR closed-badge)
│      MARCH ──────────                            │  ← month heading (rust uppercase + divider)
│      ┌──────────────────────────────────────┐    │
│      │  [cover image, 148 px tall]   [⋯][▶] │    │
│      │  Beach Trip                          │    │  ← ScrapbookCard
│      │  March 2026         3 min 22 sec     │    │
│      └──────────────────────────────────────┘    │
│      JANUARY ──────                              │
│      ┌──────────────────────────────────────┐    │
│      ...                                         │
│  ▸ 2025  Dec · Aug · ···                         │  ← collapsed year (shows inline month preview)
│  ▸ 2024  ...                                     │
│                                                  │
│                                            ┌──┐  │
│                                            │+ │  │  ← FAB (56×56, amber, only on "yours")
│                                            └──┘  │
└──────────────────────────────────────────────────┘
```

### Measurements (verbatim from `HomeScreen.jsx`)

| Element | Position | Style |
|---|---|---|
| Top safe-area padding | header `paddingTop: 'max(3.5rem, calc(env(safe-area-inset-top) + 1rem))'` | RN: `paddingTop: insets.top + 16` |
| Header buttons | 40×40 rounded-full | rust glyph, walnut-mid bg, walnut-light border |
| Greeting line | Fraunces italic, 15 px, wheat/60 | `Hey there, {displayName}` (or random greeting) |
| Search input (when open) | `rounded-2xl px-4 py-3` | amber border on focus; walnut-mid bg |
| Tab bar | flex-shrink-0, two text buttons | "Your Scrapbooks" / "Shared" |
| Tab indicator | 2 px tall, rounded-full, amber | `absolute bottom-0 left-0 right-0` under active tab |
| Unread dot (Shared tab) | 8×8 px, amber, `-top-0.5 -right-2.5` | conditional on `hasUnseenShared` |
| Pull-to-refresh band | `height: refreshing ? 44 : pullY`, max 68, scaled by 0.5× | amber spinner inside |
| Section eyebrow | 10 px / 2 px tracking / rust / uppercase | "YOUR SCRAPBOOKS" |
| Section count title | Fraunces 30 px / lineHeight 34 | `12` amber Fraunces + ` moments saved` sienna italic |
| Year header row | flex justify-between, px-1 py-4 | chevron 20 px amber + year (Fraunces SemiBold 22 px, wheat) |
| Year inline preview | rust 12 px, `Jan · Mar · ···`, max-w-[50%] truncate | only when collapsed |
| Month heading | rust caps 11 px, letter-spacing 0.18em + thin divider line | NOT a button |
| Scrapbook card | full-width, rounded-[18px], walnut-mid bg, border walnut-light | 148 px cover + 14 px padded body |
| Card cover | 148 px tall, gradient if no cover_image_url | randomized from 6 brown-tinted gradients (see §6.4) |
| Card options button | 32×32 round, top-2 left-2 | frosted glass (blur 8), MoreHorizontal 15 px white |
| Card "clip count" pill | bottom-2 left-2, rounded-full, frosted | "{n} clips" 10 px |
| Card play badge | 36×36 amber circle, bottom-3.5 right-3.5 | Play 13 px filled walnut |
| Card title | Fraunces SemiBold 18 px wheat | leading-snug, mb-1 |
| Card subtitle | rust 11 px (left) + wheat/35 11 px duration (right) | flex justify-between |
| FAB | `absolute bottom-8 right-6`, 56×56 | amber, walnut Plus 24 px, shadow-lg |

### Native chrome wiring

The current native `HomeScreen.tsx` lets React Navigation render the
header — switch to a custom header inside the screen for the full
treatment. The `RefreshControl` already in place stays. The flat
`FlatList` becomes a sectioned `SectionList` (or a manually-rendered
ScrollView since the structure is non-uniform: year header → month
heading → cards, year header → month heading → cards…).

---

## 3. State machine

Top-level state variables (`HomeScreen.jsx:164–203`):

```ts
const [scrapbooks, setScrapbooks] = useState<Scrapbook[]>([])           // own
const [sharedScrapbooks, setSharedScrapbooks] = useState<ScrapbookShare[]>([])
const [outboundShareRows, setOutboundShareRows] = useState<...>([])     // I sent these
const [ownerNames, setOwnerNames] = useState<Record<string,string>>({}) // for Shared tab
const [recipientNames, setRecipientNames] = useState<Record<string,string>>({})
const [displayName, setDisplayName] = useState<string|null>(null)
const [closedYears, setClosedYears] = useState<Record<number, ClosedYear>>({})

const [loading, setLoading] = useState(true)
const [refreshing, setRefreshing] = useState(false)
const [pullY, setPullY] = useState(0)

const [activeTab, setActiveTab] = useState<'yours'|'shared'>('yours')
const [sharedView, setSharedView] = useState<'feed'|'byPerson'>('feed')
const [showSearch, setShowSearch] = useState(false)
const [searchQuery, setSearchQuery] = useState('')

const [collapsedYears, setCollapsedYears] = useState<Set<number>>(new Set())
const [collapsedOwners, setCollapsedOwners] = useState<Set<string>>(new Set())

// Card actions
const [optionsId, setOptionsId] = useState<string|null>(null)
const [renameId, setRenameId] = useState<string|null>(null)
const [renameDraft, setRenameDraft] = useState('')
const [renameYear, setRenameYear] = useState(new Date().getFullYear())
const [renameMonth, setRenameMonth] = useState<number|null>(null)
const [confirmDeleteId, setConfirmDeleteId] = useState<string|null>(null)
const [deleting, setDeleting] = useState(false)
const [sharedOptionsShareId, setSharedOptionsShareId] = useState<string|null>(null)

// Close-year
const [yearToClose, setYearToClose] = useState<number|null>(null)
const [closingYear, setClosingYear] = useState(false)
const [closeYearError, setCloseYearError] = useState<string|null>(null)

// Version modal
const [showVersion, setShowVersion] = useState(false)

// Refs
const mainRef = useRef<HTMLElement>(null)           // pull-to-refresh attach
const pullStartY = useRef<number|null>(null)
const searchInputRef = useRef<HTMLInputElement>(null)
const coverChangeInputRef = useRef<HTMLInputElement>(null)
const initDone = useRef(false)                       // gates one-shot current-year-expand
const randomGreeting = useRef(<picked once>).current
```

### Key derived state

```ts
const filteredScrapbooks = searchQuery.trim()
  ? scrapbooks.filter(sb => sb.name.toLowerCase().includes(searchQuery.toLowerCase()))
  : scrapbooks

// Grouped: { [year]: { [month]: scrapbook[] } }, month 0 = ungrouped bucket
const grouped = filteredScrapbooks.reduce((acc, sb) => {
  const y = sb.year ?? new Date(sb.created_at).getFullYear()
  const m = sb.month ?? 0
  ;(acc[y] ??= {})[m] ??= []
  acc[y][m].push(sb)
  return acc
}, {} as Record<number, Record<number, Scrapbook[]>>)

const years = Object.keys(grouped).map(Number).sort((a,b) => b - a)

function sortedMonthsForYear(y: number) {
  return Object.keys(grouped[y] ?? {}).map(Number).sort((a, b) => {
    if (a === 0) return 1
    if (b === 0) return -1
    return b - a              // newest month first
  })
}

const hasUnseenShared = sharedScrapbooks.some(s => !s.seen)
```

### The one-shot current-year-expand

Mom opens the app. Whatever years she has, the *current* year auto-
expands and every other year is collapsed. After her first interaction
with the year list, this behavior never runs again (so if she manually
collapses the current year, refreshing the screen doesn't re-expand it).

```ts
useEffect(() => {
  if (scrapbooks.length === 0 || initDone.current) return
  initDone.current = true
  const currentYear = new Date().getFullYear()
  const allYears = [...new Set(scrapbooks.map(sb => sb.year ?? new Date(sb.created_at).getFullYear()))]
  setCollapsedYears(new Set(allYears.filter(y => y !== currentYear)))
}, [scrapbooks])
```

**The `initDone` ref is critical** — don't drop it on the native port.
Without it, every refetch (e.g. after creating a scrapbook) would
re-collapse non-current years.

---

## 4. Data fetches

Four parallel-ish `useEffect`s on `session`:

1. **Profile display_name** — `from('profiles').select('display_name').eq('user_id', session.user.id).single()`
2. **Closed years** — `from('closed_years').select('id, year, cassette_scrapbook_id').eq('user_id', session.user.id)`
3. **Own scrapbooks** — see `03-data-model.md` §7. Nested `clips(id, video_url, duration, trim_in, trim_out, recorded_at)` so cards can show duration without a second query.
4. **Shared scrapbooks (inbound)** — `from('scrapbook_shares').select('id, seen, owner_id, scrapbooks(*, clips(id, video_url, duration, trim_in, trim_out, recorded_at))').eq('shared_with_id', user.id)`, then **second** query to enrich with profile display_names by owner_id.
5. **Outbound shares** — symmetric to inbound; for showing "you shared this with X, Y" on cards in the Your Scrapbooks tab. (Actually the PWA renders this on a per-card subtitle when the user has shared a scrapbook out.)

Pull-to-refresh runs only (3) — see `02-interactions-glossary.md` §9.

---

## 5. Every interaction

### 5.1 Pull-to-refresh

Already covered in `02-interactions-glossary.md` §9. The PWA does it
manually with touch handlers; **native uses `RefreshControl`** which the
current code already wires up correctly.

### 5.2 Tab switch (yours / shared)

Tap "Your Scrapbooks" or "Shared" → `setActiveTab('yours'|'shared')`. The
amber 2 px underline moves under the active label (no animation in PWA;
in native a 200 ms position tween reads nicely but is optional).

When switching to Shared, the `sharedView` defaults to `'feed'`. Inside
Shared, a small toggle lets the user switch to `'byPerson'` (collapsible
owner folders). On view-switch, all owner folders start expanded
(`setCollapsedOwners(new Set())`).

### 5.3 Search

Tap search icon → `setShowSearch(true)` → 100 ms later, input is
focused. Typing filters own scrapbooks by `name` (case-insensitive,
substring). Pressing X closes search and clears the query.

### 5.4 Year expand / collapse

Tap year row → `toggleYear(year)` adds-or-removes from
`collapsedYears` Set. Chevron rotates via `transform: rotate(-90deg)`
when collapsed. Animation duration 0.15 s in PWA — `Easing.bezier(0.4,
0, 0.2, 1)`.

When collapsed:
- Inline preview to the right of the year shows the months in that
  year, separated by `·`: `Jan · Mar · ···`. The `···` represents the
  ungrouped bucket (month=0) and is always last.
- Source: see `HomeScreen.jsx:325–331` for `sortedMonthsForYear`.

### 5.5 Close year (annual cassette)

When a year is *not* closed and is expanded, a Check icon button
appears at the right of the year header. Tap it → modal opens:

> Close 2026?
> 4 scrapbooks · 87 clips
> ...

Two actions (verbatim):

- **"Create 2026 Cassette"** (amber CTA) — creates a new scrapbook
  named "2026 Cassette", flattens all year's clips into it (chronologically:
  Jan→Dec, then ungrouped, then by clip order within each scrapbook),
  inserts a `closed_years` row, navigates to the new cassette.
- **"Just close the year"** (text button) — inserts the `closed_years`
  row without creating anything.

After close: a green-ish check badge shows in place of the close button.
If a cassette was created, there's also a link to it.

See `HomeScreen.jsx:438–540` for the full implementation, including the
chronological clip-sort logic. The unique-`(scrapbook_id, "order")`
constraint matters here — clips are inserted with `order: 0, 1, 2, …`
in the sorted sequence.

### 5.6 Card tap

Own scrapbook → `navigate('/scrapbook/' + sb.id)` → ScrapbookDetail.

Shared scrapbook → `handleSharedCardTap(share)`:
- If `!share.seen`, optimistically mark seen, update `scrapbook_shares` row.
- Then navigate to `/scrapbook/` + share.scrapbooks.id.

### 5.7 Card options menu (three-dot)

Tap the small three-dot button at top-left of the card cover → opens a
bottom sheet with four items:

- **Change Cover** — opens a hidden file input; on selection, resize to
  800 px max, JPEG 85% quality, upload to R2 at `{userId}/covers/{sbId}.jpg`,
  update DB. Optimistic preview via FileReader.
- **Rename & Redate** — opens a *separate* bottom sheet (form with name
  + year + month).
- **Share** — navigates to `/scrapbook/{id}/share`.
- **Delete** — opens delete-confirmation sheet.

For shared scrapbooks, the only option is **Remove from Library** —
deletes the `scrapbook_shares` row only.

### 5.8 Rename & Redate sheet

Form fields:
- Name (text input, autoFocus, maxLength 60, Enter → save)
- Year (PickerDropdown — 2015 to current year)
- Month (PickerDropdown — null/"···" then 1–12)

Save button disabled if name is empty. On Save: optimistic local update
then `from('scrapbooks').update({ name, year, month }).eq('id', renameId)`.

### 5.9 Delete confirmation

Modal sheet. Shows scrapbook name, copy "This will permanently delete…".

- **Delete** button (sienna): sets `deleting=true`, calls
  `safeDeleteClipFiles(target.clips)` to delete R2 files, then deletes
  all clip rows, then the scrapbook row. State is updated optimistically
  before the awaits.
- **Cancel**: closes sheet.

### 5.10 FAB → Intake

Tap → `navigate('/intake')` → IntakeScreen (new scrapbook flow). FAB is
visible only on the "yours" tab.

### 5.11 Shuffle → Remix

Top-right Shuffle icon → `navigate('/remix')` → RemixScreen (Film Fest
filter studio).

### 5.12 Settings → Settings

Top-right Settings icon → `navigate('/settings')`.

### 5.13 Outbound-share badge on own cards

If a scrapbook has been shared out, the card subtitle line includes
that info (e.g. "Shared with Joelle, Mike"). The PWA computes this from
the outbound shares query and renders inside the existing card subtitle
slot. (Detail per-card not exhaustively documented in source extract —
read `HomeScreen.jsx:340–360` for the grouping logic if you reproduce
this in native.)

---

## 6. Animations & micro-feel

### 6.1 Pull-to-refresh

See `02-interactions-glossary.md` §9. Native uses `RefreshControl`.

### 6.2 Year chevron

`transform: rotate(-90deg)` when collapsed, 0deg when expanded. 0.15 s
ease (Reanimated: `Easing.bezier(0.4, 0, 0.2, 1)`).

### 6.3 Card press

`active:scale-[0.98] transition-transform`. Already in native via
`Pressable`'s `{ pressed }` style callback. See
`02-interactions-glossary.md` §10.

### 6.4 Cover gradients

When `cover_image_url` is null, the card cover uses one of six
deterministic gradients picked by `hash(scrapbook.id) % 6`:

```js
const CARD_GRADIENTS = [
  'linear-gradient(135deg, #6B2D0E 0%, #3D1A0A 40%, #8B3A18 100%)',
  'linear-gradient(135deg, #1A3A2E 0%, #0E2218 40%, #2A5040 100%)',
  'linear-gradient(135deg, #3A2A0E 0%, #6B4A18 60%, #2C1A0E 100%)',
  'linear-gradient(135deg, #4A1A2A 0%, #2C0E18 40%, #6B2A3A 100%)',
  'linear-gradient(135deg, #1A2A3A 0%, #0E1A28 60%, #2A3A50 100%)',
  'linear-gradient(135deg, #3A1A10 0%, #6B2A18 60%, #2C1008 100%)',
]
function hashId(id) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (Math.imul(31, h) + id.charCodeAt(i)) | 0
  return Math.abs(h)
}
```

Native: port both verbatim. Use `expo-linear-gradient`'s `colors` array
with the three stops. Different scrapbook IDs hash to different
gradients consistently (the user sees the same gradient every time for
a given scrapbook — a tiny but loved cue).

### 6.5 Modal entries

Bottom sheets slide up from the bottom. PWA uses no animation
(snaps into place). In native, use a 300 ms Gentle Enter tween via
`@gorhom/bottom-sheet` or hand-rolled `Animated.View`.

### 6.6 Tab indicator

Underline moves under the active tab. PWA doesn't animate this — it
just instantly switches. Native: optional 200 ms ease.

---

## 7. Empty / loading / error states

### Initial load

While `loading = true` and `scrapbooks.length === 0`:

PWA: shows a spinner centered in the main area. **Native should use
the cassette reel** (see brand doc §7).

### Empty library (no own scrapbooks)

Centered empty state. Verbatim PWA copy (paraphrased — confirm exact
text in source `HomeScreen.jsx:660–700`):

> Your first scrapbook is waiting.
> *Grab a batch of videos and let's turn them into something.*

With an amber "Create Scrapbook" CTA that navigates to Intake.

### Search empty

When `searchQuery.trim()` returns no matches: small rust text below the
search bar — "No scrapbooks match that name."

### Shared tab empty

> No one has shared anything with you yet.
> *Family members can text you their Cassette URLs.*

### Pull-to-refresh failure

If the refresh fetch fails, the spinner just stops; no toast. Mom won't
notice; the library still shows the previous data. Native: same.

### Cover upload failure

Already covered in §5.7. Optimistic preview reverts to previous cover
on R2 failure; no toast.

---

## 8. Known gotchas & "why it works"

- **The `initDone` ref** (§3) — without it, refreshing or creating a
  scrapbook re-collapses non-current years. This is the source of more
  bug reports than any other line in the file.
- **Month = `null` becomes `month = 0` in the grouped data structure**
  — *only inside `grouped`*. In the DB it's still NULL. Don't write `0`
  back; the `month: renameMonth ?? null` pattern in `handleRename`
  preserves NULL.
- **Card click vs. options-button click** — the card is a `<button>`
  with nested options `<button>`. PWA uses `e.stopPropagation()` on the
  options handler. Native: `Pressable` doesn't bubble through to
  parent `Pressable` if hit-testing finds a child — but if you nest a
  `Pressable` inside a `Pressable`, the inner one's `onPress` fires
  and the outer's doesn't, so no stopPropagation needed. Test on real
  device.
- **Cover URL cache bust** — after re-upload, the public URL is the
  same, but appending `?v={Date.now()}` forces browser/native image
  cache to re-fetch. Native: `expo-image` and `<Image>` honor query-
  string cache differentiation; keep the pattern.
- **Random greeting per render** — the greeting is picked *once per
  render of HomeScreen*. If the user navigates away and back, she gets
  a fresh greeting. PWA uses `useRef(...).current` so each mount gets
  one value. Native: same.
- **Card subtitle layout** — outbound share info lives in the subtitle
  area. If both date and share info fit, both render. If not, the
  share info wins (or both truncate). Source has the exact logic; copy
  verbatim.
- **The Shared tab needs profiles** — the `display_name` come from a
  second query. If that query fails, the cards show "Someone" as the
  owner. Don't break the UI on profile fetch failure.

---

## 9. Native translation notes

### Recommended stack for Home

- **`RefreshControl`** — already wired up; tint amber.
- **No `FlatList`** for the body — the structure is non-uniform (year
  header → variable number of month-headings → variable number of
  cards). Use a `ScrollView` with mapped children, or `SectionList` if
  you want each year as a section.
- **`expo-image-picker`** for "Change Cover" — use
  `launchImageLibraryAsync({ mediaTypes: 'Images' })`. Resize via
  `expo-image-manipulator`'s `manipulateAsync` with
  `{ resize: { width: 800 } }`, output `jpeg` 0.85 quality.
- **`expo-linear-gradient`** — already in `package.json` and already
  used in the current native Home.
- **`@gorhom/bottom-sheet`** for the options menu and rename / delete
  / close-year sheets. One `<BottomSheet>` per concern is fine; lazy
  mount.
- **`lucide-react-native`** for the icon glyphs (Plus, Search, Shuffle,
  Settings, MoreHorizontal, ChevronDown, Pencil, Trash2, Check, Share2,
  Image). Set `strokeWidth={1.75}`.

### Rendering the year/month tree (sketch)

```tsx
<ScrollView refreshControl={...}>
  <SectionHead />
  {years.map(year => {
    const isCollapsed = collapsedYears.has(year)
    const closedRow = closedYears[year]
    return (
      <View key={year}>
        <YearHeader
          year={year}
          collapsed={isCollapsed}
          monthPreview={isCollapsed ? sortedMonthsForYear(year).map(m => m === 0 ? '···' : MONTH_SHORT[m-1]).join(' · ') : null}
          closed={!!closedRow}
          onToggle={() => toggleYear(year)}
          onClose={() => setYearToClose(year)}
        />
        {!isCollapsed && sortedMonthsForYear(year).map(month => (
          <View key={month}>
            <MonthHeading label={month === 0 ? '···' : MONTH_NAMES[month-1].toUpperCase()} />
            {grouped[year][month].map(sb => (
              <ScrapbookCard
                key={sb.id}
                scrapbook={sb}
                onPress={() => navigation.navigate('ScrapbookDetail', { scrapbookId: sb.id })}
                onOptionsPress={() => setOptionsId(sb.id)}
              />
            ))}
          </View>
        ))}
      </View>
    )
  })}
</ScrollView>
```

### Native divergence: handling the cover upload

PWA uses a hidden `<input type="file">` triggered by a click — that's
not how RN works. Native flow:

```ts
async function pickCover(sbId: string) {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: false,
    quality: 1,
  })
  if (result.canceled || !result.assets[0]) return

  const asset = result.assets[0]
  // Optimistic preview
  setScrapbooks(prev => prev.map(sb =>
    sb.id === sbId ? { ...sb, cover_image_url: asset.uri } : sb))

  const resized = await ImageManipulator.manipulateAsync(
    asset.uri,
    [{ resize: { width: 800 } }],
    { compress: 0.85, format: 'jpeg' }
  )

  const key = `${session.user.id}/covers/${sbId}.jpg`
  try {
    const publicUrl = await uploadToR2(key, resized.uri, 'image/jpeg')
    const bustUrl = `${publicUrl}?v=${Date.now()}`
    await supabase.from('scrapbooks').update({ cover_image_url: bustUrl }).eq('id', sbId)
    setScrapbooks(prev => prev.map(sb =>
      sb.id === sbId ? { ...sb, cover_image_url: bustUrl } : sb))
  } catch {
    setScrapbooks(prev => prev.map(sb =>
      sb.id === sbId ? { ...sb, cover_image_url: previousCover } : sb))
  }
}
```

`uploadToR2` is the native version specced in `03-data-model.md` §6.

### Native divergence: section header sticky

The PWA section header ("YOUR SCRAPBOOKS · 12 moments saved") is *not*
sticky. Native should match — don't pull the standard
`stickyHeaderIndices` trick on `ScrollView`. The whole thing scrolls.

### Performance considerations

- A user with 50+ scrapbooks isn't unreasonable. The current native
  flat `FlatList` would handle it; the proposed `ScrollView` of mapped
  cards might lag. If the user has many scrapbooks, switch to
  `FlatList` with `renderItem` rendering one "year section" each, and
  let RN virtualize.
- Cover images: use `expo-image` for built-in caching + placeholder.
  Already lazy-loads on the FlatList.

### Subcomponents to extract

- `<ScrapbookCard>` — port from PWA (`HomeScreen.jsx:68–123`), uses
  `LinearGradient` if no cover.
- `<PickerDropdown>` — port from PWA (`HomeScreen.jsx:125–162`).
  Shared with Intake and ScrapbookDetail rename sheet.
- `<YearHeader>`, `<MonthHeading>` — small layout components.

### What to defer

Per `NEXT-SESSION.md`, MVP scope is Login + Home + Playback (watch one).
For native v0.5:

- **In scope:** Year/month grouping, current-year auto-expand, FAB,
  Shuffle nav, Settings nav, card → ScrapbookDetail, RefreshControl
  with amber tint.
- **Out of scope (Day 2+):** Shared tab, options menu (cover / rename /
  delete), close-year flow, Search, outbound-share rendering on own
  cards.

The user can still rename / change cover / delete from Settings or the
web — keep the Home-screen options menu as polish, not a blocker.

---

## 10. Test plan when this screen ships

- [ ] Open with cache empty → cassette reel spinner; populates within
      ~400 ms (one round trip).
- [ ] Three years of scrapbooks → current year expanded, others
      collapsed. Tap a collapsed year → expands. Tap current year →
      collapses. Re-fetch (pull to refresh) → does not re-expand
      current year.
- [ ] Ungrouped (`month=NULL`) scrapbook → appears under "···" heading,
      always at bottom of its year.
- [ ] Tap card → navigates to ScrapbookDetail. Back arrow → returns to
      Home with scroll position preserved.
- [ ] Tap FAB → Intake. Back from Intake (no save) → Home.
- [ ] Pull down → amber RefreshControl spinner. Release before
      threshold → no refresh. Release after → fetches.
- [ ] Cover gradient: same scrapbook always gets the same gradient
      across re-mounts (hash determinism).
- [ ] Switch to Shared tab → amber dot disappears once all are seen.
- [ ] Long pages (50+ scrapbooks) scroll without jank.

---

*Cross-references:* `00-brand-system.md` §1–§3 for colors / spacing /
typography, `02-interactions-glossary.md` §9 for pull-to-refresh, §11
for bottom sheets, §17 for optimistic-update-with-revert pattern,
`03-data-model.md` §2 for `closed_years` / `scrapbook_shares`,
§7 for query shapes.
