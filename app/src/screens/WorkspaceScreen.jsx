import { useState, useRef, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Play, Pause, Type, AlignJustify, Eye, Trash2, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'

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

const ROW_H = 52 // approximate height of each clip row in px

// ── Main component ─────────────────────────────────────────────────────────

export default function WorkspaceScreen() {
  const navigate = useNavigate()
  const { id } = useParams()
  const videoRef = useRef(null)
  const filmstripRef = useRef(null)
  const captionInputRef = useRef(null)

  const [scrapbook, setScrapbook] = useState(null)
  const [clips, setClips] = useState([])
  const [activeClipId, setActiveClipId] = useState(null)
  const [activeTool, setActiveTool] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playheadPct, setPlayheadPct] = useState(0)
  const [captionDraft, setCaptionDraft] = useState('')
  const [captionSizeDraft, setCaptionSizeDraft] = useState(24)
  const [loading, setLoading] = useState(true)
  const [confirmRemoveId, setConfirmRemoveId] = useState(null)

  // Reorder drag state
  const dragState = useRef(null)
  const [dragFromIndex, setDragFromIndex] = useState(null)
  const clipsRef = useRef(clips)
  useEffect(() => { clipsRef.current = clips }, [clips])

  // Ghost drag state — the floating card that follows your finger
  const [ghostClip, setGhostClip] = useState(null)
  const [ghostInitialY, setGhostInitialY] = useState(0) // only used for initial render position
  const ghostRef = useRef(null) // direct DOM updates for smooth tracking
  const ghostOffsetRef = useRef(0) // touch Y offset from item top
  const [isActiveDragging, setIsActiveDragging] = useState(false) // true only while finger is moving

  const isReordering = activeTool === 'reorder'

  // Clear ghost when leaving reorder mode
  useEffect(() => {
    if (!isReordering) {
      setGhostClip(null)
      setDragFromIndex(null)
      setIsActiveDragging(false)
      dragState.current = null
    }
  }, [isReordering])

  // Fetch
  useEffect(() => {
    Promise.all([
      supabase.from('scrapbooks').select('*').eq('id', id).single(),
      supabase.from('clips').select('*').eq('scrapbook_id', id).order('order', { ascending: true }),
    ]).then(([{ data: sb }, { data: cl }]) => {
      if (sb) setScrapbook(sb)
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
    video.load()
    setIsPlaying(false)
    setPlayheadPct((activeClip.trim_in || 0) / (activeClip.duration || 1) * 100)
  }, [activeClip?.id])

  // Caption draft sync
  useEffect(() => {
    if (activeClip) {
      setCaptionDraft(activeClip.caption_text || '')
      setCaptionSizeDraft(activeClip.caption_size || 24)
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
    const rect = strip.getBoundingClientRect()
    const duration = activeClip.duration || 1
    let currentTrimIn = activeClip.trim_in || 0
    let currentTrimOut = activeClip.trim_out ?? duration

    function onMove(ev) {
      const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX
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
      await supabase.from('clips')
        .update({ trim_in: currentTrimIn, trim_out: currentTrimOut })
        .eq('id', activeClip.id)
    }

    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onEnd)
  }

  // ── Caption save ───────────────────────────────────────────────────────
  async function saveCaptionDraft() {
    if (!activeClip) return
    await saveClipChanges(activeClip.id, {
      caption_text: captionDraft.trim() || null,
      caption_size: captionSizeDraft,
    })
    setActiveTool(null)
  }

  // ── Remove clip ────────────────────────────────────────────────────────
  async function removeClip(clipId) {
    setConfirmRemoveId(null)
    const remaining = clips.filter(c => c.id !== clipId)
    setClips(remaining)
    if (activeClipId === clipId) setActiveClipId(remaining[0]?.id ?? null)
    await supabase.from('clips').delete().eq('id', clipId)
    for (let i = 0; i < remaining.length; i++) {
      await supabase.from('clips').update({ order: i }).eq('id', remaining[i].id)
    }
  }

  // ── Reorder drag ──────────────────────────────────────────────────────
  // If a clip was pre-lifted by a tap, any movement starts the drag immediately.
  // If not lifted yet, 8px vertical threshold applies.
  function startReorderDrag(fromIndex, e) {
    const startY = e.touches ? e.touches[0].clientY : e.clientY
    const startX = e.touches ? e.touches[0].clientX : e.clientX

    // Anchor offset: where on the row the finger landed
    const rowEl = e.currentTarget.closest('[data-clip-row]') ?? e.currentTarget
    ghostOffsetRef.current = startY - rowEl.getBoundingClientRect().top

    // Was this clip already lifted by a previous tap?
    const alreadyLifted = ghostClip !== null

    let dragStarted = false

    function onMove(ev) {
      const clientY = ev.touches ? ev.touches[0].clientY : ev.clientY
      const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX
      const dy = clientY - startY
      const dx = clientX - startX

      if (!dragStarted) {
        if (alreadyLifted) {
          // Clip is already in hand — any vertical movement drags it
          if (Math.abs(dy) < 2) return
        } else {
          // Cold drag — require deliberate vertical intent
          if (Math.abs(dy) < 8 || Math.abs(dx) > Math.abs(dy) * 1.2) return
        }

        dragStarted = true
        setIsActiveDragging(true)

        if (alreadyLifted) {
          // Use the clip's actual current position (may have shifted from a previous drag)
          const liftedIdx = clipsRef.current.findIndex(c => c.id === ghostClip.id)
          dragState.current = { fromIndex: liftedIdx, currentIndex: liftedIdx, startY }
          setDragFromIndex(liftedIdx)
          // Ghost is already rendered — just start moving it
        } else {
          dragState.current = { fromIndex, currentIndex: fromIndex, startY }
          setDragFromIndex(fromIndex)
          setGhostInitialY(clientY - ghostOffsetRef.current)
          setGhostClip(clipsRef.current[fromIndex])
        }
      }

      ev.preventDefault()

      if (ghostRef.current) {
        ghostRef.current.style.top = (clientY - ghostOffsetRef.current) + 'px'
      }

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
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onEnd)
      // If no drag happened (just a tap on the already-lifted clip), leave the ghost up
      if (!dragStarted) return
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
    <div className="flex flex-col h-screen bg-walnut overflow-hidden select-none">

      {/* ── Nav ── */}
      <header className="flex items-center justify-between px-5 pt-12 pb-2.5 flex-shrink-0">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 text-wheat/45 font-sans text-[13px] font-medium active:opacity-60"
        >
          <ArrowLeft size={14} strokeWidth={1.75} />
          Library
        </button>
        <h1 className="font-display font-semibold text-base text-wheat truncate mx-3 max-w-[160px]">
          {scrapbook?.name}
        </h1>
        <button
          onClick={() => navigate(`/scrapbook/${id}`)}
          className="flex items-center gap-1.5 bg-amber text-walnut font-sans font-bold text-xs rounded-full px-4 py-1.5 active:opacity-80"
        >
          <Play size={9} fill="#2C1A0E" strokeWidth={0} />
          Watch
        </button>
      </header>

      {/* ── Preview zone ── */}
      <div
        className="mx-4 rounded-2xl overflow-hidden flex-shrink-0 relative bg-deep"
        style={{ height: isReordering ? 0 : 220, transition: 'height 0.3s ease', opacity: isReordering ? 0 : 1 }}
      >
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          onTimeUpdate={handleTimeUpdate}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          playsInline
          preload="auto"
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

        {activeClip?.caption_text && (
          <div
            className="absolute pointer-events-none"
            style={{
              left: `${activeClip.caption_x ?? 50}%`,
              top: `${activeClip.caption_y ?? 85}%`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <p
              className="font-display italic text-wheat text-center leading-snug"
              style={{ fontSize: `${activeClip.caption_size || 24}px`, textShadow: '0 2px 10px rgba(0,0,0,0.6)', maxWidth: '80%' }}
            >
              {activeClip.caption_text}
            </p>
          </div>
        )}
      </div>

      {/* ── Trim zone ── */}
      <div
        className="px-4 pt-3 pb-2.5 border-b border-walnut-light flex-shrink-0 overflow-hidden"
        style={{ maxHeight: isReordering ? 0 : 200, transition: 'max-height 0.3s ease', opacity: isReordering ? 0 : 1 }}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-rust text-[9px] font-bold tracking-[0.18em] uppercase">Trim</span>
          <div className="flex items-center gap-2">
            <span className="text-amber text-[10px] font-bold px-2 py-0.5 rounded-full border"
              style={{ background: 'rgba(242,162,74,0.1)', borderColor: 'rgba(242,162,74,0.2)' }}>
              {fmt(trimIn)}
            </span>
            <span className="text-rust/50 text-[9px]">→</span>
            <span className="text-amber text-[10px] font-bold px-2 py-0.5 rounded-full border"
              style={{ background: 'rgba(242,162,74,0.1)', borderColor: 'rgba(242,162,74,0.2)' }}>
              {fmt(trimOut)}
            </span>
            <span className="text-rust/50 text-[9px]">·</span>
            <span className="text-wheat/40 text-[10px] font-semibold">{fmt(keptDuration)} kept</span>
          </div>
        </div>

        <div ref={filmstripRef} className="relative h-10 rounded-lg overflow-hidden mb-1">
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
          <div className="absolute top-0 bottom-0 w-px bg-white/75 pointer-events-none"
            style={{ left: `${playheadPct}%` }} />

          <div
            className="absolute top-0 bottom-0 w-[3px] bg-amber cursor-ew-resize touch-none"
            style={{ left: `${trimInPct}%` }}
            onTouchStart={(e) => startTrimDrag('in', e)}
            onMouseDown={(e) => startTrimDrag('in', e)}
          >
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-6 bg-amber rounded-sm" />
          </div>
          <div
            className="absolute top-0 bottom-0 w-[3px] bg-amber cursor-ew-resize touch-none"
            style={{ left: `${trimOutPct}%` }}
            onTouchStart={(e) => startTrimDrag('out', e)}
            onMouseDown={(e) => startTrimDrag('out', e)}
          >
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-6 bg-amber rounded-sm" />
          </div>
        </div>

        <div className="flex justify-between text-rust text-[8px] font-semibold tracking-wide">
          <span>0:00</span>
          <span>{fmt(duration * 0.25)}</span>
          <span>{fmt(duration * 0.5)}</span>
          <span>{fmt(duration * 0.75)}</span>
          <span>{fmt(duration)}</span>
        </div>
      </div>

      {/* ── Tool row ── */}
      <div className="flex items-center justify-around px-5 py-2 border-b border-walnut-light flex-shrink-0">
        {[
          { key: 'caption', Icon: Type, label: 'Caption', danger: false },
          { key: 'reorder', Icon: AlignJustify, label: 'Reorder', danger: false },
          { key: 'preview', Icon: Eye, label: 'Preview', danger: false },
          { key: 'remove', Icon: Trash2, label: 'Remove', danger: true },
        ].map(({ key, Icon, label, danger }) => {
          const active = activeTool === key
          return (
            <button
              key={key}
              onClick={() => {
                if (key === 'preview') navigate(`/scrapbook/${id}`)
                else if (key === 'remove') setConfirmRemoveId(activeClipId)
                else toggleTool(key)
              }}
              className="flex flex-col items-center gap-1.5 px-3 py-1.5 rounded-xl active:opacity-70"
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center border"
                style={{
                  background: active ? 'rgba(242,162,74,0.12)' : danger ? 'rgba(232,133,90,0.08)' : '#3D2410',
                  borderColor: active ? 'rgba(242,162,74,0.3)' : danger ? 'rgba(232,133,90,0.2)' : '#4A2E18',
                }}
              >
                <Icon size={17} strokeWidth={1.75}
                  style={{ color: active ? '#F2A24A' : danger ? '#E8855A' : '#7A3B1E' }} />
              </div>
              <span className="text-[9px] font-bold tracking-[0.1em] uppercase"
                style={{ color: active ? '#F2A24A' : danger ? 'rgba(232,133,90,0.7)' : '#7A3B1E' }}>
                {label}
              </span>
            </button>
          )
        })}
      </div>

      {/* ── Reorder banner ── */}
      {isReordering && (
        <div className="flex items-center justify-between px-5 py-2.5 border-b flex-shrink-0"
          style={{ background: 'rgba(242,162,74,0.07)', borderColor: 'rgba(242,162,74,0.18)' }}>
          <div className="flex items-center gap-2 text-amber text-[11px] font-semibold">
            <AlignJustify size={13} strokeWidth={2} className="text-amber" />
            Drag clips to reorder
          </div>
          <button onClick={() => setActiveTool(null)} className="text-amber font-bold text-[13px] active:opacity-70">
            Done
          </button>
        </div>
      )}

      {/* ── Clip list header ── */}
      <div className="flex items-center justify-between px-5 py-2.5 flex-shrink-0">
        <span className="text-rust text-[9px] font-bold tracking-[0.18em] uppercase">
          {isReordering ? 'Reordering' : 'All clips'}
        </span>
        <span className="text-wheat/30 text-[10px] font-medium">
          {isReordering ? `${clips.length} clips` : `${editedCount} of ${clips.length} edited`}
        </span>
      </div>

      {/* ── Clip list ── */}
      <div className="flex-1 overflow-y-auto px-4 pb-6 flex flex-col gap-1.5">
        {clips.map((clip, i) => {
          const active = clip.id === activeClipId
          const edited = isEdited(clip)
          const isDragging = isActiveDragging && ghostClip !== null && ghostClip.id === clip.id

          // While dragging this item, render a dashed placeholder
          if (isReordering && isDragging) {
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
              onClick={(e) => {
                setActiveClipId(clip.id)
                if (isReordering) {
                  // Lift the clip immediately so the next drag starts without a threshold
                  const rowRect = e.currentTarget.getBoundingClientRect()
                  ghostOffsetRef.current = ROW_H / 2
                  setGhostInitialY(rowRect.top)
                  setGhostClip(clip)
                }
              }}
              onTouchStart={isReordering ? (e) => startReorderDrag(i, e) : undefined}
              onMouseDown={isReordering ? (e) => startReorderDrag(i, e) : undefined}
              className="w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 border text-left active:opacity-75 flex-shrink-0"
              style={{
                background: '#3D2410',
                borderColor: active ? '#F2A24A' : '#4A2E18',
                minHeight: ROW_H,
              }}
            >
              {/* Drag handle — visual affordance only, whole row is the drag target */}
              {isReordering && (
                <div className="flex flex-col gap-[4px] px-3 py-3 opacity-50 flex-shrink-0 cursor-grab">
                  {[0,1,2].map(n => (
                    <span key={n} className="block w-4 h-0.5 bg-wheat rounded" />
                  ))}
                </div>
              )}

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

      {/* ── Ghost drag card — floats with finger ── */}
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
          <div className="flex flex-col gap-[4px] px-3 py-3 opacity-50 flex-shrink-0">
            {[0,1,2].map(n => (
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

      {/* ── Caption sheet ── */}
      {activeTool === 'caption' && (
        <>
          <div className="absolute inset-0 bg-black/40 z-10" onClick={saveCaptionDraft} />
          <div
            className="absolute bottom-0 left-0 right-0 z-20 rounded-t-3xl border-t border-walnut-light px-5 pb-10 pt-1"
            style={{ background: '#3D2410' }}
          >
            <div className="w-10 h-1 rounded-full bg-walnut-light mx-auto mt-3 mb-5" />
            <div className="flex items-center justify-between mb-4">
              <p className="text-rust text-[9px] font-bold tracking-[0.18em] uppercase">Caption</p>
              <button onClick={saveCaptionDraft} className="text-amber font-bold text-sm active:opacity-70">Done</button>
            </div>
            <input
              ref={captionInputRef}
              type="text"
              value={captionDraft}
              onChange={e => setCaptionDraft(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveCaptionDraft()}
              placeholder="Type your caption…"
              className="w-full bg-walnut border border-walnut-light rounded-xl px-4 py-3 font-display italic text-[16px] text-wheat placeholder:text-rust/50 outline-none focus:border-amber caret-amber mb-4"
            />
            <div className="flex items-center gap-3">
              <span className="text-wheat/40 text-[11px] font-semibold tracking-wide uppercase">Size</span>
              <input
                type="range" min={14} max={42} value={captionSizeDraft}
                onChange={e => setCaptionSizeDraft(Number(e.target.value))}
                className="flex-1 accent-amber"
              />
              <span className="text-wheat/40 text-sm font-semibold">Aa</span>
            </div>
            {captionDraft && (
              <button onClick={() => setCaptionDraft('')}
                className="mt-4 w-full py-2 text-center text-rust/60 text-sm active:opacity-70">
                Remove caption
              </button>
            )}
          </div>
        </>
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
