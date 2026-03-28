import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft, Shuffle, Disc3 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

function shuffleArray(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function DiscoveryScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const { session } = useAuth()
  const isRemix = !!location.state?.isRemix
  const videoRef = useRef(null)
  const prevVideoRef = useRef(null)
  const nextVideoRef = useRef(null)
  const next2VideoRef = useRef(null)

  const [clips, setClips] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  // Drag/swipe state
  const [dragOffset, setDragOffset] = useState(0)
  const [dragTransitioning, setDragTransitioning] = useState(false)
  const dragOffsetRef = useRef(0)
  const dragActiveRef = useRef(false)
  const dragStartX = useRef(0)
  const dragStartY = useRef(0)

  // Hold-to-pause + scrub
  const holdTimerRef = useRef(null)
  const holdActiveRef = useRef(false)
  const wasPlayingBeforeHold = useRef(false)
  const scrubActiveRef = useRef(false)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const [scrubPercent, setScrubPercent] = useState(0)
  const [scrubTime, setScrubTime] = useState(0)

  const loadClips = useCallback(async () => {
    // Remix mode: clips were pre-selected and passed via route state
    if (isRemix && location.state?.clips?.length) {
      setClips(location.state.clips)
      setCurrentIndex(0)
      setLoading(false)
      return
    }

    setLoading(true)
    const { data } = await supabase
      .from('scrapbooks')
      .select('id, name, year, created_at, clips(id, video_url, thumbnail_url, duration, trim_in, trim_out, caption_text, caption_x, caption_y, caption_size)')
      .eq('user_id', session.user.id)

    if (data) {
      const all = data.flatMap(sb =>
        (sb.clips || []).map(clip => ({
          ...clip,
          scrapbook: {
            id: sb.id,
            name: sb.name,
            year: sb.year ?? new Date(sb.created_at).getFullYear(),
          },
        }))
      )
      setClips(shuffleArray(all))
      setCurrentIndex(0)
    }
    setLoading(false)
  }, [session, isRemix])

  const currentClip = clips[currentIndex]
  const prevClip = clips[currentIndex - 1] ?? null
  const nextClip = clips[currentIndex + 1] ?? null
  const next2Clip = clips[currentIndex + 2] ?? null

  // Preload prev + next 2 clips
  useEffect(() => {
    const prev = prevVideoRef.current
    if (!prev || !prevClip) return
    prev.src = prevClip.video_url
    prev.load()
  }, [prevClip])

  useEffect(() => {
    const next = nextVideoRef.current
    if (!next || !nextClip) return
    next.src = nextClip.video_url
    next.load()
  }, [nextClip])

  useEffect(() => {
    const next2 = next2VideoRef.current
    if (!next2 || !next2Clip) return
    next2.src = next2Clip.video_url
    next2.load()
  }, [next2Clip])

  // Load + autoplay when clip changes
  useEffect(() => {
    const video = videoRef.current
    if (!video || !currentClip) return
    setDragOffset(0)
    dragOffsetRef.current = 0
    setDragTransitioning(false)
    video.src = currentClip.video_url
    video.currentTime = currentClip.trim_in || 0
    video.load()
    video.play().catch(() => {})
  }, [currentIndex, currentClip?.id])

  function handleTimeUpdate() {
    const video = videoRef.current
    if (!video || !currentClip) return
    const trimOut = currentClip.trim_out ?? currentClip.duration
    if (trimOut && video.currentTime >= trimOut) {
      video.currentTime = currentClip.trim_in || 0
      video.play().catch(() => {})
    }
  }

  function goNext() {
    if (currentIndex < clips.length - 1) setCurrentIndex(i => i + 1)
  }

  function goPrev() {
    if (currentIndex > 0) setCurrentIndex(i => i - 1)
  }

  function reshuffle() {
    setClips(prev => shuffleArray(prev))
    setCurrentIndex(0)
  }

  function formatTime(secs) {
    if (!secs || isNaN(secs) || secs < 0) return '0:00'
    const m = Math.floor(secs / 60)
    const s = Math.floor(secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  function updateScrubFromTouch(clientX) {
    const video = videoRef.current
    if (!video || !currentClip) return
    const pct = Math.max(0, Math.min(1, clientX / window.innerWidth))
    const trimIn = currentClip.trim_in || 0
    const dur = video.duration
    const trimOut = currentClip.trim_out || (isNaN(dur) ? trimIn + 1 : dur)
    const newTime = trimIn + pct * (trimOut - trimIn)
    video.currentTime = newTime
    setScrubPercent(pct)
    setScrubTime(newTime)
  }

  // ── Touch handlers ────────────────────────────────────────────────────────
  function handleTouchStart(e) {
    if (e.target.closest('button')) return

    const touch = e.touches[0]

    // Bottom 25% → scrub mode
    if (touch.clientY > window.innerHeight * 0.75) {
      scrubActiveRef.current = true
      setIsScrubbing(true)
      const video = videoRef.current
      if (video) {
        wasPlayingBeforeHold.current = !video.paused
        video.pause()
      }
      updateScrubFromTouch(touch.clientX)
      return
    }

    const video = videoRef.current
    holdTimerRef.current = setTimeout(() => {
      if (video && !video.paused) {
        wasPlayingBeforeHold.current = true
        video.pause()
        holdActiveRef.current = true
      }
    }, 200)

    dragActiveRef.current = true
    dragStartX.current = e.touches[0].clientX
    dragStartY.current = e.touches[0].clientY
    setDragTransitioning(false)
  }

  function handleTouchMove(e) {
    if (scrubActiveRef.current) {
      updateScrubFromTouch(e.touches[0].clientX)
      return
    }
    if (!dragActiveRef.current) return
    const dx = dragStartX.current - e.touches[0].clientX  // positive = swipe left = next
    const dy = Math.abs(dragStartY.current - e.touches[0].clientY)

    // Cancel hold if finger moves
    if (Math.abs(dx) > 5 || dy > 5) {
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current)
        holdTimerRef.current = null
      }
    }

    // Ignore mostly-vertical gestures
    if (dy > Math.abs(dx) * 0.8 && Math.abs(dx) < 24) return

    // Block iOS swipe-back when swiping right on non-first clips
    if (dx < 0 && currentIndex > 0) {
      e.preventDefault()
    }

    // Let iOS handle swipe-back on first clip
    if (dx < 0 && currentIndex === 0) {
      dragActiveRef.current = false
      return
    }

    // Rubber-band at boundaries
    const atBoundary =
      (dx > 0 && currentIndex >= clips.length - 1) ||
      (dx < 0 && currentIndex <= 0)

    const offset = atBoundary
      ? Math.sign(dx) * Math.min(Math.abs(dx) * 0.15, 50)
      : dx

    dragOffsetRef.current = offset
    setDragOffset(offset)
  }

  function handleTouchEnd(e) {
    // End scrub mode
    if (scrubActiveRef.current) {
      scrubActiveRef.current = false
      setIsScrubbing(false)
      if (wasPlayingBeforeHold.current) {
        videoRef.current?.play().catch(() => {})
        wasPlayingBeforeHold.current = false
      }
      return
    }

    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current)
      holdTimerRef.current = null
    }

    // Resume if hold-paused
    const video = videoRef.current
    if (holdActiveRef.current) {
      if (wasPlayingBeforeHold.current && video) {
        video.play().catch(() => {})
        wasPlayingBeforeHold.current = false
      }
      holdActiveRef.current = false
      dragActiveRef.current = false
      return
    }

    if (!dragActiveRef.current) return
    dragActiveRef.current = false

    const THRESHOLD = window.innerWidth * 0.3
    const offset = dragOffsetRef.current

    // Quick tap (barely moved) → side navigation
    if (Math.abs(offset) < 8) {
      const touch = e.changedTouches[0]
      if (touch.clientX < window.innerWidth / 2) goPrev()
      else goNext()
      return
    }

    // Swipe committed
    if (offset > THRESHOLD && currentIndex < clips.length - 1) {
      setDragTransitioning(true)
      setDragOffset(window.innerWidth)
      setTimeout(() => {
        goNext()
        setDragOffset(0)
        dragOffsetRef.current = 0
        setDragTransitioning(false)
      }, 280)
    } else if (offset < -THRESHOLD && currentIndex > 0) {
      setDragTransitioning(true)
      setDragOffset(-window.innerWidth)
      setTimeout(() => {
        goPrev()
        setDragOffset(0)
        dragOffsetRef.current = 0
        setDragTransitioning(false)
      }, 280)
    } else {
      // Spring back
      setDragTransitioning(true)
      dragOffsetRef.current = 0
      setDragOffset(0)
    }
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center bg-deep" style={{ height: '100dvh' }}>
        <div className="w-8 h-8 rounded-full border-2 border-amber border-t-transparent animate-spin" />
      </div>
    )
  }

  // ── Empty ─────────────────────────────────────────────────────────────────
  if (clips.length === 0) {
    return (
      <div className="relative flex flex-col items-center justify-center bg-deep px-8 text-center" style={{ height: '100dvh' }}>
        <button
          onClick={() => navigate('/')}
          className="absolute top-14 left-5 w-9 h-9 flex items-center justify-center rounded-full active:opacity-70"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}
        >
          <ArrowLeft size={16} strokeWidth={1.75} className="text-wheat" />
        </button>
        <p className="font-display font-semibold text-2xl text-wheat mb-2">Nothing here yet</p>
        <p className="text-rust text-sm leading-relaxed">
          Create a scrapbook and upload some clips to start discovering your memories.
        </p>
      </div>
    )
  }

  // ── Main view ─────────────────────────────────────────────────────────────
  return (
    <div
      className="relative bg-deep overflow-hidden select-none"
      style={{ height: '100dvh' }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Sliding video container */}
      <div
        className="absolute inset-0"
        style={{
          transform: `translateX(${-dragOffset}px)`,
          transition: dragTransitioning
            ? 'transform 0.28s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
            : 'none',
          willChange: 'transform',
        }}
        onTransitionEnd={() => setDragTransitioning(false)}
      >
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          onTimeUpdate={handleTimeUpdate}
          playsInline
          preload="auto"
          poster={currentClip?.thumbnail_url || undefined}
        />
      </div>

      {/* Hidden preload elements */}
      <video ref={prevVideoRef} className="hidden" playsInline preload="auto" muted />
      <video ref={nextVideoRef} className="hidden" playsInline preload="auto" muted />
      <video ref={next2VideoRef} className="hidden" playsInline preload="auto" muted />

      {/* Gradient overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(180deg, rgba(0,0,0,0.45) 0%, transparent 25%, transparent 50%, rgba(0,0,0,0.75) 100%)',
        }}
      />

      {/* Caption */}
      {currentClip?.caption_text && (
        <div
          className="absolute pointer-events-none"
          style={{
            left: `${currentClip.caption_x ?? 50}%`,
            top: `${currentClip.caption_y ?? 85}%`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <p
            className="font-display italic text-wheat text-center leading-snug"
            style={{
              fontSize: `${currentClip.caption_size || 24}px`,
              textShadow: '0 2px 12px rgba(0,0,0,0.8)',
            }}
          >
            {currentClip.caption_text}
          </p>
        </div>
      )}

      {/* Swipe hints */}
      {dragOffset > 12 && (
        <div
          className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ opacity: Math.min(dragOffset / 80, 0.6) }}
        >
          <div className="text-wheat/60 text-xs font-semibold tracking-widest uppercase">→ Next</div>
        </div>
      )}
      {dragOffset < -12 && currentIndex > 0 && (
        <div
          className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ opacity: Math.min(Math.abs(dragOffset) / 80, 0.6) }}
        >
          <div className="text-wheat/60 text-xs font-semibold tracking-widest uppercase">← Prev</div>
        </div>
      )}

      {/* ── Top bar ── */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between pt-14 px-5 pb-4 pointer-events-none">
        <button
          onClick={() => navigate(isRemix ? '/remix' : '/')}
          className="w-9 h-9 flex items-center justify-center rounded-full active:opacity-70 pointer-events-auto"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(10px)' }}
        >
          <ArrowLeft size={16} strokeWidth={1.75} className="text-wheat" />
        </button>

        <div
          className="px-3.5 py-1.5 rounded-full"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(10px)' }}
        >
          {isRemix
            ? <span className="font-display italic text-amber text-[12px]">The Remix</span>
            : <span className="text-wheat/80 text-[11px] font-semibold tabular-nums">{currentIndex + 1} / {clips.length}</span>
          }
        </div>

        <button
          onClick={isRemix ? () => navigate('/remix') : reshuffle}
          className="w-9 h-9 flex items-center justify-center rounded-full active:opacity-70 pointer-events-auto"
          style={{ background: isRemix ? 'rgba(242,162,74,0.2)' : 'rgba(0,0,0,0.45)', backdropFilter: 'blur(10px)' }}
        >
          {isRemix
            ? <Disc3 size={15} strokeWidth={1.75} className="text-amber" />
            : <Shuffle size={15} strokeWidth={1.75} className="text-wheat" />
          }
        </button>
      </div>

      {/* Scrub bar */}
      {isScrubbing && (
        <div
          className="absolute bottom-0 left-0 right-0 z-20 px-5"
          style={{ paddingBottom: 'max(3rem, env(safe-area-inset-bottom))' }}
        >
          <div className="flex justify-between mb-2.5">
            <span className="text-amber text-[12px] font-sans font-semibold tabular-nums">
              {formatTime(scrubTime - (currentClip?.trim_in || 0))}
            </span>
            <span className="text-wheat/40 text-[12px] font-sans tabular-nums">
              {formatTime(((currentClip?.trim_out || 0) - (currentClip?.trim_in || 0)) || 0)}
            </span>
          </div>
          <div className="relative h-[3px] rounded-full" style={{ background: 'rgba(245,222,179,0.2)' }}>
            <div className="absolute inset-y-0 left-0 bg-amber rounded-full" style={{ width: `${scrubPercent * 100}%` }} />
            <div
              className="absolute w-[18px] h-[18px] bg-amber rounded-full"
              style={{ left: `${scrubPercent * 100}%`, top: '50%', transform: 'translateX(-50%) translateY(-50%)', boxShadow: '0 0 8px rgba(242,162,74,0.5)' }}
            />
          </div>
        </div>
      )}

      {/* ── Bottom info ── */}
      <div
        className="absolute bottom-0 left-0 right-0 px-6 pt-10 pointer-events-none"
        style={{
          background: 'linear-gradient(0deg, rgba(26,15,8,0.92) 0%, rgba(26,15,8,0.5) 60%, transparent 100%)',
          paddingBottom: 'max(2rem, env(safe-area-inset-bottom))',
        }}
      >
        <p className="text-rust text-[9px] font-bold tracking-[0.2em] uppercase mb-1">
          {isRemix ? `The Remix · ${currentClip.scrapbook.year}` : `From your library · ${currentClip.scrapbook.year}`}
        </p>
        <div className="flex items-end justify-between">
          <p className="font-display font-semibold text-[22px] text-wheat leading-tight">
            {currentClip.scrapbook.name}
          </p>
          <button
            className="pointer-events-auto flex items-center gap-1.5 mb-0.5 ml-4 flex-shrink-0 text-amber/70 font-sans font-semibold text-[12px] active:opacity-60"
            onClick={() => navigate(`/scrapbook/${currentClip.scrapbook.id}`)}
          >
            Watch →
          </button>
        </div>
      </div>
    </div>
  )
}
