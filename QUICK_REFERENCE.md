# Cassette Quick Reference Guide

## 🚀 Quick Start for Next Session

### Current State (v0.4.5)
- All core editing features working
- Horizontal navigation implemented
- Hold-to-pause functional
- Mute toggle per clip
- Version management system active

### Files You'll Most Likely Need

**Core Screens:**
- `app/src/screens/WorkspaceScreen.jsx` - Editing interface
- `app/src/screens/PlaybackScreen.jsx` - Viewing experience
- `app/src/screens/HomeScreen.jsx` - Library + version popup
- `app/src/screens/IntakeScreen.jsx` - Video upload

**Config:**
- `app/src/version.js` - Update version here!

**Shared:**
- `app/src/lib/supabase.js` - Database client
- `tailwind.config.js` - Theme colors

---

## 🎨 Design Tokens (Copy-Paste Ready)

### Colors
```javascript
walnut: '#2C1A0E'       // Main background
walnut-mid: '#3D2410'   // Cards
walnut-light: '#4A2E18' // Borders
deep: '#1A0E08'         // Deepest bg
amber: '#F2A24A'        // Primary
wheat: '#F5DEB3'        // Text
rust: '#7A3B1E'         // Secondary text
sienna: '#E8855A'       // Accents
```

### Common Styles
```jsx
// Headers
className="pt-12 pb-2"

// Buttons (amber primary)
className="bg-amber text-walnut font-sans font-bold text-[13px] rounded-full px-5 py-2 active:opacity-80"

// Buttons (secondary)
className="bg-walnut-mid text-wheat/60 font-sans font-semibold text-[14px] rounded-xl px-4 py-2.5 border border-walnut-light active:opacity-80"

// Badge/Tag
className="text-[8px] font-bold px-1.5 py-0.5 rounded-full border text-amber"
style={{ background: 'rgba(242,162,74,0.1)', borderColor: 'rgba(242,162,74,0.22)' }}

// Input fields
className="w-full bg-walnut-mid text-wheat text-[15px] rounded-xl px-4 py-3 border border-walnut-light focus:outline-none focus:border-amber"
```

---

## 🗄️ Database Quick Reference

### Common Queries

**Get Scrapbook with Clips:**
```javascript
const { data } = await supabase
  .from('scrapbooks')
  .select('*, clips(*)')
  .eq('id', scrapbookId)
  .single()
```

**Update Clip:**
```javascript
await supabase
  .from('clips')
  .update({ 
    trim_in: 2.5,
    trim_out: 10.5,
    muted: true 
  })
  .eq('id', clipId)
```

**Reorder Clips:**
```javascript
for (let i = 0; i < clips.length; i++) {
  await supabase
    .from('clips')
    .update({ order: i })
    .eq('id', clips[i].id)
}
```

### Available Clip Fields
- `video_url` (text) - Supabase storage URL
- `duration` (float) - Total clip length in seconds
- `trim_in` (float) - Start time in seconds
- `trim_out` (float) - End time in seconds
- `caption_text` (text) - Caption content
- `caption_x` (float) - X position (percentage)
- `caption_y` (float) - Y position (percentage)
- `caption_size` (int) - Font size in pixels
- `muted` (boolean) - Audio state
- `order` (int) - Position in scrapbook
- `recorded_at` (timestamp) - Original recording date

---

## 🔧 Common Patterns

### Video Element Control
```javascript
const video = videoRef.current
if (video) {
  video.src = clip.video_url
  video.currentTime = clip.trim_in || 0
  video.muted = clip.muted || false
  video.load()
  video.play().catch(() => {})
}
```

### Touch Interaction Pattern
```javascript
// State
const dragActiveRef = useRef(false)
const dragStartX = useRef(0)

// Handlers
function handleTouchStart(e) {
  dragActiveRef.current = true
  dragStartX.current = e.touches[0].clientX
}

function handleTouchMove(e) {
  if (!dragActiveRef.current) return
  const dx = dragStartX.current - e.touches[0].clientX
  // Do something with dx
}

function handleTouchEnd() {
  dragActiveRef.current = false
}
```

### Updating Clips Locally + DB
```javascript
// Update local state immediately (optimistic)
setClips(prev => prev.map(c => 
  c.id === clipId ? { ...c, ...changes } : c
))

// Persist to database
await supabase
  .from('clips')
  .update(changes)
  .eq('id', clipId)
```

---

## 📱 Testing Checklist (for Wife!)

### Workspace Tests
- [ ] Can trim clips easily with handles
- [ ] Handles don't stick out of box
- [ ] Mute toggle works and shows badge
- [ ] Long-press drag feels smooth
- [ ] Reorder mode shows all clips
- [ ] Caption input works
- [ ] Preview shows changes immediately

### Playback Tests  
- [ ] Swipe left goes to next clip
- [ ] Swipe right goes to previous clip
- [ ] Swipe right on first clip exits to library
- [ ] Hold anywhere pauses, lift resumes
- [ ] Tap left edge = previous
- [ ] Tap right edge = next
- [ ] Tap center with quick tap does nothing (only hold works)
- [ ] Progress bar visible and not overlapping
- [ ] Transitions feel smooth
- [ ] Muted clips have no sound

### General Tests
- [ ] Header has comfortable spacing from status bar
- [ ] All buttons are easy to tap (not too small)
- [ ] Version popup shows correct info
- [ ] Logout works from version popup
- [ ] App feels polished and intentional

---

## 🎯 Known Next Steps

### High Priority (Sprint 3)
1. Export scrapbook as single MP4
2. Share functionality (link or download)
3. Background music layer

### UX Polish
1. Loading states for video uploads
2. Error handling for failed uploads
3. Confirmation dialogs for destructive actions
4. Keyboard shortcuts (desktop)

### Nice to Have
1. 3D cube transitions (optional mode)
2. Filters and color grading
3. Slow motion / speed adjustments
4. Batch caption editing

---

## 🐛 Debugging Tips

### Build Failures
- Check for extra closing tags `</div>`
- Verify all imports have matching exports
- Look for missing commas in object/array literals
- Check Tailwind class syntax (no typos)

### Video Playback Issues
- Verify video URL is accessible
- Check trim_in < trim_out
- Ensure video.load() is called after src change
- Check for autoplay restrictions (use .play().catch())

### Touch Gesture Conflicts
- Use `e.preventDefault()` to block unwanted gestures
- Check event handler order (touchstart → touchmove → touchend)
- Verify refs are being used for drag state (not just useState)

---

## 💡 Development Philosophy

1. **Wife approval is the metric** - If she doesn't love it, iterate
2. **Mobile-first always** - PWA experience is the priority
3. **No jank allowed** - 60fps or bust
4. **Intentional design** - Every pixel has a purpose
5. **Fast iteration** - Ship, test, refine, repeat

---

*Last updated: March 5, 2026 - v0.4.5*
