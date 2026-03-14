# Cassette Video Scrapbook App - Project Status
**Last Updated:** March 5, 2026  
**Current Version:** 0.4.5 Beta  
**Status:** Active Development

## 🎯 Project Vision
A mobile-first PWA for creating polished video scrapbooks from iPhone clips. Users can trim, caption, and arrange videos into cohesive stories with Instagram Reels-style playback.

## 🏗️ Technical Stack
- **Frontend:** React + Vite
- **Styling:** Tailwind CSS (utility-first)
- **Backend:** Supabase (Auth + Database + Storage)
- **Hosting:** Cloudflare Pages (auto-deploy from GitHub)
- **Video Processing:** Browser-native (future: FFmpeg.wasm for export)

## 📱 Core Screens

### HomeScreen
- Scrapbook library grouped by year
- Card-based UI with thumbnails
- Search and discovery features
- Version popup (tap logo)
- Logout functionality

### IntakeScreen  
- Multi-video picker from camera roll
- Grid preview with selection state
- Upload to Supabase storage

### WorkspaceScreen (Editing Hub)
- **Video Preview:** 280px height, rounded corners
- **Trim Zone:** 56px filmstrip with cozy pillow handles
  - Tap-to-activate (3s pulse)
  - Contained within box (no overflow)
  - Prevents swipe-back conflicts
- **Tool Row:** Mute, Caption, Preview, Reorder, Remove
- **Clip List:** Compact 44px rows with badges (trimmed/caption/muted)
- **Reorder Mode:** Full-screen dedicated view

### PlaybackScreen (Viewing Experience)
- **Navigation:**
  - Swipe left/right (bidirectional)
  - Tap edges (25% zones)
  - Hold center to pause
- **Transitions:** Connected horizontal slides (300ms)
- **Progress:** Segmented bar per clip
- **Preloading:** Next + previous videos ready

## 🔧 Key Features Implemented

### Sprint 1 (March 2026)
✅ Trim handle accessibility improvements  
✅ Mute option per clip  
✅ Scrapbook rename capability  
✅ Reorder button + full-screen mode  
✅ Header spacing for PWA  

### Sprint 2 (March 2026)
✅ Horizontal swipe navigation (left/right)  
✅ Connected slide transitions  
✅ Hold-to-pause playback  
✅ Tap zone refinement (25%-50%-25%)  
✅ Progress bar repositioning  
✅ Version management system  
✅ Logout integration  

## 📋 Planned Features (Sprint 3+)

### High Priority
- [ ] Video export (concatenated MP4 with captions burned in)
- [ ] Share scrapbook (public link or download)
- [ ] Background music layer
- [ ] Scrapbook cover image customization

### Medium Priority  
- [ ] 3D cube transitions (optional playback mode)
- [ ] Clip duplication
- [ ] Undo/redo for edits
- [ ] Batch caption editing

### Low Priority
- [ ] Filters and color grading
- [ ] Slow motion / speed adjustments
- [ ] Collaborative scrapbooks
- [ ] Analytics (view counts)

## 🗄️ Database Schema (Supabase)

### scrapbooks
```sql
id            uuid PRIMARY KEY
user_id       uuid REFERENCES auth.users
name          text
cover_image_url text
created_at    timestamp
```

### clips  
```sql
id            uuid PRIMARY KEY
scrapbook_id  uuid REFERENCES scrapbooks
video_url     text
duration      float
trim_in       float
trim_out      float
caption_text  text
caption_x     float (percentage)
caption_y     float (percentage)
caption_size  int (pixels)
muted         boolean
order         int
recorded_at   timestamp
created_at    timestamp
```

## 🎨 Design System

### Colors (Tailwind Extensions)
- `walnut`: #2C1A0E (dark brown background)
- `walnut-mid`: #3D2410 (cards, inputs)
- `walnut-light`: #4A2E18 (borders, dividers)
- `deep`: #1A0E08 (deepest backgrounds)
- `amber`: #F2A24A (primary action color)
- `wheat`: #F5DEB3 (primary text)
- `rust`: #7A3B1E (secondary text)
- `sienna`: #E8855A (accent highlights)

### Typography
- **Display:** DM Serif Display (headings, titles)
- **Body:** Inter (UI, labels, buttons)

### Spacing Philosophy
- Headers: pt-12 (PWA breathing room)
- Content: px-4 to px-6 (edge safety)
- Buttons: Minimum 44x44px touch targets
- Gaps: 1.5 to 2.5 spacing units

## 🚀 Deployment Workflow

1. Push to GitHub `main` branch
2. Cloudflare Pages auto-builds (Vite)
3. Deploys to `kasette.pages.dev`
4. PWA installable on iOS/Android

### Common Deploy Issues
- **Syntax errors:** Check for extra closing tags
- **Import errors:** Verify relative paths
- **Missing exports:** Ensure all imports have matching exports

## 📖 Version Management

Edit `app/src/version.js`:
```javascript
export const APP_VERSION = {
  number: "0.4.5",
  build: "March 2026", 
  status: "Beta"
}
```

## 🐛 Known Issues / Tech Debt
- None currently blocking (as of v0.4.5)

## 🎯 Success Metrics
- **Primary:** Wife approves and uses it regularly
- **Secondary:** PWA feels native and polished
- **Tertiary:** Easy to share scrapbooks with family

## 📞 Key Contacts
- **Developer:** Chad
- **Primary Tester:** Chad's wife
- **Target Users:** Family members, personal archiving

---

*This is a passion project focused on creating a delightful family video archiving experience. Speed of iteration and user feedback drive all decisions.*
