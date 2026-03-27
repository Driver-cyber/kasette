import { useState, useRef, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Play, Pause, Type, Trash2, Check, GripVertical, Volume2, VolumeX, PlusCircle, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Scissors } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(secs) {
  if (!secs && secs !== 0) return '–'
  const s = Math.floor(secs)
  const m = Math.floor(s / 60)
  return `${m}:${(s % 60).toString().padStart(2, '0')}`
}

function fmtClipDate(recordedAt) {
  if (!recordedAt) return ''
  const d = new Date(recordedAt)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase()
}

function isEdited(clip) {
  const hasTrim = clip.trim_in > 0 || (clip.trim_out && clip.trim_out < (clip.duration || Infinity))
  return hasTrim || !!clip.caption_text
}

const STRIP_COLORS = [
  '#4A2010','#3C1808','#542210','#3A1C0E','#4E1C08',
  '#562810','#3C1C0E','#4A2010','#401A08','#502210',
]

const ROW_H = 44 // Compact row height for clip list
const LONG_PRESS_MS = 400

// ── Main component ─────────────────────────────────────────────────────────

export default function WorkspaceScreen() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { session } = useAuth()
  const videoRef = useRef(null)
  const filmstripRef = useRef(null)
  const previewRef = useRef(null)
  const captionInputRef = useRef(null)
  const captionRef = useRef(null)

  const [scrapbook, setScrapbook] = useState(null)
  const [clips, setClips] = useState([])
  const [activeClipId, setActiveClipId] = useState(null)
  const [activeTool, setActiveTool] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playheadPct, setPlayheadPct] = useState(0)
  const [captionDraft, setCaptionDraft] = useState('')
  const [captionSizeDraft, setCaptionSizeDraft] = useState(24)
  const [captionPosDraft, setCaptionPosDraft] = useState({ x: 50, y: 85 })
  const [loading, setLoading] = useState(true)
  const [confirmRemoveId, setConfirmRemoveId] = useState(null)
  const [trimHandlesActive, setTrimHandlesActive] = useState(false) // Tap-to-activate trim handles
  const [reorderMode, setReorderMode] = useState(false) // Full-screen reorder mode
  const [clipsExpanded, setClipsExpanded] = useState(false) // Clip list collapsed by default
  const [trimMode, setTrimMode] = useState(null) // null | 'trim' | 'split'
  const [splitPct, setSplitPct] = useState(50)  // split marker position as % of full duration

  // Preview swipe navigation
  const previewSwipeStart = useRef(null)

  // Reorder drag state
  const dragState = useRef(null)
  const [dragFromIndex, setDragFromIndex] = useState(null)
  const clipsRef = useRef(clips)
  useEffect(() => { clipsRef.current = clips }, [clips])

  // Ghost drag card state
  const [ghostClip, setGhostClip] = useState(null)
  const [ghostInitialY, setGhostInitialY] = useState(0)
  const ghostRef = useRef(null)
  const ghostOffsetRef = useRef(0)
  const [isActiveDragging, setIsActiveDragging] = useState(false)

  // Long-press detection refs
  const longPressTimer = useRef(null)
  const longPressData = useRef(null) // { index, rowEl, startY, clientY }
  const wasReorderDrag = useRef(false) // blocks onClick from selecting after a drag
  const isDraggingActive = useRef(false) // track if currently in drag mode

  // ── Fetch ──────────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      supabase.from('scrapbooks').select('id, name, user_id').eq('id', id).single(),
      supabase.from('clips').select('*').eq('scrapbook_id', id).order('order', { ascending: true }),
    ]).then(([{ data: sb }, { data: cl }]) => {
      if (sb) {
        if (sb.user_id !== session?.user?.id) { navigate(`/scrapbook/${id}`, { replace: true }); return }
        setScrapbook(sb)
      }
      if (cl && cl.length) {
        setClips(cl)
        setActiveClipId(cl[0].id)
      }
      setLoading(false)
    })
  }, [id])

  const activeClip = clips.find(c => c.id === activeClipId)

  // Load video when active clip changes
  useEffect(() => {
    const video = videoRef.current
    if (!video || !activeClip) return
    video.src = activeClip.video_url
    video.currentTime = activeClip.trim_in || 0
    video.muted = activeClip.muted || false // Apply muted state
    video.load()
    setIsPlaying(false)
    setPlayheadPct((activeClip.trim_in || 0) / (activeClip.duration || 1) * 100)
  }, [activeClip?.id])

  // Caption draft sync
  useEffect(() => {
    if (activeClip) {
      setCaptionDraft(activeClip.caption_text || '')
      setCaptionSizeDraft(activeClip.caption_size || 24)
      setCaptionPosDraft({ x: activeClip.caption_x ?? 50, y: activeClip.caption_y ?? 85 })
    }
  }, [activeClip?.id])

  // Focus caption input when tool opens
  useEffect(() => {
    if (activeTool === 'caption') {
      setTimeout(() => captionInputRef.current?.focus(), 200)
    }
  }, [activeTool])

  // ── Local clip update ──────────────────────────────────────────────────
  function updateClipLocal(clipId, changes) {
    setClips(prev => prev.map(c => c.id === clipId ? { ...c, ...changes } : c))
  }

  async function saveClipChanges(clipId, changes) {
    updateClipLocal(clipId, changes)
    await supabase.from('clips').update(changes).eq('id', clipId)
  }

  // ── Video controls ─────────────────────────────────────────────────────
  function togglePlay() {
    const video = videoRef.current
    if (!video) return
    if (video.paused) video.play().catch(() => {})
    else video.pause()
  }

  function handleTimeUpdate() {
    const video = videoRef.current
    if (!video || !activeClip) return
    const duration = activeClip.duration || video.duration || 1
    setPlayheadPct((video.currentTime / duration) * 100)
    const trimOut = activeClip.trim_out ?? activeClip.duration
    if (trimOut && video.currentTime >= trimOut) {
      video.pause()
      video.currentTime = activeClip.trim_in || 0
    }
  }

  // ── Trim handles ───────────────────────────────────────────────────────
  function startTrimDrag(handle, e) {
    e.preventDefault()
    e.stopPropagation()
    const strip = filmstripRef.current
    if (!strip || !activeClip) return
    
    // Activate handles when drag starts
    setTrimHandlesActive(true)
    
    const rect = strip.getBoundingClientRect()
    const duration = activeClip.duration || 1
    let currentTrimIn = activeClip.trim_in || 0
    let currentTrimOut = activeClip.trim_out ?? duration
    
    // Track initial position to prevent swipe-back
    const startX = e.touches ? e.touches[0].clientX : e.clientX
    const startY = e.touches ? e.touches[0].clientY : e.clientY

    function onMove(ev) {
      const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX
      
      // Prevent horizontal swipe gestures (iOS swipe-back)
      if (ev.touches) {
        const dx = Math.abs(clientX - startX)
        const dy = Math.abs((ev.touches[0].clientY) - startY)
        // Block swipe-back if mostly horizontal movement
        if (dx > dy && dx > 10) {
          ev.preventDefault()
        }
      }
      
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      const time = pct * duration
      const video = videoRef.current
      if (handle === 'in') {
        const newIn = Math.min(time, currentTrimOut - 0.5)
        currentTrimIn = newIn
        updateClipLocal(activeClip.id, { trim_in: newIn })
        if (video) video.currentTime = newIn
      } else {
        const newOut = Math.max(time, currentTrimIn + 0.5)
        currentTrimOut = newOut
        updateClipLocal(activeClip.id, { trim_out: newOut })
        if (video) video.currentTime = newOut
      }
    }

    async function onEnd() {
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onEnd)
      
      // Keep handles visible for 2 seconds after release
      setTimeout(() => setTrimHandlesActive(false), 2000)
      
      await supabase.from('clips')
        .update({ trim_in: currentTrimIn, trim_out: currentTrimOut })
        .eq('id', activeClip.id)
    }

    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onEnd)
  }

  // ── Split mode: sync marker to midpoint when activated ──────────────────
  useEffect(() => {
    if (trimMode === 'split' && activeClip) {
      const mid = ((trimIn + trimOut) / 2)
      const pct = duration > 0 ? (mid / duration) * 100 : 50
      setSplitPct(pct)
      if (videoRef.current) videoRef.current.currentTime = mid
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimMode])

  // ── Split marker drag ───────────────────────────────────────────────────
  function startSplitDrag(e) {
    e.preventDefault()
    e.stopPropagation()
    const strip = filmstripRef.current
    if (!strip || !activeClip) return
    const rect = strip.getBoundingClientRect()
    const clipDuration = activeClip.duration || 1
    const inPct = (activeClip.trim_in || 0) / clipDuration * 100
    const outPct = ((activeClip.trim_out ?? clipDuration) / clipDuration) * 100

    function onMove(ev) {
      const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX
      if (ev.touches) ev.preventDefault()
      const raw = (clientX - rect.left) / rect.width * 100
      const clamped = Math.max(inPct + 1, Math.min(outPct - 1, raw))
      setSplitPct(clamped)
      if (videoRef.current) videoRef.current.currentTime = (clamped / 100) * clipDuration
    }

    function onEnd() {
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onEnd)
    }

    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onEnd)
  }

  // ── Execute split: current clip → two clips at splitPct ─────────────────
  async function executeSplit() {
    if (!activeClip || !duration) return
    const splitTime = (splitPct / 100) * duration
    const activeIndex = clips.findIndex(c => c.id === activeClipId)
    const newId = crypto.randomUUID()

    const newClip = {
      id: newId,
      scrapbook_id: activeClip.scrapbook_id,
      storage_path: activeClip.storage_path,
      video_url: activeClip.video_url,
      thumbnail_url: activeClip.thumbnail_url,
      order: activeClip.order + 1,
      duration: activeClip.duration,
      trim_in: splitTime,
      trim_out: activeClip.trim_out ?? activeClip.duration,
      recorded_at: activeClip.recorded_at,
      caption_text: null,
      caption_x: null,
      caption_y: null,
      caption_size: null,
      muted: activeClip.muted || false,
    }

    // Shift orders of all subsequent clips
    const shifted = clips.map((c, i) => i > activeIndex ? { ...c, order: c.order + 1 } : c)
    const updated = shifted.map(c => c.id === activeClipId ? { ...c, trim_out: splitTime } : c)
    const next = [...updated.slice(0, activeIndex + 1), newClip, ...updated.slice(activeIndex + 1)]
    setClips(next)
    setTrimMode(null)
    setClipsExpanded(true)

    await supabase.from('clips').update({ trim_out: splitTime }).eq('id', activeClip.id)
    await supabase.from('clips').insert(newClip)
    for (let i = activeIndex + 1; i < clips.length; i++) {
      await supabase.from('clips').update({ order: clips[i].order + 1 }).eq('id', clips[i].id)
    }
  }

  // ── Preview swipe to navigate clips ─────────────────────────────────────
  function handlePreviewTouchStart(e) {
    previewSwipeStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }

  function handlePreviewTouchEnd(e) {
    if (!previewSwipeStart.current) return
    const dx = e.changedTouches[0].clientX - previewSwipeStart.current.x
    const dy = Math.abs(e.changedTouches[0].clientY - previewSwipeStart.current.y)
    previewSwipeStart.current = null
    if (Math.abs(dx) < 50 || dy > Math.abs(dx) * 0.8) return
    const activeIndex = clips.findIndex(c => c.id === activeClipId)
    if (dx < 0 && activeIndex < clips.length - 1) {
      setActiveClipId(clips[activeIndex + 1].id)
      setClipsExpanded(false)
    } else if (dx > 0 && activeIndex > 0) {
      setActiveClipId(clips[activeIndex - 1].id)
      setClipsExpanded(false)
    }
  }

  // ── Caption drag ───────────────────────────────────────────────────────
  function startCaptionDrag(e) {
    e.preventDefault()
    e.stopPropagation()
    const preview = previewRef.current
    if (!preview || !activeClip) return
    const rect = preview.getBoundingClientRect()
    let currentX = captionPosDraft.x
    let currentY = captionPosDraft.y

    function onMove(ev) {
      ev.preventDefault()
      const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX
      const clientY = ev.touches ? ev.touches[0].clientY : ev.clientY
      currentX = Math.max(5, Math.min(95, ((clientX - rect.left) / rect.width) * 100))
      currentY = Math.max(5, Math.min(95, ((clientY - rect.top) / rect.height) * 100))
      if (captionRef.current) {
        captionRef.current.style.left = `${currentX}%`
        captionRef.current.style.top = `${currentY}%`
      }
    }

    async function onEnd() {
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onEnd)
      setCaptionPosDraft({ x: currentX, y: currentY })
      await supabase.from('clips').update({ caption_x: currentX, caption_y: currentY }).eq('id', activeClip.id)
    }

    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onEnd)
  }

  // ── Mute toggle ────────────────────────────────────────────────────────
  async function toggleMute() {
    if (!activeClip) return
    const newMuted = !activeClip.muted
    await saveClipChanges(activeClip.id, { muted: newMuted })
    
    // Update video element
    const video = videoRef.current
    if (video) {
      video.muted = newMuted
    }
  }

  // ── Caption save ───────────────────────────────────────────────────────
  async function saveCaptionDraft() {
    if (!activeClip) return
    await saveClipChanges(activeClip.id, {
      caption_text: captionDraft.trim() || null,
      caption_size: captionSizeDraft,
      caption_x: captionPosDraft.x,
      caption_y: captionPosDraft.y,
    })
    setActiveTool(null)
  }

  // ── Remove clip ────────────────────────────────────────────────────────
  async function removeClip(clipId) {
    setConfirmRemoveId(null)
    const clip = clips.find(c => c.id === clipId)
    const remaining = clips.filter(c => c.id !== clipId)
    setClips(remaining)
    if (activeClipId === clipId) setActiveClipId(remaining[0]?.id ?? null)
    await supabase.from('clips').delete().eq('id', clipId)
    // Delete video + thumbnail from storage
    const toDelete = []
    if (clip?.video_url) {
      const p = clip.video_url.split('/cassette-media/')[1]?.split('?')[0]
      if (p) toDelete.push(decodeURIComponent(p))
    }
    if (clip?.thumbnail_url) {
      const p = clip.thumbnail_url.split('/cassette-media/')[1]?.split('?')[0]
      if (p) toDelete.push(decodeURIComponent(p))
    }
    const storageShared = remaining.some(c => c.storage_path === clip?.storage_path)
    if (toDelete.length && !storageShared) await supabase.storage.from('cassette-media').remove(toDelete)
    for (let i = 0; i < remaining.length; i++) {
      await supabase.from('clips').update({ order: i }).eq('id', remaining[i].id)
    }
  }

  // ── Long-press to reorder (touch) ──────────────────────────────────────
  function handleClipTouchStart(e, index) {
    const touch = e.touches[0]
    wasReorderDrag.current = false
    isDraggingActive.current = false
    const rowEl = e.currentTarget
    longPressData.current = { index, rowEl, startY: touch.clientY, clientY: touch.clientY }
    longPressTimer.current = setTimeout(() => {
      const data = longPressData.current
      if (!data) return
      longPressTimer.current = null
      wasReorderDrag.current = true
      isDraggingActive.current = true
      startDragFromTouch(data.index, data.rowEl, data.clientY)
    }, LONG_PRESS_MS)
  }

  function handleClipTouchMove(e) {
    // If drag is active, pass event to drag handler
    if (isDraggingActive.current) {
      // The drag onMove handler is already attached, so just let it handle
      return
    }
    
    // Cancel long press if finger moves before timer fires
    if (!longPressTimer.current || !longPressData.current) return
    const dy = Math.abs(e.touches[0].clientY - longPressData.current.startY)
    if (dy > 10) cancelLongPress()
  }

  function handleClipTouchEnd() {
    cancelLongPress()
    // Reset drag state
    isDraggingActive.current = false
  }

  function cancelLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    longPressData.current = null
  }

  // Called when the long press timer fires — finger is still down
  function startDragFromTouch(fromIndex, rowEl, startClientY) {
    const rowRect = rowEl.getBoundingClientRect()
    ghostOffsetRef.current = startClientY - rowRect.top
    dragState.current = { fromIndex, currentIndex: fromIndex }
    setDragFromIndex(fromIndex)
    setGhostInitialY(startClientY - ghostOffsetRef.current)
    setGhostClip(clipsRef.current[fromIndex])
    setIsActiveDragging(true)

    // Lock scroll position during drag
    const clipList = document.querySelector('[data-clip-list]')
    const scrollTop = clipList?.scrollTop || 0
    
    function onMove(ev) {
      ev.preventDefault()
      const y = ev.touches[0].clientY
      
      // Keep list locked at original scroll position
      if (clipList) {
        clipList.scrollTop = scrollTop
      }
      
      // Move ghost card to follow finger
      if (ghostRef.current) {
        ghostRef.current.style.top = (y - ghostOffsetRef.current) + 'px'
      }
      
      const dy = y - startClientY
      const delta = Math.round(dy / ROW_H)
      const from = dragState.current.fromIndex
      const to = Math.max(0, Math.min(clipsRef.current.length - 1, from + delta))
      
      if (dragState.current && to !== dragState.current.currentIndex) {
        const spliceFrom = dragState.current.currentIndex
        dragState.current.currentIndex = to
        setClips(prev => {
          const next = [...prev]
          const [item] = next.splice(spliceFrom, 1)
          next.splice(to, 0, item)
          return next
        })
      }
    }

    async function onEnd() {
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      dragState.current = null
      setDragFromIndex(null)
      setGhostClip(null)
      setIsActiveDragging(false)
      const current = clipsRef.current
      for (let i = 0; i < current.length; i++) {
        await supabase.from('clips').update({ order: i }).eq('id', current[i].id)
      }
    }

    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd)
  }

  // ── Mouse drag to reorder (desktop) — mousedown on drag handle ─────────
  function startDragFromMouse(fromIndex, e) {
    e.preventDefault()
    e.stopPropagation() // prevent onClick on parent button
    const rowEl = e.currentTarget.closest('[data-clip-row]')
    const rowRect = rowEl.getBoundingClientRect()
    ghostOffsetRef.current = e.clientY - rowRect.top
    const startClientY = e.clientY
    dragState.current = { fromIndex, currentIndex: fromIndex }
    setDragFromIndex(fromIndex)
    setGhostInitialY(startClientY - ghostOffsetRef.current)
    setGhostClip(clipsRef.current[fromIndex])
    setIsActiveDragging(true)

    function onMove(ev) {
      const y = ev.clientY
      if (ghostRef.current) {
        ghostRef.current.style.top = (y - ghostOffsetRef.current) + 'px'
      }
      const dy = y - startClientY
      const delta = Math.round(dy / ROW_H)
      const from = dragState.current.fromIndex
      const to = Math.max(0, Math.min(clipsRef.current.length - 1, from + delta))
      if (dragState.current && to !== dragState.current.currentIndex) {
        const spliceFrom = dragState.current.currentIndex
        dragState.current.currentIndex = to
        setClips(prev => {
          const next = [...prev]
          const [item] = next.splice(spliceFrom, 1)
          next.splice(to, 0, item)
          return next
        })
      }
    }

    async function onEnd() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onEnd)
      dragState.current = null
      setDragFromIndex(null)
      setGhostClip(null)
      setIsActiveDragging(false)
      const current = clipsRef.current
      for (let i = 0; i < current.length; i++) {
        await supabase.from('clips').update({ order: i }).eq('id', current[i].id)
      }
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onEnd)
  }

  // ── Tool toggle ────────────────────────────────────────────────────────
  function toggleTool(tool) {
    if (activeTool === tool) {
      if (tool === 'caption') saveCaptionDraft()
      else setActiveTool(null)
    } else {
      setActiveTool(tool)
    }
  }

  // ── Derived values ─────────────────────────────────────────────────────
  const trimIn = activeClip?.trim_in ?? 0
  const trimOut = activeClip?.trim_out ?? activeClip?.duration ?? 0
  const duration = activeClip?.duration ?? 0
  const trimInPct = duration > 0 ? (trimIn / duration) * 100 : 0
  const trimOutPct = duration > 0 ? (trimOut / duration) * 100 : 100
  const keptDuration = Math.max(0, trimOut - trimIn)
  const editedCount = clips.filter(isEdited).length
  const isCaption = activeTool === 'caption'

  // ── Loading ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-walnut">
        <div className="w-8 h-8 rounded-full border-2 border-amber border-t-transparent animate-spin" />
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col bg-walnut overflow-hidden select-none" style={{ height: '100dvh' }}>

      {/* ── Nav ── */}
      <header className="flex items-center justify-between px-5 pt-12 pb-2 flex-shrink-0">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 text-wheat/45 font-sans text-[15px] font-semibold active:opacity-60"
        >
          <ArrowLeft size={18} strokeWidth={2} />
          Library
        </button>
        <h1 className="font-display font-semibold text-[18px] text-wheat truncate mx-3 max-w-[160px]">
          {scrapbook?.name}
        </h1>
        <button
          onClick={() => navigate(`/scrapbook/${id}/watch`)}
          className="flex items-center gap-1.5 bg-amber text-walnut font-sans font-bold text-[13px] rounded-full px-5 py-2 active:opacity-80"
        >
          <Play size={11} fill="#2C1A0E" strokeWidth={0} />
          Watch
        </button>
      </header>

      {/* ── Preview zone ── */}
      {!reorderMode && (
        <div
          ref={previewRef}
          className="mx-4 rounded-2xl overflow-hidden relative bg-deep"
          style={{
            flexGrow: (isCaption || !clipsExpanded) ? 1 : 0,
            flexShrink: (isCaption || !clipsExpanded) ? 1 : 0,
            minHeight: (isCaption || !clipsExpanded) ? 0 : undefined,
            height: (isCaption || !clipsExpanded) ? undefined : 210,
            transition: 'flex-grow 0.3s ease, height 0.3s ease',
            touchAction: isCaption ? 'none' : 'pan-y',
          }}
          onTouchStart={isCaption ? undefined : handlePreviewTouchStart}
          onTouchEnd={isCaption ? undefined : handlePreviewTouchEnd}
        >
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          onTimeUpdate={handleTimeUpdate}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          playsInline
          preload="metadata"
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.5) 100%)' }}
        />

        {activeClip && (
          <div
            className="absolute top-3 left-3 text-amber text-[10px] font-semibold tracking-widest px-2.5 py-1 rounded-full border"
            style={{ background: 'rgba(0,0,0,0.5)', borderColor: 'rgba(242,162,74,0.2)', backdropFilter: 'blur(6px)' }}
          >
            Clip {clips.findIndex(c => c.id === activeClipId) + 1} of {clips.length}
          </div>
        )}
        {activeClip && (
          <div
            className="absolute top-3 right-3 text-wheat/60 text-[10px] font-semibold tracking-wide px-2.5 py-1 rounded-full"
            style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)' }}
          >
            {fmt(keptDuration)}
          </div>
        )}

        {/* Clip navigation indicators */}
        {!isCaption && clips.length > 1 && (() => {
          const activeIndex = clips.findIndex(c => c.id === activeClipId)
          return (
            <>
              {activeIndex > 0 && (
                <div className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center w-7 h-7 rounded-full"
                  style={{ background: 'rgba(0,0,0,0.3)' }}>
                  <ChevronLeft size={16} strokeWidth={2} className="text-wheat/60" />
                </div>
              )}
              {activeIndex < clips.length - 1 && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center w-7 h-7 rounded-full"
                  style={{ background: 'rgba(0,0,0,0.3)' }}>
                  <ChevronRight size={16} strokeWidth={2} className="text-wheat/60" />
                </div>
              )}
            </>
          )
        })()}

        {!isCaption && (
          <button
            onClick={togglePlay}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center active:opacity-70"
            style={{ background: 'rgba(242,162,74,0.8)', boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }}
          >
            {isPlaying
              ? <Pause size={16} fill="#2C1A0E" strokeWidth={0} />
              : <Play size={16} fill="#2C1A0E" strokeWidth={0} className="ml-0.5" />
            }
          </button>
        )}

        {/* Caption — draggable when caption tool is active */}
        {(isCaption ? captionDraft : activeClip?.caption_text) && (
          <div
            ref={isCaption ? captionRef : null}
            className="absolute"
            style={{
              left: `${isCaption ? captionPosDraft.x : (activeClip.caption_x ?? 50)}%`,
              top: `${isCaption ? captionPosDraft.y : (activeClip.caption_y ?? 85)}%`,
              transform: 'translate(-50%, -50%)',
              cursor: isCaption ? 'grab' : 'default',
              touchAction: isCaption ? 'none' : 'auto',
            }}
            onTouchStart={isCaption ? startCaptionDrag : undefined}
            onMouseDown={isCaption ? startCaptionDrag : undefined}
          >
            {isCaption && (
              <div className="absolute -inset-3 rounded-xl border border-dashed pointer-events-none"
                style={{ borderColor: 'rgba(242,162,74,0.5)' }} />
            )}
            <p
              className="font-display italic text-wheat text-center leading-snug select-none"
              style={{
                fontSize: `${isCaption ? captionSizeDraft : (activeClip?.caption_size || 24)}px`,
                textShadow: '0 2px 10px rgba(0,0,0,0.6)',
                maxWidth: '80%',
              }}
            >
              {isCaption ? captionDraft : activeClip?.caption_text}
            </p>
          </div>
        )}
      </div>
      )}

      {/* ── Trim / Split header — always visible unless caption or reorder ── */}
      {!reorderMode && !isCaption && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-walnut-light flex-shrink-0">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setTrimMode(m => m === 'trim' ? null : 'trim')}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg active:opacity-70 transition-all"
              style={{
                background: trimMode === 'trim' ? 'rgba(242,162,74,0.15)' : 'transparent',
                border: trimMode === 'trim' ? '1px solid rgba(242,162,74,0.3)' : '1px solid transparent',
              }}
            >
              <span className="text-[10px] font-bold tracking-[0.14em] uppercase"
                style={{ color: trimMode === 'trim' ? '#F2A24A' : '#7A3B1E' }}>Trim</span>
            </button>
            <div className="w-px h-3 bg-walnut-light mx-0.5" />
            <button
              onClick={() => setTrimMode(m => m === 'split' ? null : 'split')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg active:opacity-70 transition-all"
              style={{
                background: trimMode === 'split' ? 'rgba(232,133,90,0.15)' : 'transparent',
                border: trimMode === 'split' ? '1px solid rgba(232,133,90,0.3)' : '1px solid transparent',
              }}
            >
              <Scissors size={10} style={{ color: trimMode === 'split' ? '#E8855A' : '#7A3B1E' }} />
              <span className="text-[10px] font-bold tracking-[0.14em] uppercase"
                style={{ color: trimMode === 'split' ? '#E8855A' : '#7A3B1E' }}>Split</span>
            </button>
          </div>
          {trimMode && (
            <div className="flex items-center gap-1.5">
              <span className="text-amber text-[10px] font-bold">{fmt(trimIn)}</span>
              <span className="text-rust/50 text-[9px]">→</span>
              <span className="text-amber text-[10px] font-bold">{fmt(trimOut)}</span>
              <span className="text-rust/40 text-[9px]">·</span>
              <span className="text-wheat/35 text-[10px]">{fmt(keptDuration)} kept</span>
            </div>
          )}
        </div>
      )}

      {/* ── Filmstrip — visible when trimMode is set ── */}
      {!reorderMode && !isCaption && trimMode && (
        <div className="px-4 pt-2.5 pb-2 border-b border-walnut-light flex-shrink-0">
          {/* Filmstrip with handles outside overflow-hidden so they're grabbable at edges */}
          <div className="px-3">
            <div className="relative mb-1">
              {/* Visual filmstrip */}
              <div ref={filmstripRef} className="relative h-16 rounded-lg overflow-hidden">
                <div className="absolute inset-0 flex gap-px">
                  {STRIP_COLORS.map((c, i) => (
                    <div key={i} className="flex-1 h-full" style={{ background: c }} />
                  ))}
                </div>
                <div className="absolute top-0 left-0 bottom-0 rounded-l-lg"
                  style={{ width: `${trimInPct}%`, background: 'rgba(0,0,0,0.62)' }} />
                <div className="absolute top-0 right-0 bottom-0 rounded-r-lg"
                  style={{ width: `${100 - trimOutPct}%`, background: 'rgba(0,0,0,0.62)' }} />
                <div className="absolute top-0 h-[3px] bg-amber"
                  style={{ left: `${trimInPct}%`, right: `${100 - trimOutPct}%` }} />
                <div className="absolute bottom-0 h-[3px] bg-amber"
                  style={{ left: `${trimInPct}%`, right: `${100 - trimOutPct}%` }} />
                <div className="absolute top-0 bottom-0 w-px bg-white/60 pointer-events-none"
                  style={{ left: `${playheadPct}%` }} />
                {/* Split excluded zone overlay */}
                {trimMode === 'split' && (
                  <div className="absolute top-0 bottom-0 pointer-events-none"
                    style={{
                      left: `${splitPct}%`,
                      right: 0,
                      background: 'rgba(232,133,90,0.15)',
                    }} />
                )}
              </div>

              {/* Trim handles — OUTSIDE overflow-hidden, can extend into padding zone */}
              {trimMode === 'trim' && (
                <>
                  {/* IN handle */}
                  <div
                    className="absolute top-0 bottom-0 cursor-ew-resize touch-none z-10"
                    style={{ left: `${trimInPct}%`, width: 52, marginLeft: -26 }}
                    onTouchStart={(e) => startTrimDrag('in', e)}
                    onMouseDown={(e) => startTrimDrag('in', e)}
                  >
                    <div className="absolute left-1/2 top-0 bottom-0 -translate-x-1/2 rounded-full w-[7px]"
                      style={{ background: '#F2A24A', boxShadow: '0 0 8px rgba(242,162,74,0.7)' }} />
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-[5px]">
                      <div className="w-1 h-1 bg-walnut rounded-full" />
                      <div className="w-1 h-1 bg-walnut rounded-full" />
                      <div className="w-1 h-1 bg-walnut rounded-full" />
                    </div>
                  </div>
                  {/* OUT handle */}
                  <div
                    className="absolute top-0 bottom-0 cursor-ew-resize touch-none z-10"
                    style={{ left: `${trimOutPct}%`, width: 52, marginLeft: -26 }}
                    onTouchStart={(e) => startTrimDrag('out', e)}
                    onMouseDown={(e) => startTrimDrag('out', e)}
                  >
                    <div className="absolute left-1/2 top-0 bottom-0 -translate-x-1/2 rounded-full w-[7px]"
                      style={{ background: '#F2A24A', boxShadow: '0 0 8px rgba(242,162,74,0.7)' }} />
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-[5px]">
                      <div className="w-1 h-1 bg-walnut rounded-full" />
                      <div className="w-1 h-1 bg-walnut rounded-full" />
                      <div className="w-1 h-1 bg-walnut rounded-full" />
                    </div>
                  </div>
                </>
              )}

              {/* Split marker */}
              {trimMode === 'split' && (
                <div
                  className="absolute top-0 bottom-0 cursor-ew-resize touch-none z-10"
                  style={{ left: `${splitPct}%`, width: 52, marginLeft: -26 }}
                  onTouchStart={startSplitDrag}
                  onMouseDown={startSplitDrag}
                >
                  <div className="absolute left-1/2 top-0 bottom-0 -translate-x-1/2 w-[3px]"
                    style={{ background: '#E8855A', boxShadow: '0 0 8px rgba(232,133,90,0.8)', borderLeft: '2px dashed rgba(255,255,255,0.3)' }} />
                  <div className="absolute left-1/2 -translate-x-1/2 -top-4 px-1.5 py-0.5 rounded-full text-[9px] font-bold text-walnut whitespace-nowrap"
                    style={{ background: '#E8855A' }}>
                    {fmt((splitPct / 100) * duration)}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-between text-rust text-[8px] font-semibold tracking-wide">
              <span>0:00</span>
              <span>{fmt(duration * 0.25)}</span>
              <span>{fmt(duration * 0.5)}</span>
              <span>{fmt(duration * 0.75)}</span>
              <span>{fmt(duration)}</span>
            </div>
          </div>

          {/* Split confirm button */}
          {trimMode === 'split' && (
            <button
              onClick={executeSplit}
              className="mt-2.5 w-full py-2.5 rounded-xl font-sans font-bold text-[13px] active:opacity-80 flex items-center justify-center gap-2"
              style={{ background: 'rgba(232,133,90,0.15)', border: '1px solid rgba(232,133,90,0.3)', color: '#E8855A' }}
            >
              <Scissors size={13} />
              Cut here · {fmt((splitPct / 100) * duration)}
            </button>
          )}
        </div>
      )}

      {/* ── Tool row ── */}
      {!isCaption && !reorderMode && (
        <div className="flex items-center justify-around px-4 py-2 border-b border-walnut-light flex-shrink-0">
          {[
            { key: 'mute', Icon: activeClip?.muted ? VolumeX : Volume2, label: activeClip?.muted ? 'Unmute' : 'Mute', danger: false },
            { key: 'caption', Icon: Type, label: 'Caption', danger: false },
            { key: 'addclips', Icon: PlusCircle, label: 'Add Clips', danger: false },
            { key: 'reorder', Icon: GripVertical, label: 'Reorder', danger: false },
            { key: 'remove', Icon: Trash2, label: 'Remove', danger: true },
          ].map(({ key, Icon, label, danger }) => {
            const active = activeTool === key || (key === 'reorder' && reorderMode)
            const isMuted = key === 'mute' && activeClip?.muted
            return (
              <button
                key={key}
                onClick={() => {
                  if (key === 'addclips') navigate(`/intake?addTo=${id}`)
                  else if (key === 'remove') setConfirmRemoveId(activeClipId)
                  else if (key === 'reorder') { setReorderMode(!reorderMode); if (!reorderMode) setClipsExpanded(true) }
                  else if (key === 'mute') toggleMute()
                  else toggleTool(key)
                }}
                className="flex flex-col items-center gap-1.5 px-2 py-1.5 rounded-xl active:opacity-70"
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center border"
                  style={{
                    background: (active || isMuted) ? 'rgba(242,162,74,0.12)' : danger ? 'rgba(232,133,90,0.08)' : '#3D2410',
                    borderColor: (active || isMuted) ? 'rgba(242,162,74,0.3)' : danger ? 'rgba(232,133,90,0.2)' : '#4A2E18',
                  }}
                >
                  <Icon size={17} strokeWidth={1.75}
                    style={{ color: (active || isMuted) ? '#F2A24A' : danger ? '#E8855A' : '#7A3B1E' }} />
                </div>
                <span className="text-[9px] font-bold tracking-[0.1em] uppercase"
                  style={{ color: (active || isMuted) ? '#F2A24A' : danger ? 'rgba(232,133,90,0.7)' : '#7A3B1E' }}>
                  {label}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* ── Clip list header ── */}
      {!isCaption && (
        <div className="flex items-center justify-between px-5 py-2.5 flex-shrink-0 border-t border-walnut-light">
          <span className="text-rust text-[9px] font-bold tracking-[0.18em] uppercase">
            {reorderMode ? 'Hold & drag to reorder' : clipsExpanded ? 'All clips' : 'Current clip'}
          </span>
          {reorderMode ? (
            <button
              onClick={() => setReorderMode(false)}
              className="text-amber font-bold text-sm active:opacity-70"
            >
              Done
            </button>
          ) : (
            <button
              onClick={() => setClipsExpanded(e => !e)}
              className="flex items-center gap-1 text-wheat/40 text-[10px] font-medium active:opacity-70"
            >
              {clipsExpanded
                ? <><ChevronDown size={13} strokeWidth={2} /> Collapse</>
                : <><ChevronUp size={13} strokeWidth={2} /> {clips.length} clips</>
              }
            </button>
          )}
        </div>
      )}

      {/* ── Clip list ── */}
      {!isCaption && (
        <div data-clip-list className={clipsExpanded ? 'flex-1 overflow-y-auto px-4 pb-6 flex flex-col gap-1.5' : 'flex-shrink-0 px-4 pb-4 flex flex-col gap-1.5'}>
          {(clipsExpanded ? clips : clips.filter(c => c.id === activeClipId)).map((clip, i) => {
            const active = clip.id === activeClipId
            const edited = isEdited(clip)
            const isDragging = isActiveDragging && ghostClip?.id === clip.id

            // While this item is being dragged, show a dashed placeholder in its place
            if (isDragging) {
              return (
                <div
                  key={clip.id}
                  className="rounded-xl border-2 border-dashed flex-shrink-0"
                  style={{
                    height: ROW_H,
                    borderColor: 'rgba(242,162,74,0.3)',
                    background: 'rgba(242,162,74,0.04)',
                  }}
                />
              )
            }

            return (
              <button
                key={clip.id}
                data-clip-row
                type="button"
                onClick={() => {
                  // Guard: if touch action ended in a drag, don't also select
                  if (!wasReorderDrag.current) { setActiveClipId(clip.id); setClipsExpanded(false) }
                }}
                onTouchStart={(e) => handleClipTouchStart(e, i)}
                onTouchMove={handleClipTouchMove}
                onTouchEnd={handleClipTouchEnd}
                className="w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 border text-left flex-shrink-0 active:opacity-80"
                style={{
                  background: '#3D2410',
                  borderColor: active ? '#F2A24A' : '#4A2E18',
                  minHeight: ROW_H,
                }}
              >
                {/* Drag handle — always visible, subtle. Mouse drag target. */}
                <div
                  className="flex flex-col gap-[4px] px-1 py-3 flex-shrink-0 cursor-grab"
                  style={{ opacity: isActiveDragging ? 0.55 : 0.22 }}
                  onMouseDown={(e) => startDragFromMouse(i, e)}
                >
                  {[0, 1, 2].map(n => (
                    <span key={n} className="block w-4 h-0.5 bg-wheat rounded" />
                  ))}
                </div>

                <span className="text-[10px] font-bold w-3.5 text-center flex-shrink-0"
                  style={{ color: active ? '#F2A24A' : '#5A3A20' }}>
                  {i + 1}
                </span>

                <div className="w-12 h-9 rounded-md flex-shrink-0 overflow-hidden"
                  style={{ background: STRIP_COLORS[i % STRIP_COLORS.length] }} />

                <div className="flex-1 min-w-0">
                  <p className="text-wheat/75 text-[12px] font-semibold truncate mb-1">
                    {fmtClipDate(clip.recorded_at) || fmt(clip.duration)}
                  </p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {(!clip.trim_in || clip.trim_in === 0) && (!clip.trim_out || clip.trim_out >= (clip.duration || Infinity))
                      ? <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-walnut-light text-wheat/55">{fmt(clip.duration)}</span>
                      : <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full border text-amber" style={{ background: 'rgba(242,162,74,0.1)', borderColor: 'rgba(242,162,74,0.22)' }}>trimmed</span>
                    }
                    {clip.caption_text && (
                      <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full border text-sienna" style={{ background: 'rgba(232,133,90,0.1)', borderColor: 'rgba(232,133,90,0.2)' }}>caption</span>
                    )}
                    {clip.muted && (
                      <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full border text-rust" style={{ background: 'rgba(122,59,30,0.1)', borderColor: 'rgba(122,59,30,0.25)' }}>muted</span>
                    )}
                  </div>
                </div>

                <div className="flex-shrink-0">
                  {edited ? (
                    <div className="w-[15px] h-[15px] rounded-full flex items-center justify-center" style={{ background: 'rgba(242,162,74,0.15)' }}>
                      <Check size={9} strokeWidth={2.5} className="text-amber" />
                    </div>
                  ) : (
                    <div className="w-[15px] h-[15px] rounded-full border"
                      style={{ borderColor: active ? '#F2A24A' : 'rgba(74,46,24,0.8)' }} />
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* ── Ghost drag card — floats with finger during active drag ── */}
      {ghostClip && (
        <div
          ref={ghostRef}
          className="fixed left-4 right-4 z-50 pointer-events-none flex items-center gap-2.5 rounded-xl px-2.5 py-2 border"
          style={{
            top: ghostInitialY,
            background: '#3D2410',
            borderColor: '#F2A24A',
            boxShadow: '0 12px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(242,162,74,0.2)',
            transform: 'scale(1.03)',
            opacity: 0.97,
          }}
        >
          <div className="flex flex-col gap-[4px] px-1 py-3 opacity-60 flex-shrink-0">
            {[0, 1, 2].map(n => (
              <span key={n} className="block w-4 h-0.5 bg-wheat rounded" />
            ))}
          </div>
          <span className="text-[10px] font-bold w-3.5 text-center flex-shrink-0 text-amber">
            {clips.findIndex(c => c.id === ghostClip.id) + 1}
          </span>
          <div className="w-12 h-9 rounded-md flex-shrink-0 overflow-hidden"
            style={{ background: STRIP_COLORS[clips.findIndex(c => c.id === ghostClip.id) % STRIP_COLORS.length] }} />
          <div className="flex-1 min-w-0">
            <p className="text-wheat/75 text-[12px] font-semibold truncate">
              {fmtClipDate(ghostClip.recorded_at) || fmt(ghostClip.duration)}
            </p>
          </div>
        </div>
      )}

      {/* ── Caption controls panel (inline, not an overlay) ── */}
      {isCaption && (
        <div
          className="flex-shrink-0 border-t border-walnut-light px-5 pt-3.5"
          style={{ background: '#3D2410', paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-rust text-[9px] font-bold tracking-[0.18em] uppercase">
              Caption · drag on preview to reposition
            </p>
            <button onClick={saveCaptionDraft} className="text-amber font-bold text-sm active:opacity-70">
              Done
            </button>
          </div>
          <input
            ref={captionInputRef}
            type="text"
            value={captionDraft}
            onChange={e => setCaptionDraft(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && captionInputRef.current?.blur()}
            placeholder="Type your caption…"
            className="w-full bg-walnut border border-walnut-light rounded-xl px-4 py-3 font-display italic text-wheat placeholder:text-rust/50 outline-none focus:border-amber caret-amber mb-3"
            style={{ fontSize: '16px' }}
          />
          <div className="flex items-center gap-3">
            <span className="text-wheat/40 text-[10px] font-bold tracking-widest uppercase">Size</span>
            <input
              type="range" min={14} max={42} value={captionSizeDraft}
              onChange={e => setCaptionSizeDraft(Number(e.target.value))}
              className="flex-1 accent-amber"
            />
            <span className="text-wheat/40 text-sm font-semibold w-4 text-right">Aa</span>
          </div>
          {captionDraft && (
            <button
              onClick={() => setCaptionDraft('')}
              className="mt-3 w-full py-1.5 text-center text-rust/60 text-[13px] active:opacity-70"
            >
              Remove caption
            </button>
          )}
        </div>
      )}

      {/* ── Remove confirm ── */}
      {confirmRemoveId && (
        <>
          <div className="absolute inset-0 bg-black/50 z-10" onClick={() => setConfirmRemoveId(null)} />
          <div
            className="absolute bottom-0 left-0 right-0 z-20 rounded-t-3xl border-t border-walnut-light px-5 pb-10 pt-1"
            style={{ background: '#3D2410' }}
          >
            <div className="w-10 h-1 rounded-full bg-walnut-light mx-auto mt-3 mb-6" />
            <p className="font-display font-semibold text-xl text-wheat mb-1">Remove this clip?</p>
            <p className="text-rust text-sm mb-8">It won't be deleted from your camera roll — just removed from this scrapbook.</p>
            <button
              onClick={() => removeClip(confirmRemoveId)}
              className="w-full bg-sienna text-white font-sans font-bold text-[15px] rounded-2xl py-4 mb-3 active:opacity-80"
            >
              Remove Clip
            </button>
            <button
              onClick={() => setConfirmRemoveId(null)}
              className="w-full py-3 text-center text-rust font-semibold text-[15px] active:opacity-70"
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  )
}
