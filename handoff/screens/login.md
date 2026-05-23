# screens/login.md — Login

> **What it is.** The public sign-in page. Email *or* username +
> password. "Forgot password?" opens an inline modal (same screen, no
> route change). "Create Account" navigates to Signup.

Route: `/login` (public; also rendered by AuthGate when no session)
· File: `kasette/app/src/screens/LoginScreen.jsx` (177 lines)
· Native counterpart (already exists in v0.1):
`kasette-native/screens/LoginScreen.tsx`

---

## 1. Purpose & user mental model

She received a TestFlight invite and a `/signup` URL. She signed up.
Now she opens the app and lands here. She types her username (or her
email — both work), her password, taps Sign In. Done.

If she forgot her password, "Forgot password?" runs the reset flow
inline (no separate screen for the request).

If she's never signed up, "Create Account" routes to Signup.

---

## 2. Layout

```
┌──────────────────────────────────────────────────┐
│                                                  │
│                                                  │
│                   Cassette                       │  ← Fraunces italic 56 px, amber
│           your family video scrapbook            │  ← rust 14 px sans
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  Name or email                             │  │  ← text input
│  └────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────┐  │
│  │  Password                                  │  │  ← password input
│  └────────────────────────────────────────────┘  │
│                                                  │
│  (error, conditional)                            │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │           Sign In                          │  │  ← amber pill, py-4
│  └────────────────────────────────────────────┘  │
│                                                  │
│        Forgot password?                          │  ← rust text link
│                                                  │
│  ──────── New to Cassette? ────────              │  ← divider w/ inline label
│  ┌────────────────────────────────────────────┐  │
│  │         Create Account                     │  │  ← outlined pill
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

### Forgot password inline modal (same screen, `showReset` state)

```
┌──────────────────────────────────────────────────┐
│                   Cassette                       │
│           your family video scrapbook            │
│                                                  │
│              Reset password                      │  ← Fraunces SemiBold 20 px, wheat
│  Enter your email and we'll send a reset link.   │  ← rust 14 px
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  Email address                             │  │
│  └────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────┐  │
│  │       Send Reset Link                      │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│           Back to sign in                        │  ← rust text link
└──────────────────────────────────────────────────┘
```

### After reset email sent (still inline)

```
┌────────────────────────────────────────────┐
│  Check your email                          │
│  We sent a password reset link to          │
│  joelle@example.com.                       │
│  Check your spam folder if you don't see it.│
└────────────────────────────────────────────┘
```

### Measurements

| Element | Style |
|---|---|
| Container | `flex flex-col items-center justify-center min-h-screen bg-walnut px-6` |
| Logo | Fraunces italic, **56 px**, amber, `letter-spacing: -1px`, `line-height: 1.0` |
| Subtitle | rust 14 px sans, `mt-2` |
| Form | full-width, `max-w-sm`, gap-4 |
| Input | rounded-xl, `px-4 py-4`, walnut-mid bg, walnut-light border (amber on focus) |
| CTA | rounded-full, amber, `py-4`, sans semibold, **walnut text** |
| Outlined CTA (Create Account) | rounded-full, walnut-light border, **wheat text**, `py-4` |
| "New to Cassette?" divider | rust 12 px caps, walnut-light flanking lines |
| Error | sienna 14 px, centered |

---

## 3. State machine

```ts
const [identifier, setIdentifier] = useState('')      // email or username
const [password, setPassword] = useState('')
const [error, setError] = useState<string|null>(null)
const [loading, setLoading] = useState(false)

// Forgot password flow (inline)
const [showReset, setShowReset] = useState(false)
const [resetEmail, setResetEmail] = useState('')
const [resetSent, setResetSent] = useState(false)
const [resetLoading, setResetLoading] = useState(false)
const [resetError, setResetError] = useState<string|null>(null)
```

---

## 4. Data fetches

### Sign in

```ts
async function handleSubmit() {
  setError(null)
  setLoading(true)
  try {
    let email = identifier.trim()
    if (!email.includes('@')) {
      // It's a username — look up the email
      const { data } = await supabase.rpc('get_email_by_username', { p_username: email.toLowerCase() })
      if (!data) {
        setError('Name not found. Try your email address instead.')
        setLoading(false)
        return
      }
      email = data
    }
    await signIn(email, password)
    // AuthContext fires the state change; AppNavigator swaps stacks
  } catch {
    setError('Wrong name or password.')
  } finally {
    setLoading(false)
  }
}
```

### Reset password

```ts
async function handleResetPassword() {
  setResetError(null)
  setResetLoading(true)
  const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
    redirectTo: `${window.location.origin}/reset-password`,
  })
  setResetLoading(false)
  if (error) setResetError(error.message)
  else setResetSent(true)
}
```

For native, replace `window.location.origin + '/reset-password'` with a
deep-link URL: `cassette://reset-password` (matching the URL scheme set
in `app.config.js`).

---

## 5. Every interaction

### 5.1 Sign In submit

Enter on either field or tap "Sign In" → `handleSubmit()`. Button shows
"Signing in…" while loading.

### 5.2 Forgot password

Tap "Forgot password?" → `setShowReset(true)` → renders the reset
form in place. No route change.

### 5.3 Send Reset Link

Tap → `handleResetPassword()`. On success → "Check your email" card.

### 5.4 Back to sign in

Tap (visible on either the form or the post-send card) → resets all
reset state and shows the sign-in form again.

### 5.5 Create Account

Tap → `navigate('/signup')`. Native: `navigation.navigate('Signup')`.

---

## 6. Animations & micro-feel

- Tap-feedback: amber CTA `active:opacity-80`, outlined CTA same. Native
  via `Pressable`'s pressed state.
- Input focus: border transitions from walnut-light to amber over
  `0.15s`. Native: bind a `borderColor` state on `onFocus`/`onBlur`.
- No screen-level enter animation. Comes in instantly.

---

## 7. Empty / loading / error states

- Loading: button label changes to "Signing in…" / "Sending…".
- Error: sienna text below the form.
- Generic error message: "Wrong name or password." (intentionally
  doesn't reveal which is wrong — security best practice).
- Username not found: specific message: "Name not found. Try your email
  address instead." (because the lookup happens before signIn).

---

## 8. Known gotchas

- **Username → email lookup happens BEFORE signIn.** Adds one network
  round-trip when the user types a username. Don't optimize this away
  (we still need the email for `signInWithPassword`).
- **`auto-fill`**: `autoComplete="username"` on the identifier field
  and `autoComplete="current-password"` on the password field let iOS
  pre-fill from Keychain.
- **Reset uses `resetPasswordForEmail`** — Supabase sends an email with
  a recovery link. The recovery session is established when the user
  clicks the link, not when they submit the form.
- **The reset form is inline, not a route.** This avoids the user
  losing their typed identifier when toggling. Native: same — local
  state, not navigation.

---

## 9. Native translation notes

The native LoginScreen already exists and is close to right. Specific
updates needed:

### 9.1 Already correct in native code

- Email + password inputs with proper `autoComplete` and `keyboardType`.
- KeyboardAvoidingView wrapping the form.
- Brand-colored CTA (amber pill, walnut text, sans semibold).
- Loading state with `ActivityIndicator color={colors.walnut}` inside the
  button (good — better than a label change).
- Generic error: "Wrong email or password."

### 9.2 Gaps to fix

1. **Identifier should accept username, not just email.** Add the RPC
   lookup before `signInWithPassword`. Match `handleSubmit` from §4.
2. **Add a "Create Account" outlined button** → `navigation.navigate('Signup')`.
3. **Add "Forgot password?" link** → set local `showReset` state →
   render the reset form (same screen).
4. **Cassette logo** — current native uses `fontFamily: displayItalic`
   at 56 px, amber. Matches the PWA. Verify the exact letter-spacing
   (`-1` per PWA `tracking-tight`).
5. **Subtitle** "your family video scrapbook" already there. Keep.
6. **Deep-link redirect for reset.** Native `resetPasswordForEmail`
   needs `redirectTo: 'cassette://reset-password'` (or whatever scheme
   is configured).
7. **Replace the splash `<ActivityIndicator>` in App.tsx** with the
   cassette reel. The loading-before-fonts state currently shows a
   stock RN spinner — wrong feel.

### 9.3 Suggested file structure

Add a `<ResetPasswordModal>` subcomponent within `LoginScreen.tsx` (or
a separate file) to keep the file readable. The PWA's inline pattern
works in native — render the reset UI based on `showReset` state in
the same component.

### 9.4 Deep-link config (Day-N)

In `app.config.js`:

```js
ios: {
  bundleIdentifier: 'com.drivercyber.cassette',
  associatedDomains: ['applinks:cassette.app'],     // when domain is live
},
scheme: 'cassette',                                  // for cassette:// URLs
```

In `App.tsx`:

```tsx
import { LinkingOptions } from '@react-navigation/native'

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['cassette://', 'https://cassette.app'],
  config: {
    screens: {
      ResetPassword: 'reset-password',
      // ...
    },
  },
}

<NavigationContainer linking={linking} theme={navTheme}>
```

---

## 10. Test plan

- [ ] Type email + password → Sign In → goes to Home.
- [ ] Type username (not email) + password → Sign In → username lookup
      → resolves to email → signin → Home.
- [ ] Wrong password → "Wrong email or password." (or "Wrong name…")
- [ ] Username not found → "Name not found. Try your email…"
- [ ] Tap "Forgot password?" → reset form replaces sign-in form (same
      screen).
- [ ] Send reset email → "Check your email" card.
- [ ] Click reset email link → opens app → ResetPassword screen with
      recovery session.
- [ ] "Back to sign in" → returns to sign-in form, state cleared.
- [ ] Tap "Create Account" → Signup screen.

---

*Cross-references:* `00-brand-system.md` §2 (Fraunces italic logo);
`01-navigation-flow.md` §2 (public stack); `03-data-model.md` §5
(`get_email_by_username` RPC); `screens/signup.md`,
`screens/reset-password.md`.
