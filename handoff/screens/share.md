# screens/share.md — Share (per-scrapbook)

> **What it is.** A simple list of who has access to a single scrapbook,
> plus a "Add someone" form. Add by username; remove by tapping a small
> sienna X.
>
> **Priority for native.** Low. It's a single short list + a form +
> two RPCs. Cheap to port once auth + Home are in.

Route: `/scrapbook/:id/share` · File:
`kasette/app/src/screens/ShareScreen.jsx` (184 lines — the smallest
non-auth screen) · Native: not yet ported.

---

## 1. Purpose & user mental model

She tapped Share from ScrapbookDetail. She wants to:

1. See who currently has access to this scrapbook.
2. Type a family member's username to grant them access.
3. (Maybe) revoke someone's access by tapping the X next to their name.

No bulk add. No "share via link". No permissions ("read only" / "edit")
— it's binary: shared or not.

---

## 2. Layout

```
┌──────────────────────────────────────────────────┐
│  [←]   Sharing                                   │
│        Beach Trip                                │  ← subtitle = scrapbook name
├──────────────────────────────────────────────────┤
│                                                  │
│  WHO HAS ACCESS                                  │  ← eyebrow caps
│  ┌────────────────────────────────────────────┐  │
│  │ [J] Joelle                              [×]│  │  ← avatar + name + remove
│  │ ───────────────────────────────────────────│  │
│  │ [M] Mike                                [×]│  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ADD SOMEONE                                     │
│  ┌────────────────────────────────────────────┐  │
│  │  Username                                  │  │
│  └────────────────────────────────────────────┘  │
│  (error / status message, conditional)           │
│  ┌────────────────────────────────────────────┐  │
│  │     Share with this person                 │  │  ← amber CTA
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

### Measurements

| Element | Style |
|---|---|
| Header | `flex-shrink-0, px-5 pt-12 pb-4` |
| Back btn | 36×36 rounded-full, walnut-mid bg |
| Title | font-display 19 px, wheat |
| Subtitle | rust 12 px |
| Section eyebrow | rust 10 px / 2 px tracking / uppercase |
| List container | rounded-2xl, walnut-mid bg, walnut-light border |
| List row | `flex gap-3 px-4 py-3.5`, border-top on non-first |
| Avatar | 32×32 rounded-full, amber/15 bg, amber bold initial 13 px |
| Name | flex-1, wheat 14 px, truncate |
| Remove btn | 32×32 rounded-full, sienna X, `rgba(sienna, 0.12)` bg |
| Input | full-width rounded-xl, `px-4 py-3.5`, walnut-mid, walnut-light border (amber on focus) |
| Error text | sienna 11 px |
| CTA | full-width amber, py-4, rounded-2xl |

---

## 3. State machine

```ts
const [scrapbook, setScrapbook] = useState<{ id: string; name: string }|null>(null)
const [shares, setShares] = useState<Share[]>([])
const [loading, setLoading] = useState(true)

const [username, setUsername] = useState('')
const [addStatus, setAddStatus] = useState<'idle'|'sending'|'not_found'|'already_shared'|'self'|'error'>('idle')
```

`Share` shape:

```ts
type Share = {
  share_id: string
  shared_with_id: string
  display_name: string | null
  username: string
  email: string | null
}
```

---

## 4. Data fetches & writes

### Load

```ts
const { data, error } = await supabase.rpc('get_scrapbook_shares', { p_scrapbook_id: id })
if (error) { /* handle */ }
setShares(data)
```

The RPC handles the join through profiles to return enriched rows.
See `03-data-model.md` §5.

### Add

```ts
async function handleAdd() {
  const lookup = username.trim().toLowerCase()
  if (!lookup) return
  setAddStatus('sending')

  const { data: recipientId } = await supabase.rpc('get_user_id_by_username', { p_username: lookup })

  if (!recipientId) { setAddStatus('not_found'); return }
  if (recipientId === session.user.id) { setAddStatus('self'); return }
  if (shares.some(s => s.shared_with_id === recipientId)) { setAddStatus('already_shared'); return }

  const { error } = await supabase.from('scrapbook_shares').insert({
    scrapbook_id: id,
    owner_id: session.user.id,
    shared_with_id: recipientId,
  })
  if (error) { setAddStatus('error'); return }

  // Reload list, clear input
  await loadShares()
  setUsername('')
  setAddStatus('idle')
}
```

### Remove

```ts
async function handleRemove(shareId: string) {
  setShares(prev => prev.filter(s => s.share_id !== shareId))  // optimistic
  await supabase.from('scrapbook_shares').delete().eq('id', shareId)
}
```

---

## 5. Every interaction

### 5.1 Back arrow

`navigate(-1)` → returns to whatever pushed (typically ScrapbookDetail).

### 5.2 Add by username

User types in the input → Enter or tap "Share with this person" →
`handleAdd()`. Error states render below the input:

- `not_found` → "We couldn't find someone with that username."
- `self` → "That's you!"
- `already_shared` → "{name} already has access."
- `error` → "Something went wrong. Try again?"

### 5.3 Remove (X next to a name)

Tap sienna X → optimistic remove + DB delete. No confirmation modal.

PWA doesn't gate this with a confirmation — the small sienna X is
"undo-friendly enough" in the brand voice. **Native: match this.**
Don't add a confirmation; the user can re-add by typing the username.

### 5.4 Self-removal

Self isn't in the list — `shares` only contains *others*. To leave a
shared scrapbook (i.e. the user is the recipient), the user uses the
"Remove from Library" option on the Shared tab card in Home.

---

## 6. Animations & micro-feel

No animations. PWA is pure layout. Native: tap-feedback scale on the X
button, tap-feedback scale on the CTA. That's it.

---

## 7. Empty / loading / error states

### Loading

Cassette reel centered.

### Empty (no shares)

> Not shared with anyone yet.

In wheat/30, centered inside the list container.

### Username not found

Inline error per §5.2.

### Network error during load

PWA leaves the list empty silently. **Native should show a retry CTA.**

---

## 8. Known gotchas

- **Only the owner sees this screen.** RLS would block the writes
  anyway, but render-side guard: navigate away if `scrapbook.user_id !== session.user.id`.
- **`get_scrapbook_shares` is a single RPC** — it returns the enriched
  list in one call. Don't reimplement as a manual join.
- **Username lookup is lowercased.** `username.trim().toLowerCase()`.
  Matches the `toUsername()` derivation in SignupScreen.
- **Optimistic remove can revert** if the DB delete fails (rare). PWA
  doesn't revert; native should add the revert for safety.

---

## 9. Native translation notes

### Recommended stack

- Just `TextInput`, `Pressable`, `FlatList` (or mapped). Nothing fancy.
- Same `<KasetteBottomSheet>` style used elsewhere — but Share has no
  sheets.

### Avatar with initials

```tsx
function Avatar({ name }: { name: string }) {
  const initial = name.charAt(0).toUpperCase()
  return (
    <View style={{
      width: 32, height: 32, borderRadius: 16,
      backgroundColor: 'rgba(242,162,74,0.15)',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ color: colors.amber, fontFamily: fonts.bodySemiBold, fontSize: 13 }}>
        {initial}
      </Text>
    </View>
  )
}
```

### Input + button pattern

Submit on Enter:

```tsx
<TextInput
  value={username}
  onChangeText={setUsername}
  onSubmitEditing={handleAdd}
  placeholder="Username"
  placeholderTextColor={colors.rust}
  returnKeyType="send"
  autoCapitalize="none"
  autoCorrect={false}
  style={styles.input}
/>
```

---

## 10. Test plan

- [ ] Load → list of recipients (or "Not shared yet" if empty).
- [ ] Add valid username → list updates with new row.
- [ ] Add unknown username → inline error.
- [ ] Add own username → "That's you!" error.
- [ ] Add duplicate → "already has access" error.
- [ ] Tap X next to a name → row disappears immediately.
- [ ] Back → returns to ScrapbookDetail with state preserved.
- [ ] Non-owner accessing this route directly → redirect to Detail.

---

*Cross-references:* `03-data-model.md` §2 (`scrapbook_shares`), §5
(RPCs), §3 (RLS); `screens/scrapbook-detail.md` (the entry point);
`screens/settings.md` (the related auto-share defaults UI).
