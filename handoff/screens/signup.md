# screens/signup.md — Signup

> **What it is.** The public sign-up page. Four fields: display name,
> email, password, confirm password. The display name is shown as a
> live preview ("You'll sign in as joelle") because the username is
> derived from it (`toUsername(name)` = lowercased alphanumeric only).
>
> **The signup URL is the distribution mechanism.** New family members
> get the `/signup` URL via text from an existing user. No admin
> action. No invite-only.

Route: `/signup` (public, outside AuthGate) · File:
`kasette/app/src/screens/SignupScreen.jsx` (167 lines) · Native: not
yet ported.

---

## 1. Purpose & user mental model

She got a text from her cousin: "hey, I made you a Cassette,
cassette.app/signup". She taps the link. She lands here. She types
her name, an email, a password (twice). She gets a confirmation
email. She clicks the link, the email confirms, she's signed in.

Done. No payment, no team, no role selection.

---

## 2. Layout

```
┌──────────────────────────────────────────────────┐
│                   Cassette                       │
│           your family video scrapbook            │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  Your name (e.g. Joelle)                  │  │  ← display name input
│  └────────────────────────────────────────────┘  │
│  You'll sign in as joelle                        │  ← live preview (amber)
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  Email (for account recovery)              │  │
│  └────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────┐  │
│  │  Password                                  │  │
│  └────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────┐  │
│  │  Confirm password                          │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  (error, conditional)                            │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │           Create Account                   │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│        Already have an account? Sign in          │
└──────────────────────────────────────────────────┘
```

### After successful signup (replaces form)

```
┌────────────────────────────────────────────┐
│  Check your email                          │
│                                            │
│  We sent a confirmation link to            │
│  joelle@example.com.                       │
│                                            │
│  Tap it to activate your account, then     │
│  sign in as joelle.                        │
│                                            │
│        [ Back to sign in ]                 │
└────────────────────────────────────────────┘
```

---

## 3. State machine

```ts
const [displayName, setDisplayName] = useState('')
const [email, setEmail] = useState('')
const [password, setPassword] = useState('')
const [confirmPassword, setConfirmPassword] = useState('')
const [error, setError] = useState<string|null>(null)
const [loading, setLoading] = useState(false)
const [signupComplete, setSignupComplete] = useState(false)

// Derived
const username = toUsername(displayName)            // lowercased alphanumeric
```

### `toUsername` derivation

```ts
function toUsername(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}
```

So "Joelle Smith" → "joellesmith"; "Jó-Mom!" → "jmom".

---

## 4. Data fetches & writes

```ts
async function handleSubmit() {
  setError(null)

  const u = toUsername(displayName)
  if (!u) { setError('Please enter your name.'); return }
  if (password !== confirmPassword) { setError("Passwords don't match."); return }
  if (password.length < 6) { setError('Password must be at least 6 characters.'); return }

  setLoading(true)

  // 1. Check username availability
  const { data: available } = await supabase.rpc('check_username_available', { p_username: u })
  if (!available) {
    setError(`The name "${displayName}" is already taken. Try a different one.`)
    setLoading(false)
    return
  }

  // 2. Sign up
  const { error: signUpError } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: { username: u, display_name: displayName.trim() },
    },
  })

  setLoading(false)

  if (signUpError) {
    setError(signUpError.message)
    return
  }

  setSignupComplete(true)
}
```

A Supabase trigger reads `raw_user_meta_data` and inserts a `profiles`
row when the user confirms via email link.

---

## 5. Every interaction

### 5.1 Type display name

Live preview updates: "You'll sign in as joelle" (amber).

If `displayName` is empty, the preview is hidden.

### 5.2 Submit

Validates (see §4). On success: replaces form with "Check your email"
card.

### 5.3 Back to sign in (from confirmation card)

`navigate('/')` → AuthGate sees no session → renders Login.

### 5.4 Sign in (footer link from form)

`navigate('/')` → same outcome.

---

## 6. Animations & micro-feel

Same as Login: input focus border transition, button tap opacity.

Live username preview updates *instantly* on every keystroke. No
debounce.

---

## 7. Empty / loading / error states

### Validation errors

- "Please enter your name." (empty after lowercase+strip)
- "Passwords don't match."
- "Password must be at least 6 characters."
- `The name "Joelle" is already taken. Try a different one.`
- Supabase signup error: passthrough message.

### Loading

Button shows "Creating account…" (PWA does this — exact label may vary).

### Success state

Confirmation card; no auto-navigate. User explicitly taps "Back to sign in".

---

## 8. Known gotchas

- **Username uniqueness is checked client-side via RPC, but Supabase
  signup can still race.** Two users typing the same username at the
  same moment may both pass the check. The trigger that creates the
  `profiles` row will fail on the unique constraint for the second
  signup. **The user sees a generic Supabase error** in that case;
  improvement opportunity, but not blocking.
- **Email confirmation is mandatory.** Without it, the user can't sign
  in. The confirmation email is sent by Supabase's default sender
  (`no-reply@mail.app.supabase.io`) — easy to land in spam. Mention
  spam in the copy: "Check your spam folder if you don't see it." (PWA's
  reset card does; signup card should too.)
- **`signUp({ options: { data } })`** passes metadata that the
  Supabase trigger reads. Don't drop the `data` key in native.
- **The signup URL is the distribution mechanism.** No admin step. If
  this changes (e.g., "invite-only" mode), every existing user's
  expectation breaks.

---

## 9. Native translation notes

### Recommended stack

- `TextInput` with proper `autoComplete` and `keyboardType` for each
  field.
- `KeyboardAvoidingView` wrapping the form.
- Same brand styles as LoginScreen (port from native LoginScreen).

### Input attributes

```tsx
<TextInput autoComplete="name" autoCorrect={false} autoCapitalize="words" />  // display name
<TextInput autoComplete="email" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" />
<TextInput autoComplete="new-password" secureTextEntry textContentType="newPassword" />
<TextInput autoComplete="new-password" secureTextEntry textContentType="newPassword" />
```

The `textContentType="newPassword"` tells iOS not to autofill with the
current Keychain entry.

### Username preview

```tsx
const username = useMemo(() => toUsername(displayName), [displayName])

{username && (
  <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.amber, marginTop: -8 }}>
    You'll sign in as {username}
  </Text>
)}
```

### Deep-link to confirm signup

When the user clicks the confirmation email link, ideally the app
re-opens directly into a signed-in state. Configure linking:

```ts
linking: {
  prefixes: ['cassette://', 'https://cassette.app'],
  config: {
    screens: {
      ConfirmSignup: 'auth/callback',        // a no-op screen that just lets onAuthStateChange settle
      ResetPassword: 'reset-password',
      // ...
    },
  },
}
```

`auth/callback` doesn't need a real screen — set `detectSessionInUrl:
true` *just for this case* in the supabase client config and let
Supabase auto-handle the token in the URL fragment. **But that conflicts
with native's `detectSessionInUrl: false`.** The clean solution: a
small ConfirmSignup screen that calls `supabase.auth.exchangeCodeForSession()`
on mount, then navigates to Home.

This is Day-N work. For v0.5, the user can simply click the email link,
which opens the iOS Safari, hits the deep-link bounce, and lands them
in the app (which then needs them to sign in manually). Acceptable
for now.

### What to defer

- **In scope:** Form, validation, signup RPC + signup call, confirmation
  card, navigation back to Login.
- **Out of scope (Day-N):** Email-confirmation deep link auto-sign-in,
  username availability live-debounce (current check on submit only is
  fine).

---

## 10. Test plan

- [ ] Type "Joelle" → preview shows "You'll sign in as joelle".
- [ ] Type special characters in name → preview drops them.
- [ ] Mismatched passwords → "Passwords don't match." inline.
- [ ] < 6 char password → "Password must be at least 6 characters."
- [ ] Username already taken → friendly error.
- [ ] Valid signup → "Check your email" card.
- [ ] Confirmation email click → opens app (or Safari) → user can sign
      in normally.
- [ ] "Back to sign in" → Login.
- [ ] "Already have an account?" footer link → Login.

---

*Cross-references:* `00-brand-system.md` §2; `01-navigation-flow.md`
§2; `03-data-model.md` §5 (`check_username_available` RPC), §2
(`profiles` table); `screens/login.md`.
