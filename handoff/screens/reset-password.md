# screens/reset-password.md — Reset Password

> **What it is.** The page the user lands on after clicking the
> reset-password email link. Supabase's SDK exchanges the URL fragment
> for a temporary recovery session, then the user picks a new password.

Route: `/reset-password` (public, deep-linked) · File:
`kasette/app/src/screens/ResetPasswordScreen.jsx` (141 lines) · Native:
not yet ported.

---

## 1. Purpose & user mental model

She clicked the reset-password link in her email. Her browser opens
`https://cassette.app/reset-password#access_token=...&type=recovery`.
The Supabase JS SDK parses the fragment, fires
`onAuthStateChange('PASSWORD_RECOVERY')` with a recovery session, and
this screen unlocks its form.

She types a new password twice, taps Update Password. She's signed in.

---

## 2. Layout

### While recovery session is loading (≤ 4 s)

```
┌──────────────────────────────────────────────────┐
│                   Cassette                       │
│           your family video scrapbook            │
│                                                  │
│              [amber spinner]                     │  ← waiting for SDK
└──────────────────────────────────────────────────┘
```

### Recovery session active (form visible)

```
┌──────────────────────────────────────────────────┐
│                   Cassette                       │
│           your family video scrapbook            │
│                                                  │
│              Reset password                      │  ← Fraunces SemiBold 20 px
│  Enter a new password to finish resetting.       │  ← rust 14 px
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  New password                              │  │
│  └────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────┐  │
│  │  Confirm new password                      │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  (error, conditional)                            │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │           Update Password                  │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

### Link expired / invalid (after 4 s timeout with no recovery event)

```
┌────────────────────────────────────────────┐
│  Link expired                              │
│  This reset link is no longer valid.       │
│  Request a new one from the sign-in page.  │
│  ┌──────────────────────────────────────┐  │
│  │     Back to sign in                  │  │
│  └──────────────────────────────────────┘  │
└────────────────────────────────────────────┘
```

### After password updated

```
┌────────────────────────────────────────────┐
│  Password updated                          │
│  You're signed in. Welcome back.           │
│  ┌──────────────────────────────────────┐  │
│  │     Open Cassette                    │  │
│  └──────────────────────────────────────┘  │
└────────────────────────────────────────────┘
```

---

## 3. State machine

```ts
const [ready, setReady] = useState(false)              // recovery session active
const [invalid, setInvalid] = useState(false)          // 4s timeout fired with no recovery
const [success, setSuccess] = useState(false)          // password updated
const [password, setPassword] = useState('')
const [confirm, setConfirm] = useState('')
const [error, setError] = useState<string|null>(null)
const [loading, setLoading] = useState(false)
```

### Mount effect

```ts
useEffect(() => {
  // Check existing session (in case the page was refreshed mid-recovery)
  supabase.auth.getSession().then(({ data }) => {
    if (data.session) setReady(true)
  })

  // Listen for PASSWORD_RECOVERY event
  const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY' && session) {
      setReady(true)
    }
  })

  // Safety timeout — if neither fired in 4s, the link is invalid
  const t = setTimeout(() => {
    if (!ready) setInvalid(true)
  }, 4000)

  return () => {
    subscription.subscription.unsubscribe()
    clearTimeout(t)
  }
}, [])
```

---

## 4. Data fetches & writes

```ts
async function handleUpdate() {
  setError(null)
  if (password !== confirm) { setError("Passwords don't match."); return }
  if (password.length < 6) { setError('Password must be at least 6 characters.'); return }

  setLoading(true)
  const { error: updateError } = await supabase.auth.updateUser({ password })
  setLoading(false)

  if (updateError) {
    setError(updateError.message)
    return
  }

  setSuccess(true)
}
```

The recovery session is *active* when `updateUser` runs, so the
password update succeeds without a current-password check.

---

## 5. Every interaction

### 5.1 Wait for recovery event (no UI interaction needed)

The user did the interaction in the email client. This screen just
waits for the SDK to surface the recovery session.

### 5.2 Submit new password

Tap "Update Password" → validates → calls `supabase.auth.updateUser({ password })`.

### 5.3 Open Cassette (after success)

`navigate('/')` → user is now signed in → AuthGate renders Home.

### 5.4 Back to sign in (invalid link)

`navigate('/')` → renders Login.

---

## 6. Animations & micro-feel

Same input-focus and button-press patterns as Login. No screen-level
animations.

---

## 7. Empty / loading / error states

### Loading recovery session

4-second window. Spinner. PWA uses a generic amber spinner; native
should use the cassette reel (smaller — this is a brief wait).

### Link expired

After 4s with no recovery event → "Link expired" UI with back-to-login
CTA.

### Update error

Supabase error message passthrough (sienna text).

---

## 8. Known gotchas

- **The recovery session is temporary.** Expires after the password
  update or in ~24 hours (whichever first). Signing in after the
  update doesn't require the new password to be re-entered — they're
  already signed in via the recovery session.
- **PWA uses `detectSessionInUrl: true`** (the default) so the SDK
  picks up the URL fragment automatically. Native uses
  `detectSessionInUrl: false`, so reset-password requires a different
  approach — see §9 below.
- **The 4-second timeout** prevents the user from sitting on a
  perpetual spinner if the link is malformed. Reasonable balance —
  most networks deliver the event within 500 ms.
- **getSession() check** handles the page-refresh case: if the user
  refreshes the page mid-recovery, the SDK has the session in
  localStorage; the event won't fire again, but `getSession()` returns
  it.

---

## 9. Native translation notes

### The big one: how does the recovery session reach the app?

PWA: user clicks email link → opens browser at
`https://cassette.app/reset-password#access_token=…` → Supabase JS
SDK reads the hash, sets the session, fires `PASSWORD_RECOVERY`.

Native: the email link **can't open the app's URL fragment directly** —
the link points to a web URL. Three options:

#### Option A — Web bounce with deep link (recommended)

1. The reset email sends users to the *web* PWA's `/reset-password`.
2. The web page detects "this user is on iOS Safari with the app
   installed" (via a small JS snippet checking for the URL scheme).
3. The web page redirects to
   `cassette://reset-password#access_token=...&type=recovery`.
4. The app opens. Set `detectSessionInUrl: true` *only on the reset
   screen* (or detect the fragment manually and call
   `supabase.auth.setSession({ access_token, refresh_token })`).

#### Option B — Use Supabase's mobile redirect

Set `resetPasswordForEmail(email, { redirectTo: 'cassette://reset-password' })`.
The reset email link points directly to the `cassette://` scheme.
Click → opens app → URL fragment received via React Navigation's
`linking.getInitialURL()`.

```ts
// In ResetPasswordScreen, on mount:
useEffect(() => {
  const url = ... // get from Linking or initial deep link
  const hash = url.split('#')[1] || ''
  const params = new URLSearchParams(hash)
  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')
  const type = params.get('type')
  if (type === 'recovery' && accessToken && refreshToken) {
    supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).then(() => {
      setReady(true)
    })
  }
}, [])
```

This requires the user's email client to support deep-link URLs — iOS
Mail / Gmail apps both do. The exchange must be done via
`auth.setSession`, not by setting `detectSessionInUrl: true` (which
would conflict with the native client config).

**Recommendation:** option B for native.

#### Option C — Magic-link via OTP / PIN (Day-N polish)

Send a 6-digit code instead of a link. User types the code in the
app. More mom-friendly than fiddling with email links. Not v1 work.

### Recommended stack

- `TextInput` × 2 (new password, confirm).
- Same brand styles as Login.
- `Linking.getInitialURL()` from `expo-linking` to capture the deep
  link on cold launch.
- `Linking.addEventListener('url', ...)` to capture the deep link on
  warm launch.

### Deep-link wiring

In `app.config.js`:

```js
{
  scheme: 'cassette',
}
```

This makes `cassette://*` URLs open the app.

In `App.tsx`:

```tsx
import * as Linking from 'expo-linking'

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [Linking.createURL('/'), 'cassette://'],
  config: {
    screens: {
      ResetPassword: 'reset-password',
      // ...
    },
  },
}
```

### Defer for v0.5

If wife's first install (v0.1) doesn't need password reset (she just
signed up; she remembers her password), defer the whole flow to a
later milestone. **In scope:** simple no-op `ResetPassword` screen
that says "Use the web app to reset your password for now". **Out of
scope:** full deep-link reset.

---

## 10. Test plan

- [ ] Send reset email from Login's forgot-password flow.
- [ ] Click email link → opens app to ResetPassword screen → spinner
      for ≤ 4 s → form visible.
- [ ] Mismatched passwords → inline error.
- [ ] < 6 chars → inline error.
- [ ] Valid update → "Password updated" success card.
- [ ] "Open Cassette" → navigates to Home (signed in).
- [ ] Wait 4 s with no recovery event → "Link expired" UI.
- [ ] Cold-launch via deep link → ResetPassword screen renders
      correctly without a brief Home flash.

---

*Cross-references:* `00-brand-system.md` §2; `01-navigation-flow.md` §7
(deep-link surface area); `03-data-model.md` §1 (`detectSessionInUrl: false`
config); `screens/login.md` (the reset-password trigger lives there).
