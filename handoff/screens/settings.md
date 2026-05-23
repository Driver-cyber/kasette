# screens/settings.md — Settings

> **What it is.** Auto-share defaults + the "Surprise Me: include
> shared clips" toggle + (eventually) account / sign-out.
>
> **Priority for native.** Low. Sign-out can live on Home (as the
> current native code does) until proper Settings ships.

Route: `/settings` · File:
`kasette/app/src/screens/SettingsScreen.jsx` (448 lines) · Native: not
yet ported.

---

## 1. Purpose & user mental model

She tapped Settings from Home's top-right gear icon. She:

- Sees a list of people she auto-shares all new scrapbooks with.
- Removes anyone from that list (with a "future shares only" vs "all
  access" toggle in the confirmation).
- Adds a new auto-share recipient by username.
- Toggles whether Surprise Me draws from shared clips too.
- (Could) sign out — but the current PWA has sign-out elsewhere or
  via a separate hidden affordance. The native MVP currently has
  Sign Out on Home's top-right; keep that for v0.5.

This is the second mom uses it screen — once at setup ("auto-share
everything with my wife"), then almost never.

---

## 2. Layout

```
┌──────────────────────────────────────────────────┐
│  [←]   Settings                                  │
├──────────────────────────────────────────────────┤
│                                                  │
│  AUTO-SHARE NEW SCRAPBOOKS                       │
│  Anyone listed here will automatically           │
│  receive access when you create a new scrapbook. │
│  ┌────────────────────────────────────────────┐  │
│  │ [J] Joelle                              [×]│  │
│  │ ───────────────────────────────────────────│  │
│  │ [M] Mike                                [×]│  │
│  └────────────────────────────────────────────┘  │
│  To share a single scrapbook, use the ⋯          │
│  menu inside that scrapbook.                     │
│                                                  │
│  SURPRISE ME                                     │
│  ┌────────────────────────────────────────────┐  │
│  │  Include shared clips           [● toggle] │  │  ← iOS-style switch
│  │  Pick from clips shared with you too        │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ADD A DEFAULT                                   │
│  ┌────────────────────────────────────────────┐  │
│  │  Username                                  │  │
│  └────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────┐  │
│  │     Add to auto-share                      │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

After typing a username and tapping Add: a confirmation card appears
("Add Joelle to auto-share?") with two radio options:

- "New scrapbooks only"
- "All scrapbooks"

…and an Add / Cancel pair.

For Remove: a bottom sheet ("Remove Joelle?") with the same two options:

- "Stop future shares only"
- "Remove all access" (sienna)

…and a Remove / Cancel pair.

### Measurements

| Element | Style |
|---|---|
| Section eyebrow | rust 10 px / 2 px tracking |
| List container | rounded-2xl, walnut-mid, walnut-light border |
| List row | `px-4 py-3.5`, gap-3 |
| iOS toggle (track) | **fixed 44 × 26 px** (not Tailwind w-/h-), border-radius 13 |
| iOS toggle (knob) | **fixed 20 × 20 px**, wheat, border-radius 50% |
| Toggle on state | track amber, knob `translateX(21px)` |
| Toggle off state | track walnut-light, knob `translateX(3px)` |
| Toggle transition | 0.2 s on both background and transform |

The toggle's fixed-pixel dimensions are important — Tailwind classes
were prone to overflow on iOS Safari with subpixel rounding. **In
native, just use the values: 44 × 26 track / 20 × 20 knob / 21 / 3 px
translateX. Don't try to abstract.**

---

## 3. State machine

```ts
const [defaults, setDefaults] = useState<SharingDefault[]>([])
const [loading, setLoading] = useState(true)

// Surprise Me toggle
const [surpriseMeIncludeShared, setSurpriseMeIncludeShared] = useState(false)

// Add flow
const [username, setUsername] = useState('')
const [addStatus, setAddStatus] = useState<'idle'|'sending'|'not_found'|'already_added'|'self'|'error'>('idle')
const [pendingRecipient, setPendingRecipient] = useState<{ id: string; displayName: string; scrapbookCount: number }|null>(null)
const [retroactive, setRetroactive] = useState(true)              // "all scrapbooks" vs "future only"
const [confirming, setConfirming] = useState(false)

// Remove flow
const [pendingRemove, setPendingRemove] = useState<{ id: string; recipient_id: string; displayName: string; scrapbookCount: number }|null>(null)
const [removeMode, setRemoveMode] = useState<'future'|'all'>('all')
```

`SharingDefault` shape:

```ts
type SharingDefault = {
  id: string
  recipient_id: string
  user_id: string
  display_name: string | null
  username: string
}
```

---

## 4. Data fetches & writes

### Load defaults

```ts
const { data } = await supabase
  .from('sharing_defaults')
  .select('id, recipient_id, user_id, profiles!sharing_defaults_recipient_id_fkey(display_name, username)')
  .eq('user_id', session.user.id)
// Flatten to { id, recipient_id, display_name, username }
```

### Load surprise-me preference

```ts
const { data } = await supabase
  .from('profiles')
  .select('surprise_me_include_shared')
  .eq('user_id', session.user.id)
  .single()
setSurpriseMeIncludeShared(!!data?.surprise_me_include_shared)
```

### Toggle Surprise Me

```ts
async function toggleSurpriseMe() {
  const next = !surpriseMeIncludeShared
  setSurpriseMeIncludeShared(next)        // optimistic
  const { error } = await supabase
    .from('profiles')
    .update({ surprise_me_include_shared: next })
    .eq('user_id', session.user.id)
  if (error) setSurpriseMeIncludeShared(!next)   // revert
}
```

### Add default (multi-step)

```ts
async function handleAdd() {
  // 1. Look up user
  const { data: recipientId } = await supabase.rpc('get_user_id_by_username', { p_username: username.trim().toLowerCase() })
  if (!recipientId) { setAddStatus('not_found'); return }
  if (recipientId === session.user.id) { setAddStatus('self'); return }
  if (defaults.some(d => d.recipient_id === recipientId)) { setAddStatus('already_added'); return }

  // 2. Fetch profile + scrapbook count in parallel
  const [{ data: profile }, { count }] = await Promise.all([
    supabase.from('profiles').select('display_name, username').eq('user_id', recipientId).single(),
    supabase.from('scrapbooks').select('id', { count: 'exact', head: true }).eq('user_id', session.user.id),
  ])

  setPendingRecipient({ id: recipientId, displayName: profile?.display_name ?? profile?.username ?? '', scrapbookCount: count ?? 0 })
  setRetroactive(true)
  setAddStatus('idle')
  setUsername('')
}

async function handleConfirmAdd() {
  if (!pendingRecipient) return
  setConfirming(true)

  // 1. Create the default
  const { data: defaultRow, error: defErr } = await supabase
    .from('sharing_defaults')
    .insert({ user_id: session.user.id, recipient_id: pendingRecipient.id })
    .select().single()
  if (defErr) { setConfirming(false); return }

  // 2. If "all scrapbooks", upsert shares for existing scrapbooks
  if (retroactive && pendingRecipient.scrapbookCount > 0) {
    const { data: ownBooks } = await supabase
      .from('scrapbooks')
      .select('id')
      .eq('user_id', session.user.id)

    const rows = (ownBooks || []).map(sb => ({
      scrapbook_id: sb.id,
      owner_id: session.user.id,
      shared_with_id: pendingRecipient.id,
    }))

    const { error: upErr } = await supabase
      .from('scrapbook_shares')
      .upsert(rows, { onConflict: 'scrapbook_id,shared_with_id', ignoreDuplicates: true })

    if (upErr) {
      // Roll back the default
      await supabase.from('sharing_defaults').delete().eq('id', defaultRow.id)
      setConfirming(false)
      return
    }
  }

  // 3. Reload, dismiss confirmation
  await loadDefaults()
  setPendingRecipient(null)
  setConfirming(false)
}
```

### Remove default (multi-step)

```ts
async function handleRemovePress(def: SharingDefault) {
  // Fetch count of current shares with this recipient
  const { count } = await supabase
    .from('scrapbook_shares')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', session.user.id)
    .eq('shared_with_id', def.recipient_id)

  setPendingRemove({ id: def.id, recipient_id: def.recipient_id, displayName: def.display_name ?? def.username, scrapbookCount: count ?? 0 })
  setRemoveMode('all')
}

async function handleConfirmRemove() {
  if (!pendingRemove) return

  // Optimistic
  setDefaults(prev => prev.filter(d => d.id !== pendingRemove.id))
  setPendingRemove(null)

  // 1. Delete the default
  await supabase.from('sharing_defaults').delete().eq('id', pendingRemove.id)

  // 2. If 'all', delete existing shares
  if (removeMode === 'all') {
    await supabase.from('scrapbook_shares').delete()
      .eq('owner_id', session.user.id)
      .eq('shared_with_id', pendingRemove.recipient_id)
  }
}
```

---

## 5. Every interaction

### 5.1 Toggle Surprise Me

Tap the toggle → state flips optimistically → DB update → revert on
error. See §4.

### 5.2 Add username

Type → tap "Add to auto-share" or Enter → `handleAdd()`. On
not_found / self / already_added: inline error.

### 5.3 Confirmation card after username found

Shown inline in the Add section (not a sheet — replaces the input):

```
Add Joelle to auto-share?

  ● New scrapbooks only
  ○ All scrapbooks (will share 12 existing scrapbooks)

[Cancel]  [Add]
```

The "scrapbook count" preview only shows if `retroactive = true` and
count > 0.

### 5.4 Confirm Add

Tap "Add" → `handleConfirmAdd()` (see §4). Disabled during `confirming`.

### 5.5 Cancel Add

Tap "Cancel" → `setPendingRecipient(null)`.

### 5.6 Remove (X next to a default row)

Tap X → opens bottom sheet:

```
Remove Joelle?

  ● Stop future shares only
  ○ Remove all access (12 scrapbooks)

[Remove]  [Cancel]
```

The "Remove" button is amber if `removeMode === 'future'`, sienna if
`'all'`.

### 5.7 Back

`navigate('/')` → Home.

### 5.8 Sign out (PWA does this elsewhere)

Native current code puts Sign Out in Home's header. For Settings v1,
add a "Sign Out" link at the bottom of the screen. PWA's exact
location of this is fuzzy; native gets to choose.

---

## 6. Animations & micro-feel

### 6.1 iOS toggle

The most-loved micro-interaction in Settings. Smooth 0.2 s transition
on `transform: translateX` and `background-color`. Mostly automatic in
native if you use the `Animated.View` approach below.

**Don't** use React Native's built-in `Switch` component — it doesn't
match the brand. Roll your own:

```tsx
function KasetteSwitch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const translateX = useSharedValue(value ? 21 : 3)
  const bgColor = useSharedValue(value ? '#F2A24A' : '#4A2E18')

  useEffect(() => {
    translateX.value = withTiming(value ? 21 : 3, { duration: 200 })
    bgColor.value = withTiming(value ? '#F2A24A' : '#4A2E18', { duration: 200 } as any)
  }, [value])

  const trackStyle = useAnimatedStyle(() => ({ backgroundColor: bgColor.value }))
  const knobStyle  = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }))

  return (
    <Pressable onPress={() => onChange(!value)} hitSlop={10}>
      <Animated.View style={[{ width: 44, height: 26, borderRadius: 13, justifyContent: 'center' }, trackStyle]}>
        <Animated.View style={[{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.wheat, position: 'absolute', top: 3 }, knobStyle]} />
      </Animated.View>
    </Pressable>
  )
}
```

Note: Reanimated v3 can't tween color directly via shared values
without `interpolateColor`. Use `interpolateColor(progress, [0, 1],
['#4A2E18', '#F2A24A'])` based on a 0–1 progress shared value instead.

### 6.2 Radio buttons (add / remove confirmations)

Active radio: amber background `rgba(amber, 0.10)` + amber border
`rgba(amber, 0.3)` + filled amber circle inside.
Inactive: walnut-mid bg + walnut-light border + empty circle.

Transition on tap: instant (no PWA animation).

---

## 7. Empty / loading / error states

### Loading

Cassette reel centered.

### Empty defaults

```
You haven't set up any auto-share defaults yet.
```

Centered in the list container, wheat/30.

### Username not found

Inline sienna error: "We couldn't find someone with that username."

### Toggle update failure

Auto-reverts (see §4). No user-visible toast.

---

## 8. Known gotchas

- **The fixed-px toggle.** Don't reach for Tailwind w-/h- on the
  track or knob; the Settings file specifically calls out that this
  was a fix for knob overflow. Native equivalent: literal numbers
  44/26/20/20 in StyleSheet.
- **Retroactive add can fail** mid-flight. The rollback (`delete
  sharing_defaults`) is important — without it, you'd have a default
  with no corresponding shares.
- **Remove "future" only**: just delete the default row. Existing
  shares persist.
- **Remove "all"**: also delete `scrapbook_shares` where this
  recipient is `shared_with_id`. The recipient loses every shared
  scrapbook from this owner at once.
- **`sharing_defaults` is owner-scoped.** RLS prevents seeing or
  modifying anyone else's.

---

## 9. Native translation notes

### Recommended stack

- Just `TextInput`, `Pressable`, `View`, custom `KasetteSwitch`.
- `@gorhom/bottom-sheet` for the Remove confirmation.
- Inline confirmation card for Add (no sheet — replaces the input).

### Sign-out placement

Current native: top-right of Home (`HomeScreen.tsx:46–52`). Once
Settings ships, **keep Home's sign-out for now** (small redundancy is
fine) — and add a Sign Out row at the bottom of Settings. PWA puts it
in Settings; current native chose Home. Both are defensible. Eventually
remove Home's once Settings is the canonical location.

### Defer for v0.5

- **In scope:** None until Day-N (Settings is low-priority).
- **Build when:** After Home + Detail + Playback + Intake all ship.
  Settings is the polish pass.

---

## 10. Test plan

- [ ] Load → list of defaults; toggle reflects DB state.
- [ ] Toggle Surprise Me → state flips immediately; DB updates.
      Throttled network: toggle still optimistic; reverts on failure.
- [ ] Type username; not found → error. Self → "That's you!" error.
      Already added → already_added error.
- [ ] Valid username → confirmation card replaces input. Default
      "All scrapbooks" selected (retroactive=true). Switch to "New
      only" → on Confirm, no upsert runs, default-only created.
- [ ] Tap X on a default → bottom sheet with "Stop future" / "Remove
      all access" options.
- [ ] "Stop future" → default deleted, existing shares persist.
- [ ] "Remove all access" → default deleted, all shares with that
      recipient gone. Verify on recipient's side: Shared tab no longer
      shows those scrapbooks.

---

*Cross-references:* `02-interactions-glossary.md` §17 (optimistic
revert pattern); `03-data-model.md` §2 (`sharing_defaults`,
`profiles.surprise_me_include_shared`), §5 (RPCs);
`screens/share.md` (the per-scrapbook variant);
`screens/remix-film-fest.md` (where the Surprise Me toggle takes
effect).
