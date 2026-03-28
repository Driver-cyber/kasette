import { useState, useRef, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Play, Pause, MoreHorizontal, Edit, Download, Share2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { exportScrapbook } from '../lib/export'
import { getBlob, preloadClip } from '../lib/blobCache'
import { getCached, cacheScrapbook } from '../lib/dataCache'

function formatTime(secs) {
  if (!secs || isNaN(secs) || secs < 0) return '0:00'
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export default function PlaybackScreen() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { session } = useAuth()
  const videoRef = useRef(null)
  const nextVideoRef = useRef(null)
  const prevVideoRef = useRef(null)

  const [scrapbook, setScrapbook] = useState(null)
  const [clips, setClips] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [showActionSheet, setShowActionSheet] = useState(false)
  const [progress, setProgress] = useState(0)
  const [loading, setLoading] = useState(true)
  const [videoLoading, setVideoLoading] = useState(true)

  // Export
  const [exportState, setExportState] = useState(null) // null | { phase, current, total } | 'done' | { error: string }
  const [exportBlob, setExportBlob] = useState(null)


  // Scrub bar
  const [isScrubbing, setIsScrubbing] = useState(false)
  const [scrubPercent, setScrubPercent] = useState(0)
  const [scrubTime, setScrubTime] = useState(0)
  const scrubActiveRef = useRef(false)

  // Hold-to-pause
  const holdTimerRef = useRef(null)
  const wasPlayingBeforeHold = useRef(false)
  const holdOccurredRef = useRef(false)

  // Horizontal swipe state
  const [dragOffset, setDragOffset] = useState(0)
  const [dragTransitioning, setDragTransitioning] = useState(false)
  const dragOffsetRef = useRef(0)
  const dragActiveRef = useRef(false)
  const dragStartY = useRef(0)
  const dragStartX = useRef(0)

  // Fetch scrapbook + clips — use cache first for instant render
  useEffect(() => {
    const cached = getCached(id)
    if (cached?.scrapbook) {
      setScrapbook(cached.scrapbook)
      setClips(cached.clips)
      setLoading(false)
    }

    Promise.all([
      supabase.from('scrapbooks').select('id, name, user_id').eq('id', id).single(),
      supabase.from('clips').select('id, video_url, thumbnail_url, duration, trim_in, trim_out, cut_in, cut_out, caption_text, caption_x, caption_y, caption_size, order').eq('scrapbook_id', id).order('order', { ascending: true }),
    ]).then(([{ data: sb }, { data: cl }]) => {
      if (sb) { setScrapbook(sb); cacheScrapbook(id, sb, cl || []) }
      if (cl) setClips(cl)
      if (!cached) setLoading(false)
    })
  }, [id])

  const currentClip = clips[currentIndex]
  const nextClip = currentIndex < clips.length - 1 ? clips[currentIndex + 1] : null
  const prevClip = currentIndex > 0 ? clips[currentIndex - 1] : null
  const isOwner = session?.user?.id === scrapbook?.user_id

  // Preload next video — use blob if cached, otherwise URL hint
  useEffect(() => {
    const nextVideo = nextVideoRef.current
    if (nextVideo && nextClip) {
      nextVideo.src = getBlob(nextClip.video_url)
      nextVideo.currentTime = nextClip.trim_in || 0
      nextVideo.load()
      // Also kick off blob fetch in background so it's ready when needed
      preloadClip(nextClip.video_url)
    }
  }, [nextClip])

  // Preload previous video
  useEffect(() => {
    const prevVideo = prevVideoRef.current
    if (prevVideo && prevClip) {
      prevVideo.src = getBlob(prevClip.video_url)
      prevVideo.currentTime = prevClip.trim_in || 0
      prevVideo.load()
      preloadClip(prevClip.video_url)
    }
  }, [prevClip])

  // Load + play when clip changes — use blob URL if available for instant start
  useEffect(() => {
    const video = videoRef.current
    if (!video || !currentClip) return
    setProgress(0)
    setVideoLoading(true)
    setDragOffset(0)
    dragOffsetRef.current = 0
    setDragTransitioning(false)
    video.src = getBlob(currentClip.video_url)
    video.currentTime = currentClip.trim_in || 0
    video.load()
    video.play().catch(() => {})
  }, [currentClip])

  function goToClip(index) {
    if (index < 0 || index >= clips.length) return
    setCurrentIndex(index)
  }

  function handleTimeUpdate() {
    const video = videoRef.current
    if (!video || !currentClip || scrubActiveRef.current) return
    const trimIn = currentClip.trim_in || 0
    const trimOut = currentClip.trim_out ?? video.duration
    // Skip over cut region
    if (currentClip.cut_in != null && currentClip.cut_out != null &&
        video.currentTime >= currentClip.cut_in && video.currentTime < currentClip.cut_out) {
      video.currentTime = currentClip.cut_out
    }
    const elapsed = video.currentTime - trimIn
    const total = (trimOut - trimIn) || 1
    const pct = Math.min(elapsed / total, 1)
    setProgress(pct)
    if (trimOut && video.currentTime >= trimOut) {
      goToClip(currentIndex + 1)
    }
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

  function handleTap(e) {
    if (e.target.closest('button')) return
    if (showActionSheet) { setShowActionSheet(false); return }
    if (Math.abs(dragOffsetRef.current) > 8) return
    if (holdOccurredRef.current) { holdOccurredRef.current = false; return }

    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const screenWidth = rect.width

    if (x < screenWidth * 0.25 && currentIndex > 0) {
      goToClip(currentIndex - 1)
      return
    }
    if (x > screenWidth * 0.75 && currentIndex < clips.length - 1) {
      goToClip(currentIndex + 1)
      return
    }
  }

  function togglePlayPause(e) {
    e.stopPropagation()
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      video.play().catch(() => {})
    } else {
      video.pause()
    }
  }

  async function handleExport() {
    setShowActionSheet(false)
    setExportState({ phase: 'fetching', current: 1, total: clips.length })
    videoRef.current?.pause()
    try {
      const blob = await exportScrapbook(clips, (progress) => setExportState(progress))
      setExportBlob(blob)
      setExportState('done')
    } catch (e) {
      console.error('[export]', e)
      setExportState({ error: e?.message || String(e) })
    }
  }

  async function handleShare() {
    if (!exportBlob) return
    const filename = `${scrapbook?.name || 'cassette'}.mp4`
    const file = new File([exportBlob], filename, { type: 'video/mp4' })
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: scrapbook?.name })
        return
      }
    } catch {
      // share dismissed or unsupported — fall through to download
    }
    const url = URL.createObjectURL(exportBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function exportPhaseLabel(state) {
    if (!state || state === 'done' || state?.error) return ''
    if (state.phase === 'fetching') return `Fetching clip ${state.current} of ${state.total}…`
    if (state.phase === 'trimming') return `Trimming clip ${state.current} of ${state.total}…`
    if (state.phase === 'stitching') return 'Stitching your scrapbook…'
    return 'Working…'
  }

  // ── Touch handlers ────────────────────────────────────────────────────────
  function handleTouchStart(e) {
    if (showActionSheet) return

    const touch = e.touches[0]

    // Bottom 25% of screen → scrub mode
    if (touch.clientY > window.innerHeight * 0.75 && !e.target.closest('button')) {
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

    // Hold-to-pause (200ms — pauses quickly, but release after hold won't trigger navigation)
    holdTimerRef.current = setTimeout(() => {
      if (video && !video.paused) {
        wasPlayingBeforeHold.current = true
        holdOccurredRef.current = true
        video.pause()
      }
    }, 200)

    dragActiveRef.current = true
    dragStartY.current = touch.clientY
    dragStartX.current = touch.clientX
    setDragTransitioning(false)
  }

  function handleTouchMove(e) {
    // Scrub mode
    if (scrubActiveRef.current) {
      updateScrubFromTouch(e.touches[0].clientX)
      return
    }

    if (!dragActiveRef.current) return
    const dx = dragStartX.current - e.touches[0].clientX
    const dy = Math.abs(dragStartY.current - e.touches[0].clientY)

    if (Math.abs(dx) > 5 || dy > 5) {
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current)
        holdTimerRef.current = null
      }
    }

    if (dy > Math.abs(dx) * 0.8 && Math.abs(dx) < 24) return

    if (dx < 0 && currentIndex > 0) {
      e.preventDefault()
    }

    if (dx < 0 && currentIndex === 0) {
      dragActiveRef.current = false
      return
    }

    const atBoundary =
      (dx > 0 && currentIndex >= clips.length - 1) ||
      (dx < 0 && currentIndex <= 0)

    const offset = atBoundary
      ? Math.sign(dx) * Math.min(Math.abs(dx) * 0.15, 50)
      : dx

    dragOffsetRef.current = offset
    setDragOffset(offset)
  }

  function handleTouchEnd() {
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
    if (wasPlayingBeforeHold.current && video && video.paused) {
      video.play().catch(() => {})
      wasPlayingBeforeHold.current = false
      dragActiveRef.current = false
      return
    }
    wasPlayingBeforeHold.current = false

    if (!dragActiveRef.current) return
    dragActiveRef.current = false

    const THRESHOLD = window.innerWidth * 0.3
    const offset = dragOffsetRef.current

    if (offset > THRESHOLD && currentIndex < clips.length - 1) {
      setDragTransitioning(true)
      setDragOffset(window.innerWidth)
      setTimeout(() => {
        goToClip(currentIndex + 1)
        setDragOffset(0)
        dragOffsetRef.current = 0
        setDragTransitioning(false)
      }, 300)
    } else if (offset < -THRESHOLD && currentIndex > 0) {
      setDragTransitioning(true)
      setDragOffset(-window.innerWidth)
      setTimeout(() => {
        goToClip(currentIndex - 1)
        setDragOffset(0)
        dragOffsetRef.current = 0
        setDragTransitioning(false)
      }, 300)
    } else {
      setDragTransitioning(true)
      dragOffsetRef.current = 0
      setDragOffset(0)
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-deep">
        <div className="w-8 h-8 rounded-full border-2 border-amber border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!clips.length) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-deep gap-4 text-center px-8">
        <p className="font-display text-xl text-wheat/60">No clips in this scrapbook</p>
        <button onClick={() => navigate('/')} className="text-amber font-sans text-sm">
          ← Back to Library
        </button>
      </div>
    )
  }

  const trimIn = currentClip?.trim_in || 0
  const trimDuration = currentClip
    ? ((currentClip.trim_out || 0) - trimIn) || 0
    : 0

  // ── Playback view ────────────────────────────────────────────────────────
  return (
    <div
      className="relative h-screen bg-deep overflow-hidden select-none"
      onClick={handleTap}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* ── Sliding container: prev | current | next ── */}
      <div
        className="absolute inset-0 flex"
        style={{
          transform: `translateX(calc(-100vw + ${-dragOffset}px))`,
          transition: dragTransitioning
            ? 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
            : 'none',
          willChange: 'transform',
          width: prevClip || nextClip ? '300vw' : '100vw',
        }}
        onTransitionEnd={() => setDragTransitioning(false)}
      >
        {/* Previous video */}
        {prevClip ? (
          <div className="relative w-screen h-screen flex-shrink-0">
            <video
              ref={prevVideoRef}
              className="absolute inset-0 w-full h-full object-cover"
              playsInline
              preload="auto"
              muted
              poster={prevClip?.thumbnail_url || undefined}
            />
            <div className="absolute inset-x-0 top-0 h-44 pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, transparent 100%)' }} />
            <div className="absolute inset-x-0 bottom-0 h-56 pointer-events-none" style={{ background: 'linear-gradient(0deg, rgba(0,0,0,0.7) 0%, transparent 100%)' }} />
            {prevClip?.caption_text && (
              <div className="absolute pointer-events-none" style={{ left: `${prevClip.caption_x ?? 50}%`, top: `${prevClip.caption_y ?? 85}%`, transform: 'translate(-50%, -50%)', maxWidth: '80vw' }}>
                <p className="font-display italic text-wheat text-center leading-snug" style={{ fontSize: `${prevClip.caption_size || 24}px`, textShadow: '0 2px 12px rgba(0,0,0,0.6), 0 0 40px rgba(0,0,0,0.4)' }}>{prevClip.caption_text}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="relative w-screen h-screen flex-shrink-0 bg-deep" />
        )}

        {/* Current video */}
        <div className="relative w-screen h-screen flex-shrink-0">
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            onTimeUpdate={handleTimeUpdate}
            onEnded={() => goToClip(currentIndex + 1)}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onLoadStart={() => setVideoLoading(true)}
            onCanPlay={() => setVideoLoading(false)}
            onWaiting={() => setVideoLoading(true)}
            playsInline
            preload="auto"
            poster={currentClip?.thumbnail_url || undefined}
          />
          {videoLoading && (
            <div className="absolute inset-0 pointer-events-none">
              {currentClip?.thumbnail_url
                ? <img src={currentClip.thumbnail_url} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center">
                    <div className="w-9 h-9 rounded-full border-2 border-amber border-t-transparent animate-spin" />
                  </div>
              }
            </div>
          )}
          <div className="absolute inset-x-0 top-0 h-44 pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, transparent 100%)' }} />
          <div className="absolute inset-x-0 bottom-0 h-56 pointer-events-none" style={{ background: 'linear-gradient(0deg, rgba(0,0,0,0.7) 0%, transparent 100%)' }} />
          {currentClip?.caption_text && (
            <div className="absolute pointer-events-none" style={{ left: `${currentClip.caption_x ?? 50}%`, top: `${currentClip.caption_y ?? 85}%`, transform: 'translate(-50%, -50%)', maxWidth: '80vw' }}>
              <p className="font-display italic text-wheat text-center leading-snug" style={{ fontSize: `${currentClip.caption_size || 24}px`, textShadow: '0 2px 12px rgba(0,0,0,0.6), 0 0 40px rgba(0,0,0,0.4)' }}>{currentClip.caption_text}</p>
            </div>
          )}
          {dragOffset > 12 && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" style={{ opacity: Math.min(dragOffset / 80, 0.6) }}>
              <div className="text-wheat/60 text-xs font-semibold tracking-widest uppercase">→ Next</div>
            </div>
          )}
          {dragOffset < -12 && currentIndex > 0 && (
            <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" style={{ opacity: Math.min(Math.abs(dragOffset) / 80, 0.6) }}>
              <div className="text-wheat/60 text-xs font-semibold tracking-widest uppercase">← Previous</div>
            </div>
          )}
        </div>

        {/* Next video */}
        {nextClip ? (
          <div className="relative w-screen h-screen flex-shrink-0">
            <video
              ref={nextVideoRef}
              className="absolute inset-0 w-full h-full object-cover"
              playsInline
              preload="auto"
              muted
              poster={nextClip?.thumbnail_url || undefined}
            />
            <div className="absolute inset-x-0 top-0 h-44 pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, transparent 100%)' }} />
            <div className="absolute inset-x-0 bottom-0 h-56 pointer-events-none" style={{ background: 'linear-gradient(0deg, rgba(0,0,0,0.7) 0%, transparent 100%)' }} />
            {nextClip?.caption_text && (
              <div className="absolute pointer-events-none" style={{ left: `${nextClip.caption_x ?? 50}%`, top: `${nextClip.caption_y ?? 85}%`, transform: 'translate(-50%, -50%)', maxWidth: '80vw' }}>
                <p className="font-display italic text-wheat text-center leading-snug" style={{ fontSize: `${nextClip.caption_size || 24}px`, textShadow: '0 2px 12px rgba(0,0,0,0.6), 0 0 40px rgba(0,0,0,0.4)' }}>{nextClip.caption_text}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="relative w-screen h-screen flex-shrink-0 bg-deep" />
        )}
      </div>

      {/* ── Static chrome ── */}

      {/* Top controls */}
      <div className="absolute top-10 left-0 right-0 flex items-center justify-between px-5 z-20">
        <button
          onClick={(e) => { e.stopPropagation(); navigate('/') }}
          className="w-10 h-10 rounded-full flex items-center justify-center border border-white/10 active:opacity-70"
          style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(8px)' }}
        >
          <ArrowLeft size={18} strokeWidth={2} className="text-wheat/80" />
        </button>
        <span className="font-display font-semibold text-[15px] text-wheat/70 truncate mx-4 max-w-[200px]">
          {scrapbook?.name}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); setShowActionSheet(true) }}
          className="w-10 h-10 rounded-full flex items-center justify-center border border-white/10 active:opacity-70"
          style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(8px)' }}
        >
          <MoreHorizontal size={18} strokeWidth={2} className="text-wheat/80" />
        </button>
      </div>

      {/* Segmented progress bar */}
      <div className="absolute top-[92px] left-5 right-5 flex gap-1 z-20">
        {clips.map((clip, i) => (
          <div key={clip.id} className="flex-1 h-[2.5px] rounded-full overflow-hidden" style={{ background: 'rgba(245,222,179,0.2)' }}>
            {i < currentIndex && <div className="h-full w-full" style={{ background: 'rgba(245,222,179,0.7)' }} />}
            {i === currentIndex && <div className="h-full" style={{ width: `${progress * 100}%`, background: '#F5DEB3' }} />}
          </div>
        ))}
      </div>

      {/* Bottom info + play button — hidden while scrubbing */}
      {!isScrubbing && (
        <div className="absolute bottom-10 left-0 right-0 px-6 flex items-end justify-between z-20">
          <div>
            <p className="text-amber/50 text-[10px] font-semibold tracking-[0.15em] uppercase mb-1">{scrapbook?.name}</p>
            <p className="font-display font-semibold text-[13px] tracking-wide" style={{ color: 'rgba(245,222,179,0.5)' }}>
              {currentIndex + 1} / {clips.length}
            </p>
          </div>
          <button
            onClick={togglePlayPause}
            className="w-11 h-11 rounded-full flex items-center justify-center border border-white/15 active:opacity-70"
            style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(8px)' }}
          >
            {isPlaying
              ? <Pause size={14} fill="rgba(245,222,179,0.7)" strokeWidth={0} />
              : <Play size={14} fill="rgba(245,222,179,0.7)" strokeWidth={0} className="ml-0.5" />
            }
          </button>
        </div>
      )}

      {/* Scrub bar */}
      {isScrubbing && (
        <div
          className="absolute bottom-0 left-0 right-0 z-20 px-5"
          style={{ paddingBottom: 'max(3rem, env(safe-area-inset-bottom))' }}
        >
          {/* Time labels */}
          <div className="flex justify-between mb-2.5">
            <span className="text-amber text-[12px] font-sans font-semibold tabular-nums">
              {formatTime(scrubTime - trimIn)}
            </span>
            <span className="text-wheat/40 text-[12px] font-sans tabular-nums">
              {formatTime(trimDuration)}
            </span>
          </div>
          {/* Track */}
          <div className="relative h-[3px] rounded-full" style={{ background: 'rgba(245,222,179,0.2)' }}>
            <div
              className="absolute inset-y-0 left-0 bg-amber rounded-full"
              style={{ width: `${scrubPercent * 100}%` }}
            />
            <div
              className="absolute w-[18px] h-[18px] bg-amber rounded-full"
              style={{
                left: `${scrubPercent * 100}%`,
                top: '50%',
                transform: 'translateX(-50%) translateY(-50%)',
                boxShadow: '0 0 8px rgba(242,162,74,0.5)',
              }}
            />
          </div>
        </div>
      )}

      {/* Export overlay */}
      {exportState && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center px-8 text-center" style={{ background: '#1A0F08' }}>
          {exportState === 'done' ? (
            <>
              <p className="font-display italic text-amber text-4xl mb-2">Done!</p>
              <p className="text-wheat/60 text-sm mb-10">{scrapbook?.name}</p>
              <button
                onClick={handleShare}
                className="w-full max-w-xs bg-amber text-walnut font-sans font-bold text-[15px] rounded-2xl py-4 mb-4 active:opacity-80"
              >
                Save / Share
              </button>
              <button
                onClick={() => { setExportState(null); setExportBlob(null); videoRef.current?.play().catch(() => {}) }}
                className="text-rust font-sans text-sm active:opacity-70"
              >
                Done
              </button>
            </>
          ) : exportState?.error ? (
            <>
              <p className="text-sienna font-display font-semibold text-xl mb-2">Export failed</p>
              <p className="text-rust text-sm mb-3">Something went wrong. Check your connection and try again.</p>
              <p className="text-wheat/30 text-[11px] font-mono mb-8 px-2 text-center break-all">{exportState.error}</p>
              <button
                onClick={() => { setExportState(null); videoRef.current?.play().catch(() => {}) }}
                className="text-amber font-sans text-sm active:opacity-70"
              >
                Dismiss
              </button>
            </>
          ) : (
            <>
              <p className="font-display italic text-amber text-3xl mb-1">Exporting…</p>
              <p className="text-wheat/50 text-sm mb-10">{scrapbook?.name}</p>
              {/* Progress bar */}
              <div className="w-full max-w-xs h-[3px] rounded-full mb-4" style={{ background: 'rgba(245,222,179,0.15)' }}>
                <div
                  className="h-full bg-amber rounded-full transition-all duration-500"
                  style={{
                    width: exportState.phase === 'stitching'
                      ? '95%'
                      : `${((exportState.current - 1) / exportState.total) * 90}%`
                  }}
                />
              </div>
              <p className="text-rust text-sm">{exportPhaseLabel(exportState)}</p>
              <p className="text-wheat/25 text-xs mt-4">Keep this screen open</p>
            </>
          )}
        </div>
      )}

      {/* Action sheet */}
      {showActionSheet && (
        <>
          <div
            className="absolute inset-0 z-30"
            style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
            onClick={(e) => { e.stopPropagation(); setShowActionSheet(false) }}
          />
          <div
            className="absolute bottom-0 left-0 right-0 z-40 rounded-t-[20px] border-t border-walnut-light px-4 pb-10"
            style={{ background: '#3D2410' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-walnut-light mx-auto mt-3.5 mb-5" />
            {isOwner && (
              <button
                onClick={() => navigate(`/scrapbook/${id}/edit`)}
                className="w-full flex items-center gap-3.5 px-2 py-4 border-b border-walnut-light active:opacity-70 text-left"
              >
                <Edit size={20} strokeWidth={1.75} className="text-amber flex-shrink-0" />
                <div>
                  <p className="text-wheat font-semibold text-[15px]">Edit Scrapbook</p>
                  <p className="text-rust text-[11px] mt-0.5">Trim clips, add captions, reorder</p>
                </div>
              </button>
            )}
            {isOwner && (
              <button
                onClick={() => navigate(`/scrapbook/${id}/share`)}
                className="w-full flex items-center gap-3.5 px-2 py-4 border-b border-walnut-light active:opacity-70 text-left"
              >
                <Share2 size={20} strokeWidth={1.75} className="text-amber flex-shrink-0" />
                <div>
                  <p className="text-wheat font-semibold text-[15px]">Share Scrapbook</p>
                  <p className="text-rust text-[11px] mt-0.5">Manage who can view this</p>
                </div>
              </button>
            )}
            <button
              onClick={handleExport}
              className="w-full flex items-center gap-3.5 px-2 py-4 border-b border-walnut-light active:opacity-70 text-left"
            >
              <Download size={20} strokeWidth={1.75} className="text-amber flex-shrink-0" />
              <div>
                <p className="text-wheat font-semibold text-[15px]">Export as Video</p>
                <p className="text-rust text-[11px] mt-0.5">Saves as MP4 · captions not included</p>
              </div>
            </button>
            <button
              onClick={() => setShowActionSheet(false)}
              className="w-full py-4 text-center text-rust font-semibold text-[15px] active:opacity-70 mt-2"
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  )
}
