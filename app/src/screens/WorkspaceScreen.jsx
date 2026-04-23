import { useState, useRef, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Play, Pause, Type, Trash2, Check, GripVertical, Volume2, VolumeX, PlusCircle, ChevronLeft, ChevronRight, Scissors, Wrench, Undo2, Image } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { safeDeleteClipFiles } from '../lib/mediaDelete'
import { useAuth } from '../context/AuthContext'
import { useUpload } from '../context/UploadContext'
import { getBlob, preloadClip, preloadRest } from '../lib/blobCache'
import { getCached, cacheScrapbook } from '../lib/dataCache'

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
  return hasTrim || clip.cut_in != null || !!clip.caption_text
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
  const { isActive, completedClips, totalClips, scrapbookId: uploadingId } = useUpload()
  const videoRef = useRef(null)
  const filmstripRef = useRef(null)
  const previewRef = useRef(null)
  const clipStripRef = useRef(null)
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
  const [toolsExpanded, setToolsExpanded] = useState(false) // Tools row collapsed by default
  const [trimMode, setTrimMode] = useState(null) // null | 'trim' | 'split'
  const [undoable, setUndoable] = useState(null) // last undoable action
  const [savedFlash, setSavedFlash] = useState(false)
  const savedFlashTimer = useRef(null)
  const [splitInPct, setSplitInPct] = useState(35)  // left cut handle as % of full duration
  const [splitOutPct, setSplitOutPct] = useState(65) // right cut handle as % of full duration

  // Preview swipe navigation
  const previewSwipeStart = useRef(null)

  // Reorder drag state
  const dragState = useRef(null)
  const [dragFromIndex, setDragFromIndex] = useState(null)
  const clipsRef = useRef(clips)
  useEffect(() => { clipsRef.current = clips }, [clips])

  // Clean up any in-flight drag listeners if the component unmounts mid-drag
  useEffect(() => () => { activeDragCleanup.current?.() }, [])

  // Auto-scroll horizontal strip to active card
  useEffect(() => {
    if (!clipStripRef.current || !activeClipId) return
    const card = clipStripRef.current.querySelector(`[data-clip-card="${activeClipId}"]`)
    if (card) card.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [activeClipId])

  // Clear undo when switching clips; reset video-only state when switching to a photo
  useEffect(() => {
    setUndoable(null)
    const clip = clips.find(c => c.id === activeClipId)
    if (clip?.media_type === 'photo') {
      setTrimMode(null)
      setActiveTool(null)
    }
  }, [activeClipId])

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
  const activeDragCleanup = useRef(null) // stores listener cleanup fn for unmount safety

  // ── Fetch ──────────────────────────────────────────────────────────────
  useEffect(() => {
    // Use cached data immediately so there's no loading spinner on navigation from detail screen
    const cached = getCached(id)
    if (cached?.scrapbook) {
      if (cached.scrapbook.user_id !== session?.user?.id) { navigate(`/scrapbook/${id}`, { replace: true }); return }
      setScrapbook(cached.scrapbook)
      if (cached.clips.length) {
        setClips(cached.clips)
        setActiveClipId(cached.clips[0].id)
        preloadRest(cached.clips, 0) // ensure all blobs are fetching
      }
      setLoading(false)
    }

    // Background refresh to pick up any changes since cache was populated
    Promise.all([
      supabase.from('scrapbooks').select('id, name, user_id').eq('id', id).single(),
      supabase.from('clips').select('*').eq('scrapbook_id', id).order('order', { ascending: true }),
    ]).then(([{ data: sb }, { data: cl }]) => {
      if (sb) {
        if (sb.user_id !== session?.user?.id) { navigate(`/scrapbook/${id}`, { replace: true }); return }
        setScrapbook(sb)
        cacheScrapbook(id, sb, cl || []) // keep cache fresh
      }
      if (cl && cl.length) {
        setClips(cl)
        if (!cached) setActiveClipId(cl[0].id)
        preloadRest(cl, 0)
      }
      if (!cached) setLoading(false)
    })
  }, [id])

  // Pick up new clips as they land from the background upload queue
  useEffect(() => {
    const channel = supabase
      .channel(`workspace-clips:${id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'clips',
        filter: `scrapbook_id=eq.${id}`,
      }, payload => {
        setClips(prev => {
          if (prev.some(c => c.id === payload.new.id)) return prev
          return [...prev, payload.new].sort((a, b) => a.order - b.order)
        })
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [id])

  const uploadingThisScrapbook = isActive && uploadingId === id
  const pendingCount = uploadingThisScrapbook ? totalClips - completedClips : 0

  const activeClip = clips.find(c => c.id === activeClipId)

  // Load video when active clip changes — use blob URL if cached for instant start
  useEffect(() => {
    if (!activeClip) return
    setIsPlaying(false)
    setPlayheadPct(0)
    if (activeClip.media_type === 'photo') return
    const video = videoRef.current
    if (!video) return
    video.src = getBlob(activeClip.video_url)
    video.currentTime = activeClip.trim_in || 0
    video.muted = activeClip.muted || false
    video.load()
    setPlayheadPct((activeClip.trim_in || 0) / (activeClip.duration || 1) * 100)
    // Preload adjacent clips in background
    const idx = clips.findIndex(c => c.id === activeClipId)
    if (clips[idx + 1]) preloadClip(clips[idx + 1].video_url)
    if (clips[idx - 1]) preloadClip(clips[idx - 1].video_url)
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
    const prevClip = clips.find(c => c.id === clipId)
    updateClipLocal(clipId, changes)
    const { error } = await supabase.from('clips').update(changes).eq('id', clipId)
    if (error) {
      // Revert local state to what it was before the optimistic update
      if (prevClip) {
        const revert = Object.fromEntries(Object.keys(changes).map(k => [k, prevClip[k] ?? null]))
        updateClipLocal(clipId, revert)
      }
      return
    }
    clearTimeout(savedFlashTimer.current)
    setSavedFlash(true)
    savedFlashTimer.current = setTimeout(() => setSavedFlash(false), 2500)
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
    // Skip over cut region
    if (activeClip.cut_in != null && activeClip.cut_out != null &&
        video.currentTime >= activeClip.cut_in && video.currentTime < activeClip.cut_out) {
      video.currentTime = activeClip.cut_out
    }
    const trimOut = activeClip.trim_out ?? activeClip.duration
    if (trimOut && video.currentTime >= trimOut) {
      video.pause()
      video.currentTime = activeClip.trim_in || 0
    }
  }

  // ── Trim handles (handles trim_in, trim_out, cut_in, cut_out) ──────────
  function startTrimDrag(handle, e) {
    e.preventDefault()
    e.stopPropagation()
    const strip = filmstripRef.current
    if (!strip || !activeClip) return

    setTrimHandlesActive(true)

    const rect = strip.getBoundingClientRect()
    const dur = activeClip.duration || 1
    const initialTrimIn = activeClip.trim_in || 0
    const initialTrimOut = activeClip.trim_out ?? dur
    const initialCutIn = activeClip.cut_in ?? null
    const initialCutOut = activeClip.cut_out ?? null
    let currentTrimIn = initialTrimIn
    let currentTrimOut = initialTrimOut
    let currentCutIn = initialCutIn
    let currentCutOut = initialCutOut

    const startX = e.touches ? e.touches[0].clientX : e.clientX
    const startY = e.touches ? e.touches[0].clientY : e.clientY

    function onMove(ev) {
      const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX
      if (ev.touches) {
        const dx = Math.abs(clientX - startX)
        const dy = Math.abs(ev.touches[0].clientY - startY)
        if (dx > dy && dx > 10) ev.preventDefault()
      }
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      const time = pct * dur
      const video = videoRef.current
      if (handle === 'in') {
        const newIn = Math.min(time, currentTrimOut - 0.5)
        currentTrimIn = newIn
        updateClipLocal(activeClip.id, { trim_in: newIn })
        if (video) video.currentTime = newIn
      } else if (handle === 'out') {
        const newOut = Math.max(time, currentTrimIn + 0.5)
        currentTrimOut = newOut
        updateClipLocal(activeClip.id, { trim_out: newOut })
        if (video) video.currentTime = newOut
      } else if (handle === 'cut_in') {
        const maxCutIn = currentCutOut != null ? currentCutOut - 0.1 : currentTrimOut - 0.1
        const newCutIn = Math.max(currentTrimIn + 0.1, Math.min(time, maxCutIn))
        currentCutIn = newCutIn
        updateClipLocal(activeClip.id, { cut_in: newCutIn })
        if (video) video.currentTime = newCutIn
      } else if (handle === 'cut_out') {
        const minCutOut = currentCutIn != null ? currentCutIn + 0.1 : currentTrimIn + 0.1
        const newCutOut = Math.max(minCutOut, Math.min(time, currentTrimOut - 0.1))
        currentCutOut = newCutOut
        updateClipLocal(activeClip.id, { cut_out: newCutOut })
        if (video) video.currentTime = newCutOut
      }
    }

    async function onEnd() {
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onEnd)
      activeDragCleanup.current = null

      setTimeout(() => setTrimHandlesActive(false), 2000)

      if (handle === 'in' || handle === 'out') {
        setUndoable({ type: 'clip', clipId: activeClip.id, prev: { trim_in: initialTrimIn, trim_out: initialTrimOut } })
        await supabase.from('clips').update({ trim_in: currentTrimIn, trim_out: currentTrimOut }).eq('id', activeClip.id)
      } else {
        setUndoable({ type: 'clip', clipId: activeClip.id, prev: { cut_in: initialCutIn, cut_out: initialCutOut } })
        await supabase.from('clips').update({ cut_in: currentCutIn, cut_out: currentCutOut }).eq('id', activeClip.id)
      }
    }

    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onEnd)
    activeDragCleanup.current = () => {
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onEnd)
    }
  }

  // ── Split mode: auto-place two handles centered in playable range ──
  useEffect(() => {
    if (trimMode === 'split' && activeClip) {
      const start = trimIn
      const end = trimOut ?? duration
      const range = end - start
      const center = start + range * 0.5
      const half = Math.max(1, range * 0.15)
      const inTime = Math.max(start + 0.1, center - half)
      const outTime = Math.min(end - 0.1, center + half)
      setSplitInPct(duration > 0 ? (inTime / duration) * 100 : 35)
      setSplitOutPct(duration > 0 ? (outTime / duration) * 100 : 65)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimMode])

  // ── Split handle drag ───────────────────────────────────────────────────
  function startSplitHandleDrag(which, e) {
    e.preventDefault()
    e.stopPropagation()
    const strip = filmstripRef.current
    if (!strip || !activeClip) return
    const rect = strip.getBoundingClientRect()
    const clipDuration = activeClip.duration || 1
    const trimInBound = (activeClip.trim_in || 0) / clipDuration * 100
    const trimOutBound = ((activeClip.trim_out ?? clipDuration) / clipDuration) * 100
    const minGapPct = Math.min(2 / clipDuration * 100, 5)
    let currentInPct = splitInPct
    let currentOutPct = splitOutPct

    function onMove(ev) {
      const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX
      if (ev.touches) ev.preventDefault()
      const raw = (clientX - rect.left) / rect.width * 100
      if (which === 'in') {
        const clamped = Math.max(trimInBound + 0.5, Math.min(currentOutPct - minGapPct, raw))
        currentInPct = clamped
        setSplitInPct(clamped)
      } else {
        const clamped = Math.max(currentInPct + minGapPct, Math.min(trimOutBound - 0.5, raw))
        currentOutPct = clamped
        setSplitOutPct(clamped)
      }
      if (videoRef.current) videoRef.current.currentTime = (raw / 100) * clipDuration
    }

    function onEnd() {
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onEnd)
      activeDragCleanup.current = null
    }

    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onEnd)
    activeDragCleanup.current = () => {
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onEnd)
    }
  }

  // ── Commit split cut ─────────────────────────────────────────────────────
  async function commitSplit() {
    if (!activeClip || !duration) return
    const cutInTime = (splitInPct / 100) * duration
    const cutOutTime = (splitOutPct / 100) * duration
    setUndoable({ type: 'clip', clipId: activeClip.id, prev: { cut_in: activeClip.cut_in ?? null, cut_out: activeClip.cut_out ?? null } })
    await saveClipChanges(activeClip.id, { cut_in: cutInTime, cut_out: cutOutTime })
    setTrimMode(null)
  }

  // ── Mini timeline scrub ─────────────────────────────────────────────────
  function startMiniScrub(e) {
    e.preventDefault()
    const track = filmstripRef.current
    const video = videoRef.current
    if (!track || !video || !activeClip) return

    function seek(ev) {
      const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX
      const rect = track.getBoundingClientRect()
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      video.currentTime = pct * (activeClip.duration || 1)
      setPlayheadPct(pct * 100)
    }

    seek(e)

    function onMove(ev) {
      if (ev.touches) ev.preventDefault()
      seek(ev)
    }
    function onEnd() {
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onEnd)
      activeDragCleanup.current = null
    }
    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onEnd)
    activeDragCleanup.current = () => {
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onEnd)
    }
  }

  // ── Remove split ────────────────────────────────────────────────────────
  async function removeSplit() {
    if (!activeClip) return
    setUndoable({ type: 'clip', clipId: activeClip.id, prev: { cut_in: activeClip.cut_in, cut_out: activeClip.cut_out } })
    await saveClipChanges(activeClip.id, { cut_in: null, cut_out: null })
    setTrimMode(null)
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
    } else if (dx > 0 && activeIndex > 0) {
      setActiveClipId(clips[activeIndex - 1].id)
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
      activeDragCleanup.current = null
      setCaptionPosDraft({ x: currentX, y: currentY })
      await supabase.from('clips').update({ caption_x: currentX, caption_y: currentY }).eq('id', activeClip.id)
    }

    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onEnd)
    activeDragCleanup.current = () => {
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onEnd)
    }
  }

  // ── Mute toggle ────────────────────────────────────────────────────────
  // NOTE: muted is client-side only — no DB column. Never pass to saveClipChanges.
  function toggleMute() {
    if (!activeClip) return
    const newMuted = !activeClip.muted
    // Set video element immediately
    const video = videoRef.current
    if (video) video.muted = newMuted
    setUndoable({ type: 'clip', clipId: activeClip.id, prev: { muted: activeClip.muted || false } })
    updateClipLocal(activeClip.id, { muted: newMuted })
  }

  // ── Caption save ───────────────────────────────────────────────────────
  async function saveCaptionDraft() {
    if (!activeClip) return
    setUndoable({ type: 'clip', clipId: activeClip.id, prev: {
      caption_text: activeClip.caption_text || null,
      caption_size: activeClip.caption_size || 24,
      caption_x: activeClip.caption_x ?? 50,
      caption_y: activeClip.caption_y ?? 85,
    }})
    await saveClipChanges(activeClip.id, {
      caption_text: captionDraft.trim() || null,
      caption_size: captionSizeDraft,
      caption_x: captionPosDraft.x,
      caption_y: captionPosDraft.y,
    })
    setActiveTool(null)
  }

  // ── Undo last action ───────────────────────────────────────────────────
  async function handleUndo() {
    if (!undoable) return
    const op = undoable
    setUndoable(null)

    if (op.type === 'clip') {
      updateClipLocal(op.clipId, op.prev)
      if (videoRef.current && op.prev.trim_in !== undefined) {
        videoRef.current.currentTime = op.prev.trim_in || 0
      }
      await supabase.from('clips').update(op.prev).eq('id', op.clipId)
    }
  }

  // ── Remove clip ────────────────────────────────────────────────────────
  async function removeClip(clipId) {
    setConfirmRemoveId(null)
    const clip = clips.find(c => c.id === clipId)
    const remaining = clips.filter(c => c.id !== clipId)
    setClips(remaining)
    if (activeClipId === clipId) setActiveClipId(remaining[0]?.id ?? null)
    await supabase.from('clips').delete().eq('id', clipId)
    // Only delete R2 files if no other clips (in any scrapbook) reference the same URLs
    if (clip) await safeDeleteClipFiles([clip])
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
      activeDragCleanup.current = null
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
    activeDragCleanup.current = () => {
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
    }
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
      activeDragCleanup.current = null
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
    activeDragCleanup.current = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onEnd)
    }
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
  const isPhoto = activeClip?.media_type === 'photo'
  const trimIn = activeClip?.trim_in ?? 0
  const trimOut = activeClip?.trim_out ?? activeClip?.duration ?? 0
  const duration = activeClip?.duration ?? 0
  const trimInPct = duration > 0 ? (trimIn / duration) * 100 : 0
  const trimOutPct = duration > 0 ? (trimOut / duration) * 100 : 100
  const cutIn = activeClip?.cut_in ?? null
  const cutOut = activeClip?.cut_out ?? null
  const cutInPct = cutIn != null && duration > 0 ? (cutIn / duration) * 100 : null
  const cutOutPct = cutOut != null && duration > 0 ? (cutOut / duration) * 100 : null
  const keptDuration = Math.max(0, trimOut - trimIn) - (cutIn != null && cutOut != null ? Math.max(0, cutOut - cutIn) : 0)
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
          onClick={() => navigate(`/scrapbook/${id}`)}
          className="flex items-center gap-1.5 text-wheat/45 font-sans text-[15px] font-semibold active:opacity-60"
        >
          <ArrowLeft size={18} strokeWidth={2} />
          Back
        </button>
        <h1 className="font-display font-semibold text-[18px] text-wheat truncate mx-3 max-w-[160px]">
          {scrapbook?.name}
        </h1>
        <div className="flex items-center gap-2">
          {savedFlash && (
            <span className="text-amber/70 font-sans text-[12px] font-semibold">saved</span>
          )}
          {undoable && (
            <button
              onClick={handleUndo}
              className="w-8 h-8 rounded-full flex items-center justify-center active:opacity-70"
              style={{ background: 'rgba(242,162,74,0.1)', border: '1px solid rgba(242,162,74,0.25)' }}
            >
              <Undo2 size={15} style={{ color: '#F2A24A' }} />
            </button>
          )}
          <button
            onClick={() => navigate(`/scrapbook/${id}`)}
            className="flex items-center gap-1.5 bg-amber text-walnut font-sans font-bold text-[13px] rounded-full px-5 py-2 active:opacity-80"
          >
            <Check size={13} strokeWidth={3} />
            Save
          </button>
        </div>
      </header>

      {pendingCount > 0 && (
        <p className="text-rust text-[10px] font-sans text-center pb-1 flex-shrink-0">
          {pendingCount} clip{pendingCount !== 1 ? 's' : ''} still uploading in the background
        </p>
      )}

      {/* ── Preview zone ── */}
      {!reorderMode && (
        <div
          ref={previewRef}
          className="mx-4 rounded-2xl overflow-hidden relative bg-deep"
          style={{
            flex: '1 1 0',
            minHeight: 0,
            touchAction: isCaption ? 'none' : 'pan-y',
          }}
          onTouchStart={isCaption ? undefined : handlePreviewTouchStart}
          onTouchEnd={isCaption ? undefined : handlePreviewTouchEnd}
        >
        {isPhoto ? (
          <img
            src={activeClip?.video_url}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            onTimeUpdate={handleTimeUpdate}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            playsInline
            preload="auto"
            poster={activeClip?.thumbnail_url || undefined}
          />
        )}
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

        {!isCaption && !isPhoto && (
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
            {!isPhoto && (
              <>
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
                <div className="w-px h-3 bg-walnut-light mx-0.5" />
              </>
            )}
            <button
              onClick={() => setToolsExpanded(e => !e)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg active:opacity-70 transition-all"
              style={{
                background: toolsExpanded ? 'rgba(242,162,74,0.15)' : 'transparent',
                border: toolsExpanded ? '1px solid rgba(242,162,74,0.3)' : '1px solid transparent',
              }}
            >
              <Wrench size={10} style={{ color: toolsExpanded ? '#F2A24A' : '#7A3B1E' }} />
              <span className="text-[10px] font-bold tracking-[0.14em] uppercase"
                style={{ color: toolsExpanded ? '#F2A24A' : '#7A3B1E' }}>Tools</span>
            </button>
          </div>
          {activeClip && !isPhoto && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold" style={{ color: trimInPct > 0 ? '#F2A24A' : '#7A3B1E' }}>{fmt(trimIn)}</span>
              <span className="text-rust/50 text-[9px]">→</span>
              <span className="text-[10px] font-bold" style={{ color: trimOutPct < 100 ? '#F2A24A' : '#7A3B1E' }}>{fmt(trimOut)}</span>
              <span className="text-rust/40 text-[9px]">·</span>
              <span className="text-wheat/35 text-[10px]">{fmt(keptDuration)} kept</span>
            </div>
          )}
          {activeClip && isPhoto && (
            <div className="flex items-center gap-1.5">
              <Image size={9} style={{ color: '#7A3B1E' }} />
              <span className="text-wheat/35 text-[10px]">Photo · {activeClip.duration || 5}s</span>
            </div>
          )}
        </div>
      )}

      {/* ── Mini clip timeline — visible when no trim/split mode ── */}
      {!reorderMode && !isCaption && !trimMode && activeClip && (
        <div className="px-4 pt-2.5 pb-2 border-b border-walnut-light flex-shrink-0">
          {isPhoto ? (
            /* Static full bar for photos — no scrub, just shows duration */
            <div className="relative" style={{ height: 28 }}>
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-full overflow-hidden" style={{ height: 6, background: '#2C1A0E' }}>
                <div className="absolute inset-0 rounded-full" style={{ background: 'rgba(242,162,74,0.45)' }} />
              </div>
            </div>
          ) : (
          <div
            className="relative touch-none"
            style={{ height: 28 }}
            onTouchStart={startMiniScrub}
            onMouseDown={startMiniScrub}
          >
            {/* Track */}
            <div
              ref={filmstripRef}
              className="absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-full overflow-hidden"
              style={{ height: 6, background: '#2C1A0E' }}
            >
              {/* Trimmed-out left */}
              {trimInPct > 0 && (
                <div className="absolute left-0 top-0 bottom-0" style={{ width: `${trimInPct}%`, background: '#2C1A0E' }} />
              )}
              {/* Kept region */}
              <div
                className="absolute top-0 bottom-0 rounded-full"
                style={{ left: `${trimInPct}%`, right: `${100 - trimOutPct}%`, background: 'rgba(242,162,74,0.45)' }}
              />
              {/* Cut region stripe */}
              {cutInPct != null && cutOutPct != null && (
                <div className="absolute top-0 bottom-0"
                  style={{ left: `${cutInPct}%`, width: `${cutOutPct - cutInPct}%`, background: 'rgba(0,0,0,0.5)' }} />
              )}
              {/* Trimmed-out right */}
              {trimOutPct < 100 && (
                <div className="absolute right-0 top-0 bottom-0" style={{ width: `${100 - trimOutPct}%`, background: '#2C1A0E' }} />
              )}
              {/* Playhead line */}
              <div
                className="absolute top-0 bottom-0 w-[2px]"
                style={{ left: `${playheadPct}%`, background: 'rgba(255,255,255,0.75)' }}
              />
            </div>
            {/* Playhead dot — marks drag target */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full pointer-events-none"
              style={{ left: `${playheadPct}%`, marginLeft: -6, background: 'rgba(255,255,255,0.9)', boxShadow: '0 0 4px rgba(0,0,0,0.4)', zIndex: 10 }}
            />
            {/* Trim in marker */}
            {trimInPct > 0 && (
              <div className="absolute top-0 bottom-0 w-[2px] rounded-full" style={{ left: `${trimInPct}%`, background: '#F2A24A' }} />
            )}
            {/* Trim out marker */}
            {trimOutPct < 100 && (
              <div className="absolute top-0 bottom-0 w-[2px] rounded-full" style={{ left: `${trimOutPct}%`, background: '#F2A24A' }} />
            )}
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
                {/* Cut region overlay */}
                {cutInPct != null && cutOutPct != null && (
                  <div className="absolute top-0 bottom-0 pointer-events-none"
                    style={{ left: `${cutInPct}%`, width: `${cutOutPct - cutInPct}%`, background: 'rgba(0,0,0,0.55)' }} />
                )}
                <div className="absolute top-0 h-[3px] bg-amber"
                  style={{ left: `${trimInPct}%`, right: `${100 - trimOutPct}%` }} />
                <div className="absolute bottom-0 h-[3px] bg-amber"
                  style={{ left: `${trimInPct}%`, right: `${100 - trimOutPct}%` }} />
                <div className="absolute top-0 bottom-0 w-px bg-white/60 pointer-events-none"
                  style={{ left: `${playheadPct}%` }} />
                {/* Split excluded zone — shade between the two split handles */}
                {trimMode === 'split' && cutIn == null && (
                  <div className="absolute top-0 bottom-0 pointer-events-none"
                    style={{
                      left: `${splitInPct}%`,
                      width: `${splitOutPct - splitInPct}%`,
                      background: 'rgba(232,133,90,0.22)',
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
                  {/* Cut handles — only shown when cut_in/cut_out are set */}
                  {cutInPct != null && (
                    <div
                      className="absolute top-0 bottom-0 cursor-ew-resize touch-none z-20"
                      style={{ left: `${cutInPct}%`, width: 52, marginLeft: -26 }}
                      onTouchStart={(e) => startTrimDrag('cut_in', e)}
                      onMouseDown={(e) => startTrimDrag('cut_in', e)}
                    >
                      <div className="absolute left-1/2 top-0 bottom-0 -translate-x-1/2 w-[5px] rounded-full"
                        style={{ background: '#E8855A', boxShadow: '0 0 8px rgba(232,133,90,0.8)' }} />
                      <div className="absolute left-1/2 -translate-x-1/2 -top-5 px-1.5 py-0.5 rounded-full text-[8px] font-bold text-walnut whitespace-nowrap"
                        style={{ background: '#E8855A' }}>
                        {fmt(cutIn)}
                      </div>
                    </div>
                  )}
                  {cutOutPct != null && (
                    <div
                      className="absolute top-0 bottom-0 cursor-ew-resize touch-none z-20"
                      style={{ left: `${cutOutPct}%`, width: 52, marginLeft: -26 }}
                      onTouchStart={(e) => startTrimDrag('cut_out', e)}
                      onMouseDown={(e) => startTrimDrag('cut_out', e)}
                    >
                      <div className="absolute left-1/2 top-0 bottom-0 -translate-x-1/2 w-[5px] rounded-full"
                        style={{ background: '#E8855A', boxShadow: '0 0 8px rgba(232,133,90,0.8)' }} />
                      <div className="absolute left-1/2 -translate-x-1/2 -top-5 px-1.5 py-0.5 rounded-full text-[8px] font-bold text-walnut whitespace-nowrap"
                        style={{ background: '#E8855A' }}>
                        {fmt(cutOut)}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Split handles — both draggable immediately */}
              {trimMode === 'split' && cutIn == null && (<>
                {/* In handle */}
                <div
                  className="absolute top-0 bottom-0 cursor-ew-resize touch-none z-20"
                  style={{ left: `${splitInPct}%`, width: 52, marginLeft: -26 }}
                  onTouchStart={(e) => startSplitHandleDrag('in', e)}
                  onMouseDown={(e) => startSplitHandleDrag('in', e)}
                >
                  <div className="absolute left-1/2 top-0 bottom-0 -translate-x-1/2 w-[3px]"
                    style={{ background: '#E8855A', boxShadow: '0 0 8px rgba(232,133,90,0.8)' }} />
                  <div className="absolute left-1/2 -translate-x-1/2 -top-4 px-1.5 py-0.5 rounded-full text-[9px] font-bold text-walnut whitespace-nowrap"
                    style={{ background: '#E8855A' }}>
                    {fmt((splitInPct / 100) * duration)}
                  </div>
                </div>
                {/* Out handle */}
                <div
                  className="absolute top-0 bottom-0 cursor-ew-resize touch-none z-20"
                  style={{ left: `${splitOutPct}%`, width: 52, marginLeft: -26 }}
                  onTouchStart={(e) => startSplitHandleDrag('out', e)}
                  onMouseDown={(e) => startSplitHandleDrag('out', e)}
                >
                  <div className="absolute left-1/2 top-0 bottom-0 -translate-x-1/2 w-[3px]"
                    style={{ background: '#E8855A', boxShadow: '0 0 8px rgba(232,133,90,0.8)' }} />
                  <div className="absolute left-1/2 -translate-x-1/2 -top-4 px-1.5 py-0.5 rounded-full text-[9px] font-bold text-walnut whitespace-nowrap"
                    style={{ background: '#E8855A' }}>
                    {fmt((splitOutPct / 100) * duration)}
                  </div>
                </div>
              </>)}
            </div>

            <div className="flex justify-between text-rust text-[8px] font-semibold tracking-wide">
              <span>0:00</span>
              <span>{fmt(duration * 0.25)}</span>
              <span>{fmt(duration * 0.5)}</span>
              <span>{fmt(duration * 0.75)}</span>
              <span>{fmt(duration)}</span>
            </div>
          </div>

          {/* Split confirm or remove */}
          {trimMode === 'split' && (
            cutIn != null ? (
              <button
                onClick={removeSplit}
                className="mt-2.5 w-full py-2.5 rounded-xl font-sans font-bold text-[13px] active:opacity-80 flex items-center justify-center gap-2"
                style={{ background: 'rgba(232,133,90,0.1)', border: '1px solid rgba(232,133,90,0.3)', color: '#E8855A' }}
              >
                <Scissors size={13} />
                Remove cut
              </button>
            ) : (
              <button
                onClick={commitSplit}
                className="mt-2.5 w-full py-2.5 rounded-xl font-sans font-bold text-[13px] active:opacity-80 flex items-center justify-center gap-2"
                style={{ background: '#E8855A', color: '#2C1A0E' }}
              >
                <Scissors size={13} />
                Split
              </button>
            )
          )}
        </div>
      )}

      {/* ── Tool row ── */}
      {!isCaption && !reorderMode && toolsExpanded && (
        <>
        <div className="flex items-center justify-around px-4 py-2 border-b border-walnut-light flex-shrink-0">
          {(isPhoto
            ? [
                { key: 'caption', Icon: Type, label: 'Caption', danger: false },
                { key: 'addclips', Icon: PlusCircle, label: 'Add Clips', danger: false },
                { key: 'reorder', Icon: GripVertical, label: 'Reorder', danger: false },
                { key: 'remove', Icon: Trash2, label: 'Remove', danger: true },
              ]
            : [
                { key: 'mute', Icon: activeClip?.muted ? VolumeX : Volume2, label: activeClip?.muted ? 'Unmute' : 'Mute', danger: false },
                { key: 'caption', Icon: Type, label: 'Caption', danger: false },
                { key: 'addclips', Icon: PlusCircle, label: 'Add Clips', danger: false },
                { key: 'reorder', Icon: GripVertical, label: 'Reorder', danger: false },
                { key: 'remove', Icon: Trash2, label: 'Remove', danger: true },
              ]
          ).map(({ key, Icon, label, danger }) => {
            const active = activeTool === key || (key === 'reorder' && reorderMode)
            const isMuted = key === 'mute' && activeClip?.muted
            return (
              <button
                key={key}
                onClick={() => {
                  if (key === 'addclips') navigate(`/intake?addTo=${id}`)
                  else if (key === 'remove') setConfirmRemoveId(activeClipId)
                  else if (key === 'reorder') setReorderMode(!reorderMode)
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
        {/* Duration stepper — photos only */}
        {isPhoto && (
          <div className="flex items-center justify-between px-5 py-2.5 border-b border-walnut-light flex-shrink-0">
            <span className="text-[10px] font-bold tracking-[0.14em] uppercase" style={{ color: '#7A3B1E' }}>Display Duration</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  const newDur = Math.max(1, (activeClip.duration || 5) - 1)
                  saveClipChanges(activeClipId, { duration: newDur, trim_out: newDur })
                }}
                className="w-8 h-8 rounded-full flex items-center justify-center border active:opacity-70"
                style={{ background: '#3D2410', borderColor: '#4A2E18' }}
              >
                <span className="text-wheat/70 font-bold text-lg leading-none select-none">−</span>
              </button>
              <span className="font-display font-semibold text-[18px] text-wheat tabular-nums w-10 text-center">
                {activeClip.duration || 5}s
              </span>
              <button
                onClick={() => {
                  const newDur = Math.min(30, (activeClip.duration || 5) + 1)
                  saveClipChanges(activeClipId, { duration: newDur, trim_out: newDur })
                }}
                className="w-8 h-8 rounded-full flex items-center justify-center border active:opacity-70"
                style={{ background: '#3D2410', borderColor: '#4A2E18' }}
              >
                <span className="text-amber font-bold text-lg leading-none select-none">+</span>
              </button>
            </div>
          </div>
        )}
        </>
      )}

      {/* ── Horizontal clip strip ── */}
      {!isCaption && !reorderMode && (
        <div
          ref={clipStripRef}
          className="flex-shrink-0 overflow-x-auto border-t border-walnut-light"
          style={{ scrollbarWidth: 'none', paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <div className="flex gap-2 px-4 pt-3 pb-1">
            {clips.map((clip, i) => {
              const active = clip.id === activeClipId
              const hasTrim = (clip.trim_in > 0) || (clip.trim_out && clip.trim_out < (clip.duration || Infinity)) || clip.cut_in != null
              const clipKept = (clip.trim_out ?? clip.duration) - (clip.trim_in || 0)
              return (
                <button
                  key={clip.id}
                  data-clip-card={clip.id}
                  onClick={() => setActiveClipId(clip.id)}
                  className="flex-shrink-0 flex flex-col items-center gap-1 active:opacity-70"
                >
                  <div
                    className="rounded-xl border flex flex-col items-center justify-between"
                    style={{
                      width: 64,
                      height: 64,
                      padding: '7px 4px 6px',
                      background: active ? 'rgba(242,162,74,0.1)' : '#3D2410',
                      borderColor: active ? '#F2A24A' : '#4A2E18',
                    }}
                  >
                    <span className="text-[13px] font-bold leading-none"
                      style={{ color: active ? '#F2A24A' : '#7A3B1E' }}>
                      {i + 1}
                    </span>
                    <div className="flex items-center gap-1">
                      {hasTrim && <Scissors size={10} style={{ color: active ? '#F2A24A' : '#7A3B1E' }} />}
                      {clip.caption_text && <Type size={10} style={{ color: '#E8855A' }} />}
                      {clip.muted && <VolumeX size={10} style={{ color: '#7A3B1E' }} />}
                      {clip.media_type === 'photo' && (
                        <Image size={10} style={{ color: active ? '#F2A24A' : '#7A3B1E' }} />
                      )}
                      {clip.media_type !== 'photo' && !hasTrim && !clip.caption_text && !clip.muted && (
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: active ? '#F2A24A' : '#4A2E18' }} />
                      )}
                    </div>
                  </div>
                  <span className="text-[9px] font-semibold"
                    style={{ color: active ? '#F2A24A' : '#5A3A20' }}>
                    {fmt(clipKept || clip.duration)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Reorder mode: header + vertical drag list ── */}
      {reorderMode && (
        <>
          <div className="flex items-center justify-between px-5 py-2.5 flex-shrink-0 border-t border-walnut-light">
            <span className="text-rust text-[9px] font-bold tracking-[0.18em] uppercase">Hold &amp; drag to reorder</span>
            <button onClick={() => setReorderMode(false)} className="text-amber font-bold text-sm active:opacity-70">Done</button>
          </div>
          <div data-clip-list className="flex-1 overflow-y-auto px-4 pb-6 flex flex-col gap-1.5">
            {clips.map((clip, i) => {
              const active = clip.id === activeClipId
              const edited = isEdited(clip)
              const isDragging = isActiveDragging && ghostClip?.id === clip.id

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
                    if (!wasReorderDrag.current) setActiveClipId(clip.id)
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
        </>
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
