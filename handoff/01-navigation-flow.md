# 01 — Navigation Flow & Information Architecture

> **TL;DR for native.** React Navigation native-stack is already chosen
> (and already wired up in `kasette-native/App.tsx`). Mirror the PWA's
> URL-based routes as stack routes with matching names. Auth screens are
> public (live outside the protected stack); everything else lives behind
> a session-gated stack. Twelve screens total. No tabs — the PWA is
> single-stack and so is native.

This doc is the single source of truth for: which screens exist, how the
user gets from one to another, what each navigation action looks like in
PWA code, and what its native equivalent should be. Per-screen detail
(layout, interactions, animations) lives in `screens/*.md`.

---

## 1. Route inventory — the full table

Twelve screens. Three public, nine protected. From `app/src/App.jsx`
(authoritative — the route table on lines ~70–180):

| # | PWA route | Component | Auth | Native stack name | Native params shape |
|---|---|---|---|---|---|
| 1 | `/` | `HomeScreen` | Protected | `Home` | none |
| 2 | `/login` | `LoginScreen` | Public | `Login` | none |
| 3 | `/signup` | `SignupScreen` | Public | `Signup` | none |
| 4 | `/reset-password` | `ResetPasswordScreen` | Public *(arrives via Supabase deep link)* | `ResetPassword` | none — relies on recovery session |
| 5 | `/scrapbook/:id` | `ScrapbookDetailScreen` | Protected | `ScrapbookDetail` | `{ scrapbookId: string }` |
| 6 | `/scrapbook/:id/watch` | `PlaybackScreen` | Protected | `Playback` | `{ scrapbookId: string, scrapbookName?: string }` |
| 7 | `/scrapbook/:id/edit` | `WorkspaceScreen` | Protected | `Workspace` | `{ scrapbookId: string }` |
| 8 | `/scrapbook/:id/share` | `ShareScreen` | Protected | `Share` | `{ scrapbookId: string }` |
| 9 | `/intake` *(or with `?addTo=:id` for add-to-existing)* | `IntakeScreen` | Protected | `Intake` | `{ addToScrapbookId?: string }` |
| 10 | `/discover` | `DiscoveryScreen` | Protected | `Discovery` | `{ remix?: RemixPayload }` (see below) |
| 11 | `/remix` | `RemixScreen` (Film Fest) | Protected | `Remix` | none |
| 12 | `/settings` | `SettingsScreen` | Protected | `Settings` | none |

### Route name drift to fix in CLAUDE.md

CLAUDE.md says the Workspace route is `/scrapbook/:id/workspace`. **Source
says `/scrapbook/:id/edit`** (`App.jsx` ≈ line 130, also `WorkspaceScreen`
back-button target `/scrapbook/${id}`). Use `/edit` as the canonical
path; the file is still `WorkspaceScreen.jsx`. CLAUDE.md is wrong on the
path; flag this in a later CLAUDE.md cleanup commit.

CLAUDE.md also says Discovery is `/discovery`. **Source says `/discover`**.
Same drift; use `/discover`.

### `RemixPayload` (Discovery remix-mode params)

When Remix or Surprise Me hands off to Discovery it passes a payload via
React Router `location.state`:

```ts
type RemixPayload = {
  clips: Clip[]              // pre-shuffled, pre-flattened
  isRemix: true
  screenTitle: 'Film Fest' | 'Surprise Me'
}
```

In native, this maps to a `Discovery` stack param. **Don't try to push
the entire `clips` array through navigation params on iOS** — it has a
soft size limit (params are serialized into the URL-like state, and large
arrays bloat memory). Instead:

```ts
// In Remix screen, before navigation:
import { setRemixPayload } from '../lib/remixHandoff'   // tiny module-scope ref
setRemixPayload({ clips, isRemix: true, screenTitle: 'Surprise Me' })
navigation.navigate('Discovery', { fromRemix: true })

// In Discovery screen:
const payload = consumeRemixPayload()
```

A 30-line "handoff buffer" module is cleaner than serializing 50–100 clip
objects through native param storage. See `lib/dataCache.js` for the
existing PWA pattern that's already this shape — port that to RN with
the same API.

### Wildcard / 404

PWA: `<Route path="*"> → Navigate to "/"`. Anything unknown falls back to
Home. Native equivalent: in stack navigation there's no 404; deep links
that fail should fall through to `Home`. Wire this via the deep-link
config on `NavigationContainer`:

```ts
linking: {
  prefixes: ['cassette://', 'https://cassette.app'],   // adjust to actual scheme
  config: {
    screens: { Home: '/', ScrapbookDetail: 'scrapbook/:scrapbookId', ... },
  },
  getStateFromPath: (path, config) => {
    const state = defaultGetStateFromPath(path, config)
    return state ?? { routes: [{ name: 'Home' }] }  // 404 → Home
  },
}
```

(Deep-link wiring is Day-N work, not blocking the port — but the moment
the app handles `cassette://reset-password?token=…` for password recovery
this needs to be in place.)

---

## 2. Auth gate — the "is there a session?" question

### PWA shape

`App.jsx` wraps the protected route block in an `<AuthGate>`:

- `<AuthGate>` reads `session` from `AuthContext`:
  - `session === undefined` → loading screen (spinner)
  - `session === null` → `<LoginScreen />` rendered in place (no route change)
  - `session === Session` → `children` (the protected routes)
- `LoginScreen` itself is *also* available at `/login` as a public route
  so the URL is preserved if someone hits it directly.
- `SignupScreen` and `ResetPasswordScreen` are *outside* `AuthGate`
  entirely — fully public.

### Native shape (current `App.tsx`)

The current native `App.tsx` does almost the same thing, but the public
stack only contains `Login`:

```tsx
{session ? (
  <Stack.Navigator>
    <Stack.Screen name="Home" .../>
    <Stack.Screen name="Playback" .../>
  </Stack.Navigator>
) : (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Login" component={LoginScreen} />
  </Stack.Navigator>
)}
```

Two gaps:

1. **No `Signup` or `ResetPassword` route in the public stack.** This
   needs to be fixed before the wife (or any new tester) can sign up —
   the canonical sign-up path is "text the `/signup` URL to a new family
   member, they open it." Native equivalent is a "Create account" button
   on `LoginScreen` that navigates to the `Signup` stack screen plus deep
   link handling.
2. **Splash logic** at `App.tsx:64–69` shows an `ActivityIndicator` while
   fonts + session load. Replace with the cassette reel (per the brand
   doc) before this ships to anyone non-engineer.

### Recommended native auth-stack structure

```tsx
const PublicStack = createNativeStackNavigator<PublicStackParamList>()
const AppStack    = createNativeStackNavigator<AppStackParamList>()

function PublicNavigator() {
  return (
    <PublicStack.Navigator screenOptions={{ headerShown: false }}>
      <PublicStack.Screen name="Login"         component={LoginScreen} />
      <PublicStack.Screen name="Signup"        component={SignupScreen} />
      <PublicStack.Screen name="ResetPassword" component={ResetPasswordScreen} />
    </PublicStack.Navigator>
  )
}

function AppNavigator() {
  return (
    <AppStack.Navigator screenOptions={{
      headerStyle: { backgroundColor: colors.walnut },
      headerTintColor: colors.amber,
      // ...
    }}>
      <AppStack.Screen name="Home"             component={HomeScreen} options={{ title: 'Scrapbooks' }} />
      <AppStack.Screen name="ScrapbookDetail"  component={ScrapbookDetailScreen} options={{ headerShown: false }} />
      <AppStack.Screen name="Playback"         component={PlaybackScreen}        options={{ headerShown: false }} />
      <AppStack.Screen name="Workspace"        component={WorkspaceScreen}       options={{ headerShown: false }} />
      <AppStack.Screen name="Share"            component={ShareScreen} />
      <AppStack.Screen name="Intake"           component={IntakeScreen}          options={{ headerShown: false, presentation: 'modal' }} />
      <AppStack.Screen name="Discovery"        component={DiscoveryScreen}       options={{ headerShown: false }} />
      <AppStack.Screen name="Remix"            component={RemixScreen}           options={{ headerShown: false }} />
      <AppStack.Screen name="Settings"         component={SettingsScreen} />
    </AppStack.Navigator>
  )
}
```

**Why `headerShown: false` on most screens?** The PWA renders its own
custom headers (the safe-area-aware row with circular back-button glyphs
and frosted-glass treatment). React Navigation's default header looks
like an iOS settings page — wrong for Cassette. Render your own header
inside each screen and disable RN's.

**Why `presentation: 'modal'` on Intake?** It's the upload flow — comes
from a `+` FAB on Home, goes back to Home or to the new scrapbook detail.
Modal-style presentation (slides up from bottom instead of right→left
push) reads as "this is a different mode, you're committing to
something." Matches the PWA's mental model where Intake is its own
landscape.

### Splash / boot

The PWA has an `<AppInit>` gate that downloads the FFmpeg WASM bundle on
first login (~5MB, cached after) and shows a "Setting up your experience"
screen during it. **Native has no equivalent** — there's no WASM to
download. The native boot is just `useFonts()` + `getSession()`. Keep
the splash dead simple: cassette reel + nothing else, no copy. (PWA's
`AppInit` shows copy because the wait is 2–8s and unexplained silence
would scare mom. Native boot is sub-second; copy would feel padded.)

### Background upload banner

PWA renders `<UploadBanner>` as a fixed top-bar across the entire app
when `UploadContext.isActive === true` — a row with a small spinning
reel and "Uploading N more clips…" text. It's visible on Home, Detail,
Settings, etc. — anywhere except during an *active* upload session
(Intake).

Native equivalent: top-level component rendered inside `AppNavigator`
above the stack:

```tsx
<View style={{ flex: 1 }}>
  <UploadBanner />
  <AppStack.Navigator>...</AppStack.Navigator>
</View>
```

…**but only after Intake exists**, so this is Day-N. The current native
build (Home + Playback) doesn't need it yet.

---

## 3. Edge graph — every navigation transition in source

Each arrow below is a navigation that's wired up in the PWA. PWA call
uses React Router's `navigate(path)`; native call uses
`navigation.navigate('ScreenName', params)` or `navigation.goBack()`.

> *Format:* `From → To · Trigger · PWA code · Native call`

### From `Home`

| Trigger | To | PWA | Native |
|---|---|---|---|
| Tap a scrapbook card (own) | `ScrapbookDetail` | `navigate('/scrapbook/' + id)` | `navigation.navigate('ScrapbookDetail', { scrapbookId: id })` |
| Tap a shared scrapbook card | `ScrapbookDetail` | same as above | same |
| Tap `+` FAB | `Intake` (new scrapbook) | `navigate('/intake')` | `navigation.navigate('Intake', {})` |
| Tap Shuffle icon (top-right) | `Remix` (Film Fest) | `navigate('/remix')` | `navigation.navigate('Remix')` |
| Tap Settings icon (top-right) | `Settings` | `navigate('/settings')` | `navigation.navigate('Settings')` |
| *(implicit)* sign-out from settings | (re-render → Login) | `supabase.auth.signOut()` | same — auth state listener kicks the stack |

Home is the root of the protected stack — no back button.

### From `ScrapbookDetail`

| Trigger | To | PWA | Native |
|---|---|---|---|
| Tap `← Library` button | `Home` | `navigate('/')` | `navigation.goBack()` *or* `navigation.popToTop()` |
| Tap "Watch" CTA | `Playback` | `navigate('/scrapbook/' + id + '/watch')` | `navigation.navigate('Playback', { scrapbookId, scrapbookName })` |
| Tap "Edit" button (owner) | `Workspace` | `navigate('/scrapbook/' + id + '/edit')` | `navigation.navigate('Workspace', { scrapbookId })` |
| Tap "Share" button (owner) | `Share` | `navigate('/scrapbook/' + id + '/share')` | `navigation.navigate('Share', { scrapbookId })` |
| Tap "Add Clips" *(not in detail; in workspace tool row)* | `Intake` (add-to-existing) | `navigate('/intake?addTo=' + id)` | `navigation.navigate('Intake', { addToScrapbookId: id })` |
| Delete confirmed | `Home` | `navigate('/', { replace: true })` | `navigation.reset({ index: 0, routes: [{ name: 'Home' }] })` |

The `replace: true` after delete is important. Without it, hitting back
from Home would return to the now-deleted detail screen. Native:
`navigation.reset(...)` is the right equivalent.

### From `Playback`

| Trigger | To | PWA | Native |
|---|---|---|---|
| Tap back arrow (top-left) | `Home` | `navigate('/')` | `navigation.goBack()` *if from Detail* / `popToTop()` *if from Discovery* — see below |
| Three-dot menu → "Edit Scrapbook" | `Workspace` | `navigate('/scrapbook/' + id + '/edit')` | `navigation.navigate('Workspace', { scrapbookId })` |
| Three-dot menu → "Share Scrapbook" | `Share` | `navigate('/scrapbook/' + id + '/share')` | `navigation.navigate('Share', { scrapbookId })` |
| Three-dot menu → "Export as Video" | *(stays on Playback)* | overlay UI | overlay UI |

**Subtle thing about the back button on Playback:** the PWA always goes
to `/` (Home), regardless of where the user came from. In native, the
right behavior is `goBack()` — that returns the user to Detail if they
came from Detail, Home if they came from Home via deep link, etc. Match
the *intent* (don't trap the user on Playback), not the exact PWA
behavior. The PWA hardcodes `/` because React Router has no "previous
route" concept on URL-based nav.

### From `Workspace`

| Trigger | To | PWA | Native |
|---|---|---|---|
| Tap `←` back arrow | `ScrapbookDetail` | `navigate('/scrapbook/' + id)` | `navigation.goBack()` |
| Tap "Save" pill (right) | `ScrapbookDetail` | `navigate('/scrapbook/' + id)` | `navigation.goBack()` *or* `navigate('ScrapbookDetail', { scrapbookId: id })` |
| Add Clips tool → tap | `Intake` (add-to-existing) | `navigate('/intake?addTo=' + id)` | `navigation.navigate('Intake', { addToScrapbookId: id })` |

Save and Back have the same destination — Save is just a fancier "Back"
visually (and it's *not* the "save changes" button: changes are
auto-saved continuously and Save is purely a navigation affordance).
This is a UX intention worth preserving exactly in native: "you don't
have to push Save to keep your work; we already did."

### From `Discovery`

| Trigger | To | PWA | Native |
|---|---|---|---|
| Tap `←` back (library mode) | `Home` | `navigate('/')` | `navigation.goBack()` |
| Tap `←` back (remix mode) | `Remix` | `navigate('/remix')` | `navigation.goBack()` |
| Tap "Watch →" link in bottom info (library mode) | `ScrapbookDetail` (of current clip's scrapbook) | `navigate('/scrapbook/' + currentClip.scrapbook.id)` | `navigation.navigate('ScrapbookDetail', { scrapbookId })` |
| Disc3 icon → "Go to this scrapbook" (remix mode) | `ScrapbookDetail` | same as above | same |

### From `Intake`

| Trigger | To | PWA | Native |
|---|---|---|---|
| Tap `←` back from pick screen | `Home` *(new mode)* or `ScrapbookDetail` *(add-to mode)* | `navigate(-1)` | `navigation.goBack()` |
| Cancel button on upload overlay | `Home` *(new mode)* or `ScrapbookDetail` *(add-to mode)* | `navigate(-1)` after `releaseWakeLock()` | `navigation.goBack()` after wake-lock release |
| "Create Scrapbook" success (new) | `ScrapbookDetail` of newly created | `navigate('/scrapbook/' + newId, { replace: true })` | `navigation.reset({ index: 0, routes: [{ name: 'Home' }, { name: 'ScrapbookDetail', params: { scrapbookId: newId } }] })` |
| "Add clips" success (add-to) | `Workspace` of target scrapbook | `navigate('/scrapbook/' + addToId + '/edit', { replace: true })` | `navigation.reset(...)` similar to above |

The `replace: true` after Intake creates a new scrapbook is important —
the user shouldn't be able to swipe-back into the upload overlay after
it's done. `navigation.reset` is the right native primitive.

### From `Remix`

| Trigger | To | PWA | Native |
|---|---|---|---|
| Tap `←` back (studio) | `Home` | `navigate('/')` | `navigation.goBack()` |
| "Watch" → loading → done | `Discovery` (remix mode) | `navigate('/discover', { state: { clips, isRemix: true, screenTitle: 'Film Fest' } })` | `setRemixPayload(...); navigation.navigate('Discovery', { fromRemix: true })` |
| "Surprise Me" → loading → done | `Discovery` (remix mode) | same with `screenTitle: 'Surprise Me'` | same |
| Cancel on loading screen | *(stays in Remix on previous phase)* | `cancelledRef.current = true` | same |
| "Save as Scrapbook" (combine) success | `ScrapbookDetail` of new combined scrapbook | `navigate('/scrapbook/' + newId)` | `navigation.navigate('ScrapbookDetail', { scrapbookId: newId })` |

### From `Settings`

| Trigger | To | PWA | Native |
|---|---|---|---|
| Tap `←` back | `Home` | `navigate('/')` | `navigation.goBack()` |
| Sign out | (auto → Login) | `supabase.auth.signOut()` | same; AuthContext listener fires the public stack |

### From `Share`

| Trigger | To | PWA | Native |
|---|---|---|---|
| Tap `←` back | `ScrapbookDetail` (or whatever pushed Share) | `navigate(-1)` | `navigation.goBack()` |

### From `Login` (public)

| Trigger | To | PWA | Native |
|---|---|---|---|
| Successful sign-in | `Home` *(auto-stack-swap)* | session listener fires | session listener fires; the `App.tsx` outer ternary re-renders into the protected stack |
| Tap "Create Account" | `Signup` | `navigate('/signup')` | `navigation.navigate('Signup')` |
| Tap "Forgot password?" | *(opens reset modal inline)* | local state | local state — keep the modal pattern in native |

### From `Signup` (public)

| Trigger | To | PWA | Native |
|---|---|---|---|
| Tap `←` back ("Already have an account? Sign in") | `Login` | `navigate('/')` | `navigation.goBack()` |
| Successful signup | *(shows "Check your email" inline; no navigation)* | local state | local state |

### From `ResetPassword` (public, via deep link)

| Trigger | To | PWA | Native |
|---|---|---|---|
| Successful password update → "Open Cassette" | `Login` *(then auth flow re-runs)* | `navigate('/')` | `navigation.navigate('Login')` |
| Link expired → "Back to sign in" | `Login` | `navigate('/')` | `navigation.navigate('Login')` |

`ResetPassword` is the only screen that depends on a Supabase deep link.
Wire it up via Universal Links / a custom URL scheme in
`app.config.js` once you reach the auth-screens phase — see
`screens/reset-password.md`.

---

## 4. Stack ordering & "where am I when I press back"

A user journey worth tracing because it's the most common path:

```
Home
  └─ tap card →  ScrapbookDetail
                  └─ tap Edit →  Workspace
                                  └─ tap Save →  ScrapbookDetail (pop)
                                                  └─ tap Watch →  Playback
                                                                  └─ tap back →  ScrapbookDetail
                                                                                  └─ tap ←Library →  Home
```

That stack should "just work" with `navigation.goBack()` on each back
press in native because each navigation is a `push`. **Do not call
`navigate('Home')` from inside Workspace** — that pushes a *new* Home on
top instead of popping. Always use `goBack()` for back arrows; reserve
`navigate('XYZ', ...)` for forward navigation.

**Exceptions where you do want `reset` instead of `push`:**

1. After deleting a scrapbook from Detail — you don't want back to return
   to a 404 page.
2. After successful Intake create — same logic; the upload overlay is gone
   and there's nothing to go back to.
3. After Remix "Save as Scrapbook" combine — same logic; the source
   scrapbooks still exist but the user just made a new one and wants to
   land there.

For (1) and (2): use `navigation.reset({ index: 0, routes: [...] })`.

For (3): a regular `navigate('ScrapbookDetail', ...)` is fine — the user
*does* want to be able to go back and look at the filters they used.

---

## 5. Transitions and presentation styles

Native-stack on iOS gives you these presentation modes via the
`presentation` option:

| Mode | When to use |
|---|---|
| `card` (default) | Standard left→right push for navigation within a context (Home → Detail → Playback) |
| `modal` | Intake (a separate task), Settings (could be either, but card reads fine), Share (could be either) |
| `transparentModal` | The "Coming soon" toast in Remix (one-shot full-screen modal with translucent backdrop) |
| `fullScreenModal` | Playback could be argued for this — but the PWA treats Playback as a regular route, so keep `card`. |

Recommended:

- `Playback`, `Workspace`, `Discovery`: `card` (default). They're "deeper
  into" the same context; horizontal push reads right.
- `Intake`: `modal`. It's a different mode of work — slide up from the
  bottom on iOS matches the user's mental model ("I'm going to add
  things").
- `Settings`: `card`. Standard secondary screen.
- `Remix`: `card`. It *is* a different mode but visually it's another
  full library view; modal would be jarring.
- `Login` / `Signup` / `ResetPassword`: `card` *within the public
  stack*. The whole public stack is below the protected stack — moving
  between them is an auth-state event, not a navigation event.

The native-stack iOS swipe-back gesture (drag from left edge) is on by
default on `card`-presented screens. **Leave it on.** Playback and
Discovery both explicitly `e.preventDefault()` on horizontal swipes that
move *right* (toward "back") when not at the first clip — that translates
to native via `gestureEnabled: false` *only on those two screens*. See
`screens/playback.md` for the precise rule.

---

## 6. Header rendering convention

PWA "headers" are always rendered inside the screen body — there's no
separate header bar slot. Native should match this. The current native
code already does this on Playback (custom top row with insets-aware
positioning) and is doing it the React Navigation default way on Home
(letting the stack header render "Scrapbooks"). **Switch Home to a
custom header too** when you port the real Home UI — the PWA renders a
two-row header with the logo, three icon buttons, the search input,
the tab bar, and the section greeting — none of which fits in
`headerRight` etc.

Pattern to follow (used in `screens/PlaybackScreen.tsx` today):

```tsx
const insets = useSafeAreaInsets()

return (
  <View style={{ flex: 1, backgroundColor: colors.walnut }}>
    <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, /* ... */ }}>
      {/* custom header content */}
    </View>
    {/* screen body */}
  </View>
)
```

Set `options={{ headerShown: false }}` on the `Stack.Screen` so the
native header doesn't double up.

---

## 7. Deep link surface area (for later)

Two situations where the app needs to handle URLs:

1. **Password recovery.** Supabase emails a link of the shape
   `https://<your-domain>/reset-password#access_token=…&type=recovery`.
   The Expo app must register that scheme (or use Universal Links) and
   route to `ResetPassword`. The Supabase JS SDK will pick up the hash
   automatically when the screen mounts and fire the
   `PASSWORD_RECOVERY` event.
2. **Signup confirmation.** Supabase sends a confirmation email with a
   link that, on click, signs the user in. Same routing needs.

This isn't blocking the per-screen port work. Mark it as a follow-up in
`screens/reset-password.md` and `screens/signup.md`.

---

## 8. Drift summary (CLAUDE.md vs. source)

| CLAUDE.md says | Source actually does |
|---|---|
| Workspace route is `/scrapbook/:id/workspace` | `/scrapbook/:id/edit` |
| Discovery route is `/discovery` | `/discover` |
| 11 screens total | 12 (`ResetPasswordScreen.jsx` counts) |
| Playback: "Swipe up/down between clips" | **Horizontal** swipe, no vertical (see `screens/playback.md`) |
| Discovery: "Vertical = next clip. Horizontal = next scrapbook" | **Horizontal between clips**; no swipe between scrapbooks at all (see `screens/discovery.md`) |

The native port should follow source, not CLAUDE.md. Once docs land, a
separate PR can correct CLAUDE.md on the web side.

---

*Cross-references:* see `02-interactions-glossary.md` for the gesture
vocabulary used inside each screen, `03-data-model.md` for the
Supabase tables that screens read/write, and each `screens/*.md` for
per-screen layout + state.
