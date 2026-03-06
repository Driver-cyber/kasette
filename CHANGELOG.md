# Cassette Changelog

## [0.4.5] - 2026-03-05

### 🎨 UI/UX Polish
- **Trim Handles Redesign**
  - Changed from thin bars to 6px rounded "cozy pillow" handles
  - Moved handles INSIDE filmstrip overflow container (no more sticking out)
  - Handles now perfectly aligned with filmstrip edges
  - Improved tap targets (48px wide, 56px tall)
  
- **Header Spacing (PWA)**
  - Increased top padding: pt-10 → pt-12 (48px from top)
  - Larger back button: text-[13px] → text-[15px], icon 14→18px
  - Larger title: text-base → text-[18px]
  - Chunkier Watch button: text-xs → text-[13px], px-4→px-5, py-1.5→py-2
  - Better breathing room from phone status bar

- **Clip List Tags**
  - Added "muted" badge alongside "trimmed" and "caption"
  - Rust color scheme for muted state
  - Consistent styling with other tags

### ✨ New Features
- **Mute Toggle**
  - New button in tool row (leftmost position)
  - Dynamic icon: Volume2 (unmuted) ↔ VolumeX (muted)
  - Per-clip audio control
  - State persists to database
  - Active state highlights in amber
  
- **Version Management System**
  - New `version.js` config file for easy updates
  - Single source of truth: number, build, status
  - Auto-imports into HomeScreen
  - No more hunting through code to update version
  
- **Logout Button**
  - Added to version popup (tap Cassette logo)
  - Signs out and redirects to login
  - Positioned above "Got it" button

### 🎬 Playback Improvements  
- **Hold-to-Pause**
  - Touch and hold anywhere → pauses video
  - Lift finger → resumes playback
  - 150ms threshold before pause triggers
  - Cancels if finger moves >5px (becomes swipe)
  - Natural, intuitive interaction
  
- **Bidirectional Navigation**
  - Swipe left → next clip (existing)
  - Swipe right → previous clip (NEW)
  - Swipe right on first clip → exit to library
  - iOS swipe-back only works on first clip (no conflicts)
  
- **Tap Zone Refinement**
  - Left 25%: Previous clip
  - Center 50%: Hold-to-pause (no quick tap action)
  - Right 25%: Next clip
  - Better defined interaction areas
  
- **Progress Bar Position Fix**
  - Moved from top-[54px] → top-[92px]
  - Now clearly below 40px tall buttons
  - Proper visual spacing, no overlap

### 🔧 Workspace Enhancements
- **Video Preview**
  - Increased height: 220px → 280px (+27% larger)
  - Better clip review experience
  
- **Clip List Optimization**
  - Row height: 52px → 44px (more compact)
  - Still easy to select and switch clips
  - Balances with larger preview
  
- **Reorder Improvements**
  - Long-press immediately enters drag mode (no release needed)
  - Scroll position locks during drag
  - Ghost clip follows finger smoothly
  - Background stays frozen
  - "Hold & drag to reorder" instruction in header
  - "Done" button to exit mode

### 🐛 Bug Fixes
- Fixed trim handles sticking out of filmstrip box
- Fixed iOS swipe-back triggering during clip navigation
- Fixed progress bar overlapping top buttons
- Fixed reorder drag scrolling background instead of moving clip
- Fixed extra closing div causing build errors

### 🏗️ Technical Changes
- Trim handles repositioned from relative wrapper to inside overflow-hidden
- Added `isDraggingActive` ref for better drag state tracking
- Added `trimHandlesActive` state for tap-to-activate UI feedback
- Added `wasPlayingBeforeHold` ref for hold-to-pause resume logic
- Video elements now respect `clip.muted` boolean on load
- Imports `APP_VERSION` from centralized config

### 📝 Documentation
- Created `version.js` with clear inline comments
- Updated all screen components with better code comments
- Standardized header spacing across all screens

---

## [0.3.0] - 2026-03-04
### Initial Features
- Basic trim functionality
- Caption support
- Vertical swipe navigation
- Clip reordering

---

## Version Format
- **Major.Minor.Patch** (e.g., 0.4.5)
- **Major:** Breaking changes or major feature sets
- **Minor:** New features, non-breaking
- **Patch:** Bug fixes, polish, refinements
