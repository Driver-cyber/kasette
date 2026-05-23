# 00 — Brand System (Golden Hour)

> **Spirit.** Cassette is *not* clinical, *not* corporate, *not* Instagram.
> It's "opening a shoebox of old photos" — warm, analog, intimate, a little
> nostalgic. Every native screen must feel that way. If a screen reads as a
> generic dark-mode SaaS layout, it has failed even if its features work.
>
> If you ever have to choose between "matches the PWA pixel-for-pixel" and
> "feels right on iOS," pick "feels right" — but stay inside the palette,
> typography, and motion vocabulary defined below. Those are non-negotiable.

This file is the canonical brand reference for `kasette-native`. Source of
truth is `kasette/cassette-brand-guide.html`; this doc extracts the parts
the native port actually needs.

---

## 1. Color tokens

The "Golden Hour" palette. Eight hex values — no others. Native code lives
in `lib/theme.ts`. The current native theme is correct; do not edit it
beyond adding `walnutDeep`.

| Token (web) | Token (native) | Hex | Role |
|---|---|---|---|
| `--cassette-amber` | `colors.amber` | `#F2A24A` | Primary accent — CTAs, logo, active state, spinners, scrub bar |
| `--cassette-sienna` | `colors.sienna` | `#E8855A` | Secondary accent — danger ("warm, not alarming"), logo italic, error tint, sub-emphasis. **Never use red for destructive actions; use Sienna.** |
| `--cassette-wheat` | `colors.wheat` | `#F5DEB3` | Primary text on dark surfaces |
| `--cassette-walnut` | `colors.walnut` | `#2C1A0E` | App background (Home, Workspace, Settings, Auth) |
| `--cassette-walnut-mid` | `colors.walnutMid` | `#3D2410` | Cards, modal/bottom-sheet surfaces, input backgrounds |
| `--cassette-walnut-light` | `colors.walnutLight` | `#4A2E18` | Borders, dividers, faint surfaces |
| `--cassette-rust` | `colors.rust` | `#7A3B1E` | Metadata, labels, secondary text, "muted" copy, placeholder text |
| `--cassette-deep` | **`colors.walnutDeep`** *(add)* | `#1A0F08` | Playback background only — slightly darker than walnut to make video punch |

### Required addition to `lib/theme.ts`

The Playback / Discovery / loading-overlay backgrounds use the deep walnut
that's missing from the current native theme. Add it:

```ts
export const colors = {
  amber: '#F2A24A',
  sienna: '#E8855A',
  wheat: '#F5DEB3',
  walnut: '#2C1A0E',
  walnutMid: '#3D2410',
  walnutLight: '#4A2E18',
  rust: '#7A3B1E',
  walnutDeep: '#1A0F08',
} as const
```

### Opacity conventions (used pervasively in PWA)

The PWA uses Tailwind opacity suffixes (`wheat/60`, `amber/20`) constantly.
Native equivalent: pass `rgba(...)` or use the eight-digit hex form. Common
recurring values verbatim from source:

| PWA class | rgba |
|---|---|
| `text-wheat/80` | `rgba(245, 222, 179, 0.8)` |
| `text-wheat/70` | `rgba(245, 222, 179, 0.7)` |
| `text-wheat/60` | `rgba(245, 222, 179, 0.6)` |
| `text-wheat/40` | `rgba(245, 222, 179, 0.4)` — *placeholder, faint metadata* |
| `bg-walnut/80` | `rgba(44, 26, 14, 0.8)` |
| `bg-amber/20` | `rgba(242, 162, 74, 0.2)` |
| `bg-amber/15` | `rgba(242, 162, 74, 0.15)` |
| `bg-amber/10` | `rgba(242, 162, 74, 0.10)` |
| `bg-rust/30` | `rgba(122, 59, 30, 0.3)` |
| Frosted-glass surfaces | `rgba(0,0,0,0.30)` to `rgba(0,0,0,0.50)` + `blur(8–10px)` |

### Gradients used verbatim

Top vignette on Playback/Discovery (height 176 px / `h-44`):

```
linear-gradient(180deg, rgba(0,0,0,0.55) 0%, transparent 100%)
```

Bottom vignette on Playback/Discovery (height 224 px / `h-56`):

```
linear-gradient(0deg, rgba(0,0,0,0.7) 0%, transparent 100%)
```

Hero gradient on ScrapbookDetail (cover hero → bottom-fade to walnut):

```
linear-gradient(180deg, rgba(44,26,14,0.3) 0%, rgba(44,26,14,0.0) 30%, rgba(44,26,14,0.85) 100%)
```

Intake sticky-bottom-bar fade:

```
linear-gradient(180deg, transparent 0%, #2C1A0E 30%)
```

In RN: `expo-linear-gradient` — the same `LinearGradient` already imported in
`HomeScreen.tsx` for cover-card fade is the right component.

---

## 2. Typography

Two families. Both ship via the Expo Google Fonts packages already in
`package.json`. Never substitute (system font, Inter, Arial, SF Pro are all
wrong).

### Fonts loaded in `App.tsx` today

```ts
Fraunces_400Regular_Italic   // display italic — emotional moments, captions
Fraunces_600SemiBold         // display — headings, logo, numerals
PlusJakartaSans_400Regular   // body
PlusJakartaSans_500Medium    // body emphasis
PlusJakartaSans_600SemiBold  // body bold — buttons, tabs, "sign out", labels
```

The PWA additionally uses:
- **Fraunces 700 Bold** — `font-display font-bold` on hero titles (e.g.
  ScrapbookDetail "2026 Cassette" 28px). On native, `Fraunces_600SemiBold`
  has been chosen as the heavy weight — keep it. If a title looks too
  light next to the PWA, add `Fraunces_700Bold` to the imports.
- **Fraunces 300 Light** — used inside the logo lockup for the italic word
  ("scrapbook"). Not used in screen UI; only on Login. If you port the
  Login logo treatment exactly, add `Fraunces_300Light_Italic`. Otherwise
  the existing italic weight is fine.

### Mapping (extend `lib/theme.ts`)

```ts
export const fonts = {
  displayItalic: 'Fraunces_400Regular_Italic',
  display:       'Fraunces_600SemiBold',
  body:          'PlusJakartaSans_400Regular',
  bodyMedium:    'PlusJakartaSans_500Medium',
  bodySemiBold:  'PlusJakartaSans_600SemiBold',
} as const
```

### Typography scale (exact values from source)

These are the *real* sizes the PWA renders — not "h1 / h2 / body". Match
them in native by passing literal `fontSize` numbers.

| Use | Family | Size (px) | Weight | Letter-spacing | Notes |
|---|---|---|---|---|---|
| App logo (Login) | Fraunces italic | 56 | 400 | `-1px` | `lineHeight: 60` |
| Section greeting eyebrow ("YOUR SCRAPBOOKS") | Plus Jakarta SemiBold | 10 | 600 | `2px` (uppercase tracking) | rust color |
| Section title ("12 moments saved") | Fraunces SemiBold + italic | 30 | 600 / 400-italic | — | `lineHeight: 34`. Numeric in amber Fraunces, qualifier in sienna italic. |
| Hero title (ScrapbookDetail) | Fraunces SemiBold | 28 | 600 / 700 | — | `leading-tight` ≈ `lineHeight: 1.1` |
| Card title | Fraunces SemiBold | 22 | 600 | — | amber |
| Sheet heading ("Almost there.") | Fraunces italic | ~36 | 400 | — | amber + sienna italic combo |
| Bottom-sheet body text | Fraunces SemiBold | 22 | 600 | — | wheat |
| Mode pill / brand tag | Fraunces italic | 12–14 | 400 | — | amber, e.g. "Film Fest" |
| Tab label | Plus Jakarta SemiBold | 14 | 600 | — | active = wheat, idle = rust |
| Body | Plus Jakarta Regular | 14 | 400 | — | wheat or wheat/60 |
| Button label | Plus Jakarta SemiBold | 15 | 600/700 | — | walnut on amber pill |
| Small button / secondary | Plus Jakarta SemiBold | 13–14 | 600 | `0.06em` if uppercase | |
| Metadata / clip duration | Plus Jakarta Regular | 12 | 400 | — | rust |
| Eyebrow caps (e.g. "FROM YOUR LIBRARY · 2026") | Plus Jakarta Bold | 9–10 | 700 | `0.15–0.2em` | uppercase, rust |
| Tabular numbers (counters, timestamps) | Plus Jakarta | 11–12 | 600 | — | wheat/70; use `fontVariant: ['tabular-nums']` |
| Caption overlay (Playback) | Fraunces italic | per-clip `caption_size` (default 24) | 400-italic | `-0.3` | wheat, drop-shadow (see §3) |

**Italic is reserved.** Italic Fraunces is *emotional*: captions, logo,
empty-state poetry ("Nothing here yet"), "almost there.", export "Done!",
loading verb ("Exporting…"). Don't use it for tab labels, button text,
metadata, or anything that's information-as-information.

### Native gotchas for typography

- React Native does **not** honor `font-weight: 600` when a font is loaded
  by family name like `Fraunces_600SemiBold` — the weight is part of the
  family name itself. **Set `fontFamily` and leave `fontWeight` unset**, or
  the OS will try to bold the already-bold face and you'll get a fuzzy
  pseudo-bold. The current native code does this right.
- `letter-spacing` in CSS is `letterSpacing` in RN, takes a number (px on
  iOS, em on Android — for iOS-first work treat values as px).
- `text-shadow` ports to `textShadowColor` / `textShadowOffset` /
  `textShadowRadius`. The PWA caption shadow:
  `text-shadow: 0 2px 12px rgba(0,0,0,0.6), 0 0 40px rgba(0,0,0,0.4)` —
  RN only supports a single shadow, so use the inner one
  (`offset: {0,2}`, `radius: 12`, `color: rgba(0,0,0,0.65)`) which is what
  `screens/PlaybackScreen.tsx` already does.
- Italic Fraunces won't render in italic if you also set
  `fontStyle: 'italic'` — the family already is italic. Don't double up.
- Tabular numerals: `fontVariant: ['tabular-nums']` works on iOS for
  Plus Jakarta. Verify each numeric counter you port (clip counters,
  timestamps).

---

## 3. Spacing & radii

### Spacing base

- **4px base unit.** Everything is a multiple of 4. Brand guide is explicit:
  "cramped layouts fail on one-handed use."
- Common values that show up over and over in source:
  - 8 / 12 / 16 / 20 / 24 / 32
  - 56 (notch / safe-top fallback before `useSafeAreaInsets()`)
  - 96 (`pb-24` — bottom padding on Home for FAB clearance)

### Touch targets

- **Minimum 44 × 44 pt.** Brand-guide and CLAUDE.md agree. Even when a
  glyph button looks 24px, hit-area must be 44 — use `hitSlop={12}` in RN
  (matches the current LoginScreen/HomeScreen pattern).
- Specifically used in PWA: top-bar round icons are `w-9 h-9` (36) or
  `w-10 h-10` (40) visually with surrounding padding bringing tap area to
  44+. Don't shrink them in native.

### Radii

| Use | Radius (px) |
|---|---|
| Pill buttons (primary CTA, "Sign In", "Create Scrapbook") | 999 (`rounded-full`) |
| Sheets / modals (top corners) | 24 (`rounded-t-3xl`) — top only, not bottom |
| Cards (Home scrapbook card) | 16 (`rounded-2xl`) |
| Inputs / smaller cards | 12 (`rounded-xl`) |
| Pills, tags | 100 / `rounded-full` |
| Tab indicator underline | 2 (`rounded-full` on a 2px bar = fully rounded) |
| Avatar / circular icon button | half of width (perfect circle) |
| Drag handle on sheets | 0.5 (`rounded-full` on a 10×1 bar) |

### Shadows (mostly for sheets — RN can fake)

Sheet shadow (above the sheet, falling up into the dim backdrop):

```
boxShadow: 0 -20px 60px rgba(0,0,0,0.4)
```

In RN: `shadowColor: '#000'`, `shadowOffset: { width: 0, height: -20 }`,
`shadowOpacity: 0.4`, `shadowRadius: 60`. (iOS honors negative offset;
Android needs the `elevation` prop instead, which can't render shadows
above an element — fine, Android isn't a Day-1 target.)

Card shadow on FAB:

```
shadow-lg  (Tailwind default ≈ 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05))
```

For native FAB just use `shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: {0, 6}`.

---

## 4. Motion

> "Motion should feel warm and unhurried — like film, not software.
> Nothing snaps. Everything eases. Playback transitions are the most
> important animations in the product." (brand guide, verbatim)

### Curve & duration tokens

Brand-guide spec:

| Token | Curve | Duration | Use |
|---|---|---|---|
| **Default Ease** | `cubic-bezier(0.4, 0, 0.2, 1)` | 200ms | All standard UI transitions, state changes |
| **Gentle Enter** | `cubic-bezier(0, 0, 0.2, 1)` | 300ms | Modal entrance, sheet slide-up |
| **Playback Swipe** | `cubic-bezier(0.25, 0.46, 0.45, 0.94)` | 380ms (spec) | Clip-to-clip transition in Reels viewer |
| **Caption Fade** | `ease-in-out` | 500ms (opacity 0→1) | Caption appearance |
| **Micro-interactions** | `ease` | 120–150ms | Hover, focus ring, tap feedback |

### Brand-spec vs. source drift

The PWA source uses faster timings than the brand spec on Playback Swipe:

- `PlaybackScreen.jsx`: **300ms**, `cubic-bezier(0.25, 0.46, 0.45, 0.94)`
- `DiscoveryScreen.jsx`: **280ms**, same curve

This is a drift worth noting. The brand guide says 380ms but the deployed
PWA is 300/280ms. **On native, match the source (300/280ms)** — the user
loves the existing feel and it's noticeably snappier than 380ms. The
brand guide is aspirational here; source wins.

### Native mapping

| PWA pattern | RN/Expo |
|---|---|
| CSS `transition: transform 0.3s cubic-bezier(...)` | Reanimated `withTiming(value, { duration: 300, easing: Easing.bezier(0.25, 0.46, 0.45, 0.94) })` |
| CSS `transition: opacity 0.2s` | Reanimated `withTiming(value, { duration: 200, easing: Easing.bezier(0.4, 0, 0.2, 1) })` |
| `animate-spin` (Tailwind: 1s linear infinite) | Reanimated `withRepeat(withTiming(rotation, { duration: 1000, easing: Easing.linear }), -1)`; or the cassette `Reel` uses 2.1s and 1.7s (asymmetric) — match those values exactly |
| `active:scale-[0.98]` | Reanimated shared value tied to `Pressable`'s `onPressIn`/`Out`, or the `({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })` pattern that's already used in `HomeScreen.tsx` |
| CSS `animate-pulse` (rare in PWA) | `withRepeat(withSequence(withTiming(0.5), withTiming(1)), -1)` |

### When to use Reanimated vs. Pressable scale

The PWA uses raw CSS `active:scale-[0.98]` everywhere — it's a hair of
feedback on tap, no spring. In RN that's already covered by
`Pressable`'s `({ pressed })` style callback as `HomeScreen.tsx` does:

```tsx
<Pressable style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
```

with `cardPressed: { transform: [{ scale: 0.98 }], opacity: 0.92 }`.
Reanimated only earns its keep for the drag offset on Playback, the
caption drag in Workspace, the lerping progress bar, and the spinner
loops. Don't pull it in for tap feedback.

### `useNativeDriver` trap

When you do reach for the Animated API instead of Reanimated (e.g. for
the cassette reel spinner via `Animated.loop`), **set
`useNativeDriver: true`** or the spinner will visibly jank on iOS during
upload. Anything that animates `transform` or `opacity` is native-driver
eligible. Layout properties (width, height, top) are not — use Reanimated
for those.

---

## 5. Iconography

- **Library:** Lucide. PWA uses `lucide-react`; native equivalent is
  **`lucide-react-native`** (`npm i lucide-react-native` —
  `react-native-svg` is already required by other Expo SDK 54 deps).
- **Stroke width:** `1.75` everywhere. The 2px default is too clinical;
  1.75 matches the warmth.
- **Color:** Amber for active / interactive, rust for muted / decorative,
  wheat for chrome on dark surfaces, sienna for destructive.
- **Sizes used in source:**
  - 18 px — top-bar round button glyphs (`ArrowLeft`, `MoreHorizontal`)
  - 20 px — list-row icons (in action sheets)
  - 16 px — inline secondary (back button label row)
  - 15 px — tight pill icons (Disc3 in remix top-right)
  - 14 px — play/pause inside 44×44 circle
  - 13 px — tiny "play" glyph on scrapbook card thumbnail badge

Icons used in PWA (just so you know what you'll be importing):

```
ArrowLeft, ChevronDown, ChevronRight, Check, CheckCircle2, Circle, X,
Play, Pause, MoreHorizontal, Edit, Edit2, Edit3, Trash2, Share2,
Download, Image, Camera, Plus, Search, Settings, Shuffle, Disc3,
Scissors, RotateCcw, Type, Volume2, VolumeX, GripVertical, Lock,
Eye, EyeOff
```

---

## 6. Voice & microcopy

Read these as constraints, not suggestions. Mom is the reader. She doesn't
work in tech.

### Tone rules

- **Warm. Quiet. A little poetic. Short sentences.** Italics for
  *emotional emphasis* only.
- **Never:** exclamation points, technical jargon, "Upload successful!",
  emoji in UI copy, corporate tone, "users", "content", "media assets".
- **Never use red** for destructive actions. Use sienna. Brand-guide is
  explicit: it's "warm, not alarming."

### Examples lifted verbatim from the brand guide

These are the canonical voice samples — use them as a calibration ear when
you write any new copy:

- "Let's make something worth watching. Start by choosing some videos from
  your camera roll. *Don't overthink it* — you can always add more later."
- "Your first scrapbook is waiting. Grab a batch of videos and let's turn
  them into something."
- "Gathering your videos… *almost there.*"
- "*It's ready.* Tap to watch."
- "Something didn't upload right. Try again when you have a better
  connection — your selections are saved."

### Existing PWA microcopy worth keeping

- Login: "your family video scrapbook" (subtitle, rust, 14px) — preserved
  in native LoginScreen as-is.
- Intake name sheet heading: "*Almost there.*" (Fraunces italic, mixed
  amber + sienna)
- Intake pre-remux indicator (while user types name): "Optimizing clip 1
  *while you type…*" (rust, small)
- Intake post-create background-upload note: "*You can start editing
  right away.*"
- ScrapbookDetail Watch launch: "crafting your experience…" (Fraunces
  italic 22px amber) / "just a moment" (rust 13px)
- Remix loading screens: "Making it groovy…" / "Rolling the dice…"
- Workspace auto-save flash: just the word "saved" (Fraunces italic,
  amber, 13px) — 2.5s appearance.
- Empty Discovery: "Nothing here yet" / "Create a scrapbook and upload
  some clips to start discovering your memories."
- Empty Playback: "No clips in this scrapbook"

When in doubt, ask: "would mom read this and feel warm, or feel that a
robot is talking at her?"

---

## 7. Iconic motifs

These appear in multiple places. Treat them as shared components.

### Cassette reel (the loading animation)

The cassette reel SVG is the single most reused motif. It appears on:

- Intake upload overlay (two reels, gap 10px, asymmetric: one normal, one
  reverse)
- Intake name-sheet pre-remux indicator (single reel, small)
- Remix "Making it groovy…" loading screen (two reels)
- Remix "Rolling the dice…" Surprise Me loading screen (two reels)
- ScrapbookDetail Watch-launch screen (two reels)
- *Anywhere else loading happens — do not invent a new spinner.*

Exact SVG (from `app/src/components/Reel.jsx`):

```svg
<svg width="{size}" height="{size}" viewBox="0 0 48 48" fill="none">
  <circle cx="24" cy="24" r="20" stroke="#F2A24A" strokeWidth="2.5" fill="none" />
  <circle cx="24" cy="24" r="7"  stroke="#F2A24A" strokeWidth="1.5" fill="none" />
  <circle cx="24" cy="24" r="2.5" fill="#F2A24A" />
  <line x1="24"   y1="4"  x2="24"   y2="17"   stroke="#F2A24A" strokeWidth="2" strokeLinecap="round" />
  <line x1="41.3" y1="34" x2="30.1" y2="27.5" stroke="#F2A24A" strokeWidth="2" strokeLinecap="round" />
  <line x1="6.7"  y1="34" x2="17.9" y2="27.5" stroke="#F2A24A" strokeWidth="2" strokeLinecap="round" />
</svg>
```

Animation:
- Forward instance: rotate 360°, duration **2.1s**, linear, infinite
- Reverse instance: rotate -360°, duration **1.7s**, linear, infinite
- Asymmetric on purpose — visual interest, like real cassette reels
  spinning at different rates.
- Default size: 52px (Intake upload), 48px (Detail loading), 32px (small).

Native implementation:

- Use `react-native-svg` (already pulled by Expo deps). Reproduce the SVG
  exactly.
- Spin with Reanimated `useSharedValue` + `withRepeat(withTiming(360,
  { duration: 2100, easing: Easing.linear }), -1)` on the forward reel,
  and `withRepeat(withTiming(-360, { duration: 1700, ... }), -1)` on the
  reverse.
- Make a single `<Reel size? reverse? />` component once and reuse it
  everywhere. Do not duplicate the SVG path.

### Frosted-glass top-bar buttons

The top-bar Back/More buttons on Playback / Discovery / Detail use a
frosted glass treatment over video:

```
background: rgba(0,0,0,0.3-0.5)
backdrop-filter: blur(8-10px)
border: 1px solid rgba(255,255,255,0.10-0.15)
border-radius: 100% (perfect circle, w-9 h-9 or w-10 h-10)
```

Native: `backdrop-filter` doesn't exist in RN. Two options:

1. **`expo-blur` `<BlurView>`** with `intensity={20–30} tint="dark"`,
   wrapped in a rounded `overflow: hidden` view. Best fidelity.
2. **Solid `rgba(0,0,0,0.45)` + white-12% border.** Cheaper, ships today,
   not as luscious. The native `PlaybackScreen.tsx` currently uses this
   fallback (`rgba(0,0,0,0.35)` + `rgba(245,222,179,0.12)` border) and it
   reads fine in isolation but flatter than the PWA.

Recommendation: use `expo-blur` when porting Playback for real. It's a
small install.

### Bottom-sheet handle

Every bottom sheet starts with the same drag handle: 10 × 1 px bar,
walnut-light, centered, top margin 14, bottom margin 20–24. Don't
reinvent it.

```tsx
<View style={{
  width: 40, height: 4,
  borderRadius: 2,
  backgroundColor: colors.walnutLight,
  alignSelf: 'center',
  marginTop: 14, marginBottom: 20,
}} />
```

(The PWA uses `w-10 h-1 rounded-full` which is 40 × 4 — the brand guide
loosely says "10 × 1" but the actual measurement is 40 × 4. Match the
source, 40 × 4.)

---

## 8. Quick component recipes for native

Pre-made styling sketches the porter can drop in. These match what the
PWA produces visually.

### Primary pill button (the amber CTA)

```ts
primaryButton: {
  backgroundColor: colors.amber,
  borderRadius: 999,
  paddingVertical: 16,
  alignItems: 'center', justifyContent: 'center',
},
primaryButtonText: {
  color: colors.walnut,
  fontFamily: fonts.bodySemiBold,
  fontSize: 16,        // or 15 in the action-sheet
},
primaryButtonPressed: { opacity: 0.8 },
primaryButtonDisabled: { opacity: 0.5 },
```

### Walnut-mid card

```ts
card: {
  backgroundColor: colors.walnutMid,
  borderWidth: 1, borderColor: colors.walnutLight,
  borderRadius: 16,
  padding: 16,
},
```

### Text input (login, name, search)

```ts
input: {
  backgroundColor: colors.walnutMid,
  borderWidth: 1, borderColor: colors.walnutLight,
  borderRadius: 12,
  paddingHorizontal: 16, paddingVertical: 16,
  color: colors.wheat,
  fontFamily: fonts.body,
  fontSize: 16,
},
inputFocused: { borderColor: colors.amber },   // toggle via onFocus/onBlur
```

### Bottom sheet (positioned absolutely)

```ts
sheet: {
  position: 'absolute', bottom: 0, left: 0, right: 0,
  backgroundColor: colors.walnutMid,
  borderTopLeftRadius: 24, borderTopRightRadius: 24,
  borderTopWidth: 1, borderTopColor: colors.walnutLight,
  paddingHorizontal: 20,
  paddingBottom: 40,           // base; add safe-area inset bottom on top of this
  // shadow:
  shadowColor: '#000',
  shadowOffset: { width: 0, height: -20 },
  shadowOpacity: 0.4,
  shadowRadius: 60,
},
sheetBackdrop: {
  position: 'absolute',
  top: 0, left: 0, right: 0, bottom: 0,
  backgroundColor: 'rgba(44,26,14,0.8)',  // walnut/80
},
```

Recommendation for Step-2 (Intake) and remix-info sheets: use
**`@gorhom/bottom-sheet`** with `backgroundStyle` set to walnut-mid and
`handleIndicatorStyle` set to walnut-light. It gives you the iOS-native
spring + pan-to-dismiss for free. See
`02-interactions-glossary.md` for the wire-up details.

### Eyebrow caps text

```ts
eyebrow: {
  fontFamily: fonts.bodySemiBold,
  fontSize: 10,
  letterSpacing: 2,           // px — RN takes a number
  textTransform: 'uppercase',
  color: colors.rust,
},
```

### Pill tag (amber-on-dark)

```ts
pill: {
  paddingHorizontal: 14, paddingVertical: 6,
  borderRadius: 999,
  backgroundColor: 'rgba(0,0,0,0.45)',
},
pillText: {
  fontFamily: fonts.displayItalic,
  fontSize: 12,
  color: colors.amber,
},
```

---

## 9. What "feels golden hour" looks like in practice

Use this as the smell test before you call any screen done:

- **The screen is dark.** Walnut-deep / walnut. Never light mode. Never
  pure black except inside `<VideoView>`.
- **The accent color is amber.** Not blue, not white. If a button or icon
  is the "important one," it's amber.
- **Headings are serif.** Anything that wants to land emotionally is
  Fraunces, often italic. Body and labels are sans (Plus Jakarta).
- **Edges are soft.** Radii are generous (12–24). Corners are never sharp
  except on a 6px progress bar.
- **Motion is unhurried.** 200–300ms eases. Nothing teleports.
- **Empty states have voice.** "Nothing here yet." / "your first scrapbook
  is waiting." Never a blank screen with no text.
- **Text shadows under captions.** Captions over video always have a
  drop-shadow so the wheat reads against any frame.
- **Loading uses the cassette reel.** Never the default iOS spinner
  inside a screen body. (System spinners are fine inside `RefreshControl`
  because they're tinted amber — but body-level loading is reels.)

If a screen passes all of those, it's golden hour. If it fails one, fix it
before shipping.

---

*Cross-references:* see `02-interactions-glossary.md` for motion in
context (gesture-driven animations, lerping, scale-on-press),
`screens/playback.md` for the swipe-transition vocabulary, and the per-
screen docs for which fonts/sizes/colors land on which surfaces.
