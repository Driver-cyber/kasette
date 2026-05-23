# 03 — Data Model

> **What this doc covers.** Everything the native port reads from or
> writes to the backend: tables, columns, RLS, indexes, RPCs, storage
> paths, the worker URL, and the canonical client-side cache layer. The
> backend is shared with the web PWA — schema changes affect both. Don't
> introduce new tables or columns from native; if you need one, ship the
> migration via `kasette/` first.

The `app/supabase-schema.sql` file is **v1 only** — it predates several
tables added by migration. This doc reflects the *actual deployed
state* inferred from PWA source. If you find a column the PWA reads
but isn't documented here, it likely lives in a post-schema migration —
flag it and update this doc.

---

## 1. Connection

### Native (`kasette-native/lib/supabase.ts`) — already wired

```ts
import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
)
```

Env var names mirror the PWA's `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
with the Expo prefix. They live in `.env` (gitignored); the project's
`.env.example` has the shape.

**Recommendation:** swap `AsyncStorage` for **`expo-secure-store`** before
shipping to TestFlight. Auth tokens in AsyncStorage are accessible to any
code with file-system access; SecureStore uses Keychain. Same SDK API,
two-line change. Not blocking the per-screen port.

### `detectSessionInUrl: false` — why

The PWA sets this to `true` so reset-password emails arriving as
`https://app/reset-password#token=…` are auto-handled. Native uses
explicit deep-link routing via React Navigation's `linking` config + a
`onAuthStateChange('PASSWORD_RECOVERY')` listener inside
`ResetPasswordScreen`. Keep `detectSessionInUrl: false`.

---

## 2. Tables — the full deployed schema

### `scrapbooks`

The container. One row per scrapbook in the user's library.

| Column | Type | Default | Constraints | Notes |
|---|---|---|---|---|
| `id` | `uuid` | `gen_random_uuid()` | PK | |
| `user_id` | `uuid` | — | FK → `auth.users(id) ON DELETE CASCADE`, NOT NULL | RLS partition key |
| `name` | `text` | — | NOT NULL | User-supplied, ≤ 60 chars (client enforced) |
| `cover_image_url` | `text` | NULL | — | R2 public URL |
| `year` | `integer` | NULL | added post-v1 by migration | Used for Home year-grouping |
| `month` | `integer` | NULL | 1–12, or NULL for the "···" ungrouped bucket | Used for Home month-heading. `month=0` is the legacy bucket key in client code but `NULL` in DB. |
| `created_at` | `timestamptz` | `now()` | NOT NULL | |

**Drift to know:** the v1 schema doesn't define `year` or `month`. They
were added via migration. PWA HomeScreen reads them in every list query.
Native types must include them.

### `clips`

One row per clip (video or photo) in a scrapbook.

| Column | Type | Default | Constraints | Notes |
|---|---|---|---|---|
| `id` | `uuid` | `gen_random_uuid()` | PK | |
| `scrapbook_id` | `uuid` | — | FK → `scrapbooks(id) ON DELETE CASCADE`, NOT NULL | |
| `storage_path` | `text` | — | NOT NULL | R2 key (e.g. `userId/scrapbookId/clipId.mp4`) — kept for delete operations |
| `video_url` | `text` | — | NOT NULL | R2 public URL — for photos, this is the image URL |
| `thumbnail_url` | `text` | NULL | added post-v1 | First-frame JPEG for videos; same as `video_url` for photos |
| `"order"` | `integer` | `0` | NOT NULL, **UNIQUE per `scrapbook_id`** (see below) | |
| `trim_in` | `numeric` | `0` | NOT NULL | Seconds. `0` = clip start |
| `trim_out` | `numeric` | NULL | — | Seconds. NULL = clip end (no trim) |
| `cut_in` | `numeric` | NULL | added post-v1 | Seconds. Start of cut-out region (skip during playback) |
| `cut_out` | `numeric` | NULL | added post-v1 | Seconds. End of cut-out region. Constraint: `cut_in < cut_out` (sorted before insert) |
| `caption_text` | `text` | NULL | — | Per-clip caption |
| `caption_x` | `numeric` | `50` | NOT NULL | % of frame width, 5–95 client-clamped |
| `caption_y` | `numeric` | `85` | NOT NULL | % of frame height, 5–95 client-clamped |
| `caption_size` | `integer` | `24` | NOT NULL | Font size in px, 14–42 client-clamped |
| `duration` | `numeric` | NULL | — | Seconds. Set on upload (5 for photos) |
| `recorded_at` | `timestamptz` | NULL | — | From iPhone video metadata if available |
| `media_type` | `text` | `'video'` | added post-v1, default `'video'` | `'video'` or `'photo'`. PWA branches on this; native must too. |
| `created_at` | `timestamptz` | `now()` | NOT NULL | |

**The unique-order constraint.** CLAUDE.md and source agree there's a
`UNIQUE(scrapbook_id, "order")` constraint, but the v1 SQL doesn't
declare it. Assume it's added by migration (the `clips_scrapbook_order_idx`
index alone doesn't enforce uniqueness). Native code must respect it:

- **Inserting a new clip:** assign `order = max(existing) + 1`, not
  `count(*) + 1` (gaps from deletes are common).
- **Splitting a clip:** shift existing clip orders *before* inserting,
  or the insert silently fails (Supabase returns `error` on the
  duplicate-key violation but doesn't raise — easy to miss in handlers).
- **Reordering:** update orders sequentially in a single loop, not in
  parallel (see `02-interactions-glossary.md` §5).

**No `muted` column.** Mute is client-side only state. Don't add it.

### `profiles`

User-controlled profile fields. One row per `auth.users.id`.

| Column | Type | Default | Constraints | Notes |
|---|---|---|---|---|
| `user_id` | `uuid` | — | PK, FK → `auth.users(id) ON DELETE CASCADE` | |
| `username` | `text` | — | UNIQUE | Used for login & sharing lookup |
| `display_name` | `text` | NULL | — | Shown in Shared tab "from {display_name}" |
| `surprise_me_include_shared` | `boolean` | `false` | — | Whether Surprise Me picks from shared clips too |
| `created_at` | `timestamptz` | `now()` | NOT NULL | |

A row is auto-created on signup via a Supabase trigger (the SignupScreen
passes `username` and `display_name` in `signUp({ options: { data } })`
metadata; a trigger reads from `auth.users.raw_user_meta_data` and
inserts the row).

### `scrapbook_shares`

One row per (scrapbook × recipient) pair. Both the inbound and outbound
side query this same table.

| Column | Type | Default | Constraints | Notes |
|---|---|---|---|---|
| `id` | `uuid` | `gen_random_uuid()` | PK | |
| `scrapbook_id` | `uuid` | — | FK → `scrapbooks(id) ON DELETE CASCADE`, NOT NULL | |
| `owner_id` | `uuid` | — | FK → `auth.users(id)`, NOT NULL | Mirror of `scrapbooks.user_id` — denormalized for query efficiency |
| `shared_with_id` | `uuid` | — | FK → `auth.users(id)`, NOT NULL | |
| `seen` | `boolean` | `false` | NOT NULL | Drives the amber dot on the Shared tab |
| `created_at` | `timestamptz` | `now()` | NOT NULL | |

**Unique constraint:** `(scrapbook_id, shared_with_id)` — a user can
only have one share per scrapbook. PWA uses `upsert` with `onConflict:
'scrapbook_id,shared_with_id'`.

### `sharing_defaults`

Auto-share rules — "anyone listed here gets every new scrapbook I
create."

| Column | Type | Default | Constraints | Notes |
|---|---|---|---|---|
| `id` | `uuid` | `gen_random_uuid()` | PK | |
| `user_id` | `uuid` | — | FK → `auth.users(id)`, NOT NULL | The owner who set the default |
| `recipient_id` | `uuid` | — | FK → `auth.users(id)`, NOT NULL | The person who'll auto-receive |
| `created_at` | `timestamptz` | `now()` | NOT NULL | |

**Unique constraint:** `(user_id, recipient_id)`.

### `closed_years`

Marks years that have been "closed" — once a year is closed, the home
screen shows a checkmark badge on the year row and (if a cassette was
created) a link to the year's "Cassette" combined scrapbook.

| Column | Type | Default | Constraints | Notes |
|---|---|---|---|---|
| `id` | `uuid` | `gen_random_uuid()` | PK | |
| `user_id` | `uuid` | — | FK, NOT NULL | |
| `year` | `integer` | — | NOT NULL | |
| `cassette_scrapbook_id` | `uuid` | NULL | FK → `scrapbooks(id)` | Optional — set if user chose "Create {year} Cassette" |
| `created_at` | `timestamptz` | `now()` | NOT NULL | |

**Unique constraint:** `(user_id, year)`.

### `film_fest_saves`

Saved Film Fest filter sets ("the Christmas mix", "all 2023", etc.).

| Column | Type | Default | Constraints | Notes |
|---|---|---|---|---|
| `id` | `uuid` | `gen_random_uuid()` | PK | |
| `user_id` | `uuid` | — | FK, NOT NULL | |
| `name` | `text` | — | NOT NULL | |
| `filter_config` | `jsonb` | — | NOT NULL | `{ years: number[], months: number[] }` |
| `created_at` | `timestamptz` | `now()` | NOT NULL | |

---

## 3. Row Level Security (RLS) — the rules in plain English

RLS is enabled on every table. Every read/write is auto-filtered by
`auth.uid()`.

### `scrapbooks`

| Op | Policy | Plain English |
|---|---|---|
| SELECT | `auth.uid() = user_id` OR via `scrapbook_shares` (if shared) | I can see my own scrapbooks. I can see scrapbooks shared with me through `scrapbook_shares.shared_with_id = auth.uid()`. (Two policies OR'd.) |
| INSERT | `auth.uid() = user_id` | I can only create scrapbooks owned by me. |
| UPDATE | `auth.uid() = user_id` | Only the owner can rename, change cover, change year/month. |
| DELETE | `auth.uid() = user_id` | Only the owner can delete. |

### `clips`

| Op | Policy | Plain English |
|---|---|---|
| SELECT | EXISTS(scrapbook owned-or-shared-with me) | I can see clips of any scrapbook I have access to (mine or shared with me). |
| INSERT | EXISTS(scrapbook owned by me) | I can only add clips to my own scrapbooks. |
| UPDATE | EXISTS(scrapbook owned by me) | Only the scrapbook owner can edit clips (trim, caption, etc.). |
| DELETE | EXISTS(scrapbook owned by me) | Only the scrapbook owner can delete clips. |

**Important RLS gotcha for native:** the shared-with-me read policy
*must* exist on both `scrapbooks` and `clips` or recipients see the
scrapbook list but can't load its clips. If a shared scrapbook shows
"No clips" when it shouldn't, suspect missing RLS on `clips`.

### `scrapbook_shares`

| Op | Plain English |
|---|---|
| SELECT | I can see shares where I'm the owner OR I'm the recipient. |
| INSERT | I can insert shares where I'm the owner of the scrapbook. |
| UPDATE | I can update `seen` on shares where I'm the recipient. (Owner can update `seen` too — used during the close-year flow.) |
| DELETE | The owner can delete (revoke), and the recipient can delete (self-remove). |

### `sharing_defaults`

Only the owning user can read, insert, update, or delete their own
defaults. `auth.uid() = user_id`.

### `profiles`

| Op | Plain English |
|---|---|
| SELECT | Any authenticated user can read any profile. Needed for username → display_name resolution. |
| UPDATE | Only the owner can update their own row. |
| INSERT | Trigger-only (no client inserts). |

### `closed_years`, `film_fest_saves`

Owner-only on all four ops.

---

## 4. Indexes

| Index | On | Purpose |
|---|---|---|
| `scrapbooks_user_id_idx` | `scrapbooks (user_id, created_at DESC)` | Fast Home list, newest first |
| `clips_scrapbook_order_idx` | `clips (scrapbook_id, "order")` | Fast in-order clip fetch for playback / workspace |
| *(implied)* `scrapbook_shares_recipient_idx` | `scrapbook_shares (shared_with_id, created_at DESC)` | Fast Shared tab list. Add if not present. |
| *(implied)* `closed_years_user_idx` | `closed_years (user_id)` | Fast year-row badge lookup on Home |

---

## 5. RPCs (stored procedures)

The PWA calls four custom RPCs. Native calls them the same way:
`supabase.rpc('<name>', { p_…: value }).single()` or `.maybeSingle()`
depending on whether absence is allowed.

| RPC | Args | Returns | Use case |
|---|---|---|---|
| `get_email_by_username` | `p_username: text` | `text` (email) or NULL | LoginScreen — when user types a username instead of email, resolve to email before `signInWithPassword` |
| `check_username_available` | `p_username: text` | `boolean` | SignupScreen — pre-check uniqueness before `signUp` to give a friendly error |
| `get_user_id_by_username` | `p_username: text` | `uuid` or NULL | ShareScreen, SettingsScreen — find the recipient by their username |
| `get_scrapbook_shares` | `p_scrapbook_id: uuid` | rows of `{ share_id, shared_with_id, display_name, username, email }` | ShareScreen — list who has access, with enriched profile data |

All RPCs are SECURITY DEFINER on the backend so they can read across
RLS for the specific lookup. Don't reimplement these in native; just
call them.

### Naming convention

All custom RPCs use the `p_` prefix on args (Supabase convention).
Match exactly.

---

## 6. Storage — Cloudflare R2 paths and worker

### Where the bytes live

Cloudflare R2 bucket exposed at:

- **Public URL base:** `https://pub-bab6003c5bee4548b6a48fc2eca4583a.r2.dev`
- **Worker (signed-URL gateway):** `https://cassette-worker.cstewch.workers.dev`

Both URLs are *production constants* — they're not env vars per
environment. The worker source lives in `kasette/worker/`.

### Storage path conventions

CLAUDE.md says `cassette-media/{userId}/videos/{clipId}.mp4` but the
**actual r2.js source uses a different layout**. Verbatim from
`app/src/lib/r2.js` (and re-confirmed by `IntakeScreen.jsx` and
`UploadContext.jsx`):

| Asset | Path pattern | Example |
|---|---|---|
| Video | `{userId}/{scrapbookId}/{clipId}.mp4` | `7e8…/abc-123/9f0-456.mp4` |
| Poster (video thumbnail) | `{userId}/{scrapbookId}/{clipId}_thumb.jpg` | `7e8…/abc-123/9f0-456_thumb.jpg` |
| Photo (image clip) | `{userId}/{scrapbookId}/{clipId}.{ext}` | `7e8…/abc-123/9f0-456.heic` |
| Scrapbook cover | `{userId}/covers/{scrapbookId}.{ext}` | `7e8…/covers/abc-123.jpg` |

**CLAUDE.md drift:** the `cassette-media/{userId}/videos/{clipId}.mp4`
shape is *wrong*. The `cassette-media` prefix is the Supabase-Storage
shape from before the R2 migration (April 2026); current R2 paths don't
include it, and there is no `videos/` subfolder.

The `cassette-media` Supabase Storage bucket *still exists* — it
currently hosts the **FFmpeg WASM bundle** (`cassette-media/ffmpeg/…`)
loaded by `remux.js`. It is no longer used for clip storage. Native
doesn't load this bundle (it uses native FFmpeg or no remux at all — see
`screens/intake.md`).

### Upload via worker (presigned URL)

PWA flow (`r2.js:uploadToR2`):

1. Client `POST`s to `${worker}/presign` with
   `{ key, contentType }` and an `X-Upload-Secret` header.
2. Worker generates an S3-compatible PUT presigned URL (≈15 min TTL)
   for that key and returns `{ uploadUrl, publicUrl }`.
3. Client `PUT`s the file to `uploadUrl` directly via XHR (so it gets
   progress events).
4. Client uses `publicUrl` as the canonical reference (stored in
   `clips.video_url`).

### Delete via worker

Same pattern, `${worker}/delete` with array of keys, requires
`X-Upload-Secret`.

### Native equivalent — recommended implementation

```ts
// lib/r2.ts (native)
const WORKER = 'https://cassette-worker.cstewch.workers.dev'
const PUBLIC = 'https://pub-bab6003c5bee4548b6a48fc2eca4583a.r2.dev'
const SECRET = process.env.EXPO_PUBLIC_UPLOAD_SECRET!

async function workerFetch(path: string, body: object) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(`${WORKER}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Upload-Secret': SECRET,
      },
      body: JSON.stringify(body),
    })
    if (res.status === 401) throw new Error('upload secret invalid')
    if (res.ok) return res.json()
    if (attempt < 3) await sleep(2 ** attempt * 1000)
  }
  throw new Error('worker fetch failed')
}

export async function uploadToR2(
  key: string,
  fileUri: string,           // file:// URI from expo-image-picker
  contentType: string,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const { uploadUrl, publicUrl } = await workerFetch('/presign', { key, contentType })

  // Native PUT with progress — XMLHttpRequest works in RN
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', uploadUrl)
    xhr.setRequestHeader('Content-Type', contentType)
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded / e.total)
      }
    }
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject(new Error(`PUT ${xhr.status}`))
    xhr.onerror = () => reject(new Error('PUT failed'))
    // RN's XHR accepts a `{ uri }` object as send body for native files
    xhr.send({ uri: fileUri, type: contentType, name: key.split('/').pop()! } as any)
  })

  return publicUrl
}

export async function deleteFromR2(urls: string | string[]) {
  const list = Array.isArray(urls) ? urls : [urls]
  const keys = list
    .filter(u => u.startsWith(PUBLIC))
    .map(u => u.replace(`${PUBLIC}/`, '').split('?')[0])
  if (!keys.length) return
  try { await workerFetch('/delete', { keys }) } catch (e) { console.warn('R2 delete', e) }
}
```

`XMLHttpRequest` *does* work in React Native and exposes
`upload.onprogress` — it's the standard way to get upload progress in
RN since `fetch` doesn't expose progress events. Don't import the web
`r2.js` — port the API surface.

### Worker key gotchas

- The `X-Upload-Secret` header is a shared secret between client and
  worker, set in the Worker's environment. It is *not* the Supabase
  anon key. Native needs its own env var (`EXPO_PUBLIC_UPLOAD_SECRET`)
  set to the same value. Add it to `.env.example`.
- The worker is currently *globally* protected by that secret. There's
  no per-user check at the worker layer — the secret leak vector is the
  bundled client. This is acceptable for a private family app but
  worth knowing if you ever take Cassette public.
- The `X-Upload-Secret` is committed to the client bundle — treat it as
  "doesn't open the door, just opens the screen door". Keep it out of
  source control via `.env`, but accept that it ships in the binary.

---

## 7. Common queries — verbatim shapes the screens use

### Home — own scrapbooks

```ts
const { data } = await supabase
  .from('scrapbooks')
  .select('*, clips(id, video_url, duration, trim_in, trim_out, recorded_at)')
  .eq('user_id', session.user.id)
  .order('created_at', { ascending: false })
```

Nested `clips` select brings back the data Home needs to render duration
+ clip-count per card without a second query. Keep the same shape in
native.

### Home — shared scrapbooks (inbound)

```ts
const { data } = await supabase
  .from('scrapbook_shares')
  .select('id, seen, owner_id, scrapbooks(*, clips(id, video_url, duration, trim_in, trim_out, recorded_at))')
  .eq('shared_with_id', session.user.id)
  .order('created_at', { ascending: false })

// Then fetch profiles for owner display names:
const ownerIds = [...new Set(data.map(s => s.owner_id))]
const { data: profiles } = await supabase
  .from('profiles')
  .select('user_id, display_name')
  .in('user_id', ownerIds)
```

Two-step. The second step is intentional — RLS lets any authenticated
user read profiles, so this just resolves display names.

### ScrapbookDetail / Playback / Workspace — scrapbook + clips

```ts
const [{ data: sb }, { data: cl }] = await Promise.all([
  supabase.from('scrapbooks').select('id, name, user_id, year, month, cover_image_url, created_at').eq('id', scrapbookId).single(),
  supabase.from('clips')
    .select('id, video_url, thumbnail_url, duration, trim_in, trim_out, cut_in, cut_out, caption_text, caption_x, caption_y, caption_size, order, recorded_at, media_type, storage_path')
    .eq('scrapbook_id', scrapbookId)
    .order('order', { ascending: true }),
])
```

This is the *fat* query — every field the editor and player both need.
Run it once on ScrapbookDetail, cache the result in `dataCache` (see §8),
and Playback / Workspace can short-circuit their own fetches.

### Workspace — auto-save clip changes

```ts
const { error } = await supabase
  .from('clips')
  .update({ trim_in, trim_out /* or whatever changed */ })
  .eq('id', clipId)
```

One field-set update per save. The `update` call is on `clips` row
filtered by `id`; RLS handles the "is this clip yours" check.

### Workspace — reorder loop

```ts
for (let i = 0; i < newOrder.length; i++) {
  await supabase.from('clips').update({ order: i }).eq('id', newOrder[i].id)
}
```

Sequential, not `Promise.all`. See `02-interactions-glossary.md` §5 for
why.

### Remix — combined query (Watch button)

```ts
const CLIP_SELECT = 'id, video_url, thumbnail_url, duration, trim_in, trim_out, cut_in, cut_out, caption_text, caption_x, caption_y, caption_size'

const { data } = await supabase
  .from('scrapbooks')
  .select(`id, name, year, month, cover_image_url, created_at, clips(${CLIP_SELECT})`)
  .eq('user_id', session.user.id)
  .in('year', selectedYears.length ? selectedYears : [allYears...])
  .in('month', selectedMonths.length ? selectedMonths : [1,2,3,4,5,6,7,8,9,10,11,12])
```

`CLIP_SELECT` is a verbatim constant in `RemixScreen.jsx`; keep the
same select string in native or you'll forget a field and break
playback.

### Intake — insert new scrapbook + clip 1

```ts
const { data: sb } = await supabase
  .from('scrapbooks')
  .insert({ user_id, name, year, month, cover_image_url: null })
  .select().single()

await supabase.from('clips').insert({
  scrapbook_id: sb.id,
  storage_path,
  video_url,
  thumbnail_url,
  order: 0,
  trim_in: 0,
  trim_out: duration,
  duration,
  recorded_at,
  media_type,
})
```

Clip 1 is the *blocking* upload; clips 2..N go through
`UploadContext.startBackgroundUpload` after navigation.

---

## 8. Client-side cache

PWA ships two small caches in `app/src/lib/`:

- **`dataCache.js`** — module-level `Map<scrapbookId, { scrapbook, clips }>`,
  10-entry FIFO. Populated by ScrapbookDetail's parallel fetch.
  Consumed by Workspace and Playback (`getCached(id)` returns instantly,
  skips the loading spinner).
- **`blobCache.js`** — module-level `Map<videoUrl, blobUrl>` with
  in-flight dedup. `preloadClip(url)` fetches the video into a Blob and
  creates a `URL.createObjectURL()` blob URL. `getBlob(url)` returns
  the cached blob URL or the original URL (sync). `preloadRest(clips,
  startFrom)` warms the rest of the playlist in the background.

### Native equivalents

**`dataCache.ts`** — port directly (it's 19 lines):

```ts
type Entry = { scrapbook: Scrapbook; clips: Clip[] }
const cache = new Map<string, Entry>()
const MAX = 10

export function cacheScrapbook(id: string, scrapbook: Scrapbook, clips: Clip[]) {
  if (cache.size >= MAX && !cache.has(id)) {
    const first = cache.keys().next().value
    cache.delete(first)
  }
  cache.set(id, { scrapbook, clips })
}
export function getCached(id: string) { return cache.get(id) ?? null }
```

**`blobCache`** is trickier — RN has **no `URL.createObjectURL`**. Two
options:

1. **Skip the blob cache entirely.** `expo-video` streams direct from
   the R2 public URL; the OS-level HTTP cache plus R2's CDN are
   enough. This is the simplest path.
2. **`expo-file-system` caching.** Pre-download clips to
   `FileSystem.cacheDirectory + 'clips/<clipId>.mp4'` via
   `FileSystem.downloadAsync()` and pass `file://` URIs to
   `useVideoPlayer`. Reproduces the blob-cache benefit (instant
   re-mount, no second network hit) but adds disk management — you'll
   eventually need a quota / LRU eviction.

Recommendation for v1: option 1. Skip the blob cache. R2 + iOS HTTP
caching are sufficient for the user's loop pattern (open scrapbook →
watch → maybe re-watch). Pull in option 2 only if testing shows
re-mount stutter.

### Background prewarm pattern

The PWA also runs `preloadRest(clips, startFrom)` on ScrapbookDetail
mount and on Remix mount to warm the next few clips silently. Native
equivalent — *if* you go with option 2 — is a small queue:

```ts
async function preloadRest(clips: Clip[], startFrom: number) {
  for (let i = startFrom; i < Math.min(clips.length, startFrom + 5); i++) {
    const c = clips[i]
    if (c.media_type === 'photo') continue
    const dest = `${FileSystem.cacheDirectory}clips/${c.id}.mp4`
    if ((await FileSystem.getInfoAsync(dest)).exists) continue
    FileSystem.downloadAsync(c.video_url, dest).catch(() => {})
  }
}
```

Don't await — fire-and-forget. Use `expo-image`'s `prefetch` for
thumbnails the same way.

---

## 9. Native types — recommended `lib/types.ts`

The current native `lib/types.ts` is significantly drifted from the
real schema. Replace with this:

```ts
export type MediaType = 'video' | 'photo'

export interface Scrapbook {
  id: string
  user_id: string
  name: string
  cover_image_url: string | null
  year: number | null
  month: number | null         // 1–12 or null
  created_at: string           // ISO 8601
}

export interface Clip {
  id: string
  scrapbook_id: string
  storage_path: string
  video_url: string
  thumbnail_url: string | null
  order: number
  trim_in: number              // seconds
  trim_out: number | null      // seconds, null = end of clip
  cut_in: number | null        // seconds, start of skip region
  cut_out: number | null       // seconds, end of skip region
  caption_text: string | null
  caption_x: number            // 0–100 (% of frame width)
  caption_y: number            // 0–100 (% of frame height)
  caption_size: number         // 14–42 px
  duration: number | null      // seconds
  recorded_at: string | null   // ISO 8601 or null
  media_type: MediaType
  created_at: string
}

export interface Profile {
  user_id: string
  username: string
  display_name: string | null
  surprise_me_include_shared: boolean
  created_at: string
}

export interface ScrapbookShare {
  id: string
  scrapbook_id: string
  owner_id: string
  shared_with_id: string
  seen: boolean
  created_at: string
}

export interface SharingDefault {
  id: string
  user_id: string
  recipient_id: string
  created_at: string
}

export interface ClosedYear {
  id: string
  user_id: string
  year: number
  cassette_scrapbook_id: string | null
  created_at: string
}

export interface FilmFestSave {
  id: string
  user_id: string
  name: string
  filter_config: { years: number[]; months: number[] }
  created_at: string
}

export type RootStackParamList = {
  // Public
  Login: undefined
  Signup: undefined
  ResetPassword: undefined
  // Protected
  Home: undefined
  ScrapbookDetail: { scrapbookId: string }
  Playback: { scrapbookId: string; scrapbookName?: string }
  Workspace: { scrapbookId: string }
  Share: { scrapbookId: string }
  Intake: { addToScrapbookId?: string }
  Discovery: { fromRemix?: boolean }
  Remix: undefined
  Settings: undefined
}
```

(The native auth-stack split happens at runtime in `App.tsx`, but for
typing the unified shape above is simpler.)

---

## 10. Migration etiquette

- **Native never ships a migration.** All schema changes go through
  `kasette/` (web). Add a Cross-Repo Sync Log entry in
  `kasette/DECISIONS.md` so both repos stay informed.
- If you need a column for a native-only feature, *first* ask whether
  it should be client-side state (like `muted`). Most ephemera should.
- If you discover a column the PWA reads that this doc doesn't list,
  **update this doc** in the same PR.

---

## 11. Drift summary (vs. `app/supabase-schema.sql`)

The committed v1 SQL file is missing:

- `scrapbooks.year`, `scrapbooks.month`
- `clips.thumbnail_url`, `clips.cut_in`, `clips.cut_out`,
  `clips.media_type`
- The `UNIQUE(scrapbook_id, "order")` constraint on `clips`
- The `profiles`, `scrapbook_shares`, `sharing_defaults`,
  `closed_years`, `film_fest_saves` tables
- The four RPCs
- The shared-with-me RLS policy extension on `scrapbooks` and `clips`

Treat this doc as the authoritative deployed schema. If you spin up a
fresh Supabase project for testing, running `app/supabase-schema.sql`
alone won't get you a working app — you'll need the post-v1
migrations. A consolidated `supabase-schema-current.sql` would be a
worthwhile follow-up but isn't blocking the native port.

---

*Cross-references:* see `00-brand-system.md` for the rendered values of
`caption_*` columns, `01-navigation-flow.md` for which screen reads
each table, and `02-interactions-glossary.md` §17 for the
optimistic-update-with-revert pattern that wraps every save.
