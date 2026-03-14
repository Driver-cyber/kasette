import { useState, useRef, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Play, Pause, MoreHorizontal, Edit, Share2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function PlaybackScreen() {
  const navigate = useNavigate()
  const { id } = useParams()
  const videoRef = useRef(null)
  const nextVideoRef = useRef(null) // For forward transitions
  const prevVideoRef = useRef(null) // For backward transitions

  const [scrapbook, setScrapbook] = useState(null)
  const [clips, setClips] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [showPauseOverlay, setShowPauseOverlay] = useState(false)
  const [showActionSheet, setShowActionSheet] = useState(false)
  const [progress, setProgress] = useState(0)
  const [loading, setLoading] = useState(true)

  // Hold-to-pause state
  const [isHolding, setIsHolding] = useState(false)
  const holdTimerRef = useRef(null)
  const wasPlayingBeforeHold = useRef(false)

  // Horizontal swipe state (left/right navigation)
  const [dragOffset, setDragOffset] = useState(0)
  const [dragTransitioning, setDragTransitioning] = useState(false)
  const dragOffsetRef = useRef(0)
  const dragActiveRef = useRef(false)
  const dragStartY = useRef(0)
  const dragStartX = useRef(0)

  // Fetch scrapbook + clips
  useEffect(() => {
    Promise.all([
      supabase.from('scrapbooks').select('id, name').eq('id', id).single(),
      supabase.from('clips').select('id, video_url, duration, trim_in, trim_out, caption_text, caption_x, caption_y, caption_size, order').eq('scrapbook_id', id).order('order', { ascending: true }),
    ]).then(([{ data: sb }, { data: cl }]) => {
      if (sb) setScrapbook(sb)
      if (cl) setClips(cl)
      setLoading(false)
    })
  }, [id])

  const currentClip = clips[currentIndex]
  const nextClip = currentIndex < clips.length - 1 ? clips[currentIndex + 1] : null
  const prevClip = currentIndex > 0 ? clips[currentIndex - 1] : null

  // Preload next video for smooth transitions
  useEffect(() => {
    const nextVideo = nextVideoRef.current
    if (nextVideo && nextClip) {
      nextVideo.src = nextClip.video_url
      nextVideo.currentTime = nextClip.trim_in || 0
      nextVideo.load()
    }
  }, [nextClip])

  // Preload previous video for smooth transitions
  useEffect(() => {
    const prevVideo = prevVideoRef.current
    if (prevVideo && prevClip) {
      prevVideo.src = prevClip.video_url
      prevVideo.currentTime = prevClip.trim_in || 0
      prevVideo.load()
    }
  }, [prevClip])

  // Load + play when clip changes
  useEffect(() => {
    const video = videoRef.current
    if (!video || !currentClip) return
    setProgress(0)
    setShowPauseOverlay(false)
    // Reset drag state on clip change
    setDragOffset(0)
    dragOffsetRef.current = 0
    setDragTransitioning(false)
    video.src = currentClip.video_url
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
    if (!video || !currentClip) return
    const trimIn = currentClip.trim_in || 0
    const trimOut = currentClip.trim_out ?? video.duration
    const elapsed = video.currentTime - trimIn
    const total = (trimOut - trimIn) || 1
    const pct = Math.min(elapsed / total, 1)
    setProgress(pct)
    if (trimOut && video.currentTime >= trimOut) {
      goToClip(currentIndex + 1)
    }
  }

  function handleTap(e) {
    if (e.target.closest('button')) return
    if (showActionSheet) { setShowActionSheet(false); return }
    // Ignore taps that were actually swipes
    if (Math.abs(dragOffsetRef.current) > 8) return
    // Ignore if this was a hold (not a quick tap)
    if (isHolding) return
    
    const video = videoRef.current
    if (!video) return
    
    // Get tap position
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const screenWidth = rect.width
    
    // Left 25% = previous clip
    if (x < screenWidth * 0.25 && currentIndex > 0) {
      goToClip(currentIndex - 1)
      return
    }
    
    // Right 25% = next clip
    if (x > screenWidth * 0.75 && currentIndex < clips.length - 1) {
      goToClip(currentIndex + 1)
      return
    }
    
    // Center 50% taps are handled by hold-to-pause now
    // (quick tap does nothing, only hold pauses)
  }

  function togglePlayPause(e) {
    e.stopPropagation()
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      video.play().catch(() => {})
      setShowPauseOverlay(false)
    } else {
      video.pause()
      setShowPauseOverlay(true)
    }
  }

  // ── Swipe drag handlers (horizontal - left=next, right=prev) ──────────
  function handleTouchStart(e) {
    if (showActionSheet) return
    
    const video = videoRef.current
    
    // Start hold-to-pause timer (150ms threshold)
    holdTimerRef.current = setTimeout(() => {
      if (video && !video.paused) {
        wasPlayingBeforeHold.current = true
        video.pause()
        setIsHolding(true)
        setShowPauseOverlay(true)
      }
    }, 150)
    
    dragActiveRef.current = true
    dragStartY.current = e.touches[0].clientY
    dragStartX.current = e.touches[0].clientX
    setDragTransitioning(false)
  }

  function handleTouchMove(e) {
    if (!dragActiveRef.current) return
    const dx = dragStartX.current - e.touches[0].clientX  // positive = swipe left, negative = swipe right
    const dy = Math.abs(dragStartY.current - e.touches[0].clientY)

    // If user moves, cancel the hold-to-pause
    if (Math.abs(dx) > 5 || dy > 5) {
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current)
        holdTimerRef.current = null
      }
    }

    // Ignore mostly-vertical gestures
    if (dy > Math.abs(dx) * 0.8 && Math.abs(dx) < 24) return

    // CRITICAL FIX: Block iOS swipe-back when swiping right on non-first clips
    // Only allow native swipe-back on first clip
    if (dx < 0 && currentIndex > 0) {
      e.preventDefault() // Block iOS gesture
    }

    // Swipe right on first clip = let iOS handle it naturally (exit to library)
    if (dx < 0 && currentIndex === 0) {
      dragActiveRef.current = false
      return
    }

    // Rubber-band resistance at boundaries
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
    // Clean up hold timer
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current)
      holdTimerRef.current = null
    }
    
    // Resume playback if was holding
    const video = videoRef.current
    if (isHolding && wasPlayingBeforeHold.current && video) {
      video.play().catch(() => {})
      setShowPauseOverlay(false)
      wasPlayingBeforeHold.current = false
    }
    setIsHolding(false)
    
    if (!dragActiveRef.current) return
    dragActiveRef.current = false

    const THRESHOLD = window.innerWidth * 0.3
    const offset = dragOffsetRef.current

    if (offset > THRESHOLD && currentIndex < clips.length - 1) {
      // Swipe left committed — next clip
      setDragTransitioning(true)
      setDragOffset(window.innerWidth)
      
      setTimeout(() => {
        goToClip(currentIndex + 1)
        setDragOffset(0)
        dragOffsetRef.current = 0
        setDragTransitioning(false)
      }, 300)
    } else if (offset < -THRESHOLD && currentIndex > 0) {
      // Swipe right committed — previous clip
      setDragTransitioning(true)
      setDragOffset(-window.innerWidth)
      
      setTimeout(() => {
        goToClip(currentIndex - 1)
        setDragOffset(0)
        dragOffsetRef.current = 0
        setDragTransitioning(false)
      }, 300)
    } else {
      // Spring back
      setDragTransitioning(true)
      dragOffsetRef.current = 0
      setDragOffset(0)
    }
  }

  // ── Loading ─────────────────────────────────────────────────
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

  // ── Playback view ────────────────────────────────────────────
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
          transform: `translateX(calc(-100vw + ${-dragOffset}px))`, // Start at -100vw (showing current)
          transition: dragTransitioning
            ? 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
            : 'none',
          willChange: 'transform',
          width: prevClip || nextClip ? '300vw' : '100vw', // Three panels when prev or next exists
        }}
        onTransitionEnd={() => setDragTransitioning(false)}
      >
        {/* Previous video - on the left */}
        {prevClip ? (
          <div className="relative w-screen h-screen flex-shrink-0">
            <video
              ref={prevVideoRef}
              className="absolute inset-0 w-full h-full object-cover"
              playsInline
              preload="auto"
              muted
            />

            {/* Top vignette */}
            <div
              className="absolute inset-x-0 top-0 h-44 pointer-events-none"
              style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, transparent 100%)' }}
            />

            {/* Bottom vignette */}
            <div
              className="absolute inset-x-0 bottom-0 h-56 pointer-events-none"
              style={{ background: 'linear-gradient(0deg, rgba(0,0,0,0.7) 0%, transparent 100%)' }}
            />

            {/* Previous clip caption preview */}
            {prevClip?.caption_text && (
              <div
                className="absolute pointer-events-none"
                style={{
                  left: `${prevClip.caption_x ?? 50}%`,
                  top: `${prevClip.caption_y ?? 85}%`,
                  transform: 'translate(-50%, -50%)',
                  maxWidth: '80vw',
                }}
              >
                <p
                  className="font-display italic text-wheat text-center leading-snug"
                  style={{
                    fontSize: `${prevClip.caption_size || 24}px`,
                    textShadow: '0 2px 12px rgba(0,0,0,0.6), 0 0 40px rgba(0,0,0,0.4)',
                  }}
                >
                  {prevClip.caption_text}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="relative w-screen h-screen flex-shrink-0 bg-deep" />
        )}

        {/* Current video - in the center */}
        <div className="relative w-screen h-screen flex-shrink-0">
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            onTimeUpdate={handleTimeUpdate}
            onEnded={() => goToClip(currentIndex + 1)}
            onPlay={() => { setIsPlaying(true); setShowPauseOverlay(false) }}
            onPause={() => setIsPlaying(false)}
            playsInline
            preload="metadata"
          />

          {/* Top vignette */}
          <div
            className="absolute inset-x-0 top-0 h-44 pointer-events-none"
            style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, transparent 100%)' }}
          />

          {/* Bottom vignette */}
          <div
            className="absolute inset-x-0 bottom-0 h-56 pointer-events-none"
            style={{ background: 'linear-gradient(0deg, rgba(0,0,0,0.7) 0%, transparent 100%)' }}
          />

          {/* Caption overlay */}
          {currentClip?.caption_text && (
            <div
              className="absolute pointer-events-none"
              style={{
                left: `${currentClip.caption_x ?? 50}%`,
                top: `${currentClip.caption_y ?? 85}%`,
                transform: 'translate(-50%, -50%)',
                maxWidth: '80vw',
              }}
            >
              <p
                className="font-display italic text-wheat text-center leading-snug"
                style={{
                  fontSize: `${currentClip.caption_size || 24}px`,
                  textShadow: '0 2px 12px rgba(0,0,0,0.6), 0 0 40px rgba(0,0,0,0.4)',
                }}
              >
                {currentClip.caption_text}
              </p>
            </div>
          )}

          {/* Pause overlay */}
          {showPauseOverlay && (
            <div className="absolute inset-0 bg-black/35 flex items-center justify-center pointer-events-none">
              <div
                className="w-[72px] h-[72px] rounded-full flex items-center justify-center"
                style={{ background: 'rgba(242,162,74,0.9)', boxShadow: '0 0 40px rgba(242,162,74,0.3)' }}
              >
                <Play size={28} fill="#2C1A0E" strokeWidth={0} className="ml-1" />
              </div>
            </div>
          )}

          {/* Swipe hints */}
          {dragOffset > 12 && (
            <div
              className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ opacity: Math.min(dragOffset / 80, 0.6) }}
            >
              <div className="text-wheat/60 text-xs font-semibold tracking-widest uppercase">
                → Next
              </div>
            </div>
          )}
          {dragOffset < -12 && currentIndex > 0 && (
            <div
              className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ opacity: Math.min(Math.abs(dragOffset) / 80, 0.6) }}
            >
              <div className="text-wheat/60 text-xs font-semibold tracking-widest uppercase">
                ← Previous
              </div>
            </div>
          )}
        </div>

        {/* Next video - on the right */}
        {nextClip ? (
          <div className="relative w-screen h-screen flex-shrink-0">
            <video
              ref={nextVideoRef}
              className="absolute inset-0 w-full h-full object-cover"
              playsInline
              preload="auto"
              muted
            />

            {/* Top vignette */}
            <div
              className="absolute inset-x-0 top-0 h-44 pointer-events-none"
              style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, transparent 100%)' }}
            />

            {/* Bottom vignette */}
            <div
              className="absolute inset-x-0 bottom-0 h-56 pointer-events-none"
              style={{ background: 'linear-gradient(0deg, rgba(0,0,0,0.7) 0%, transparent 100%)' }}
            />

            {/* Next clip caption preview */}
            {nextClip?.caption_text && (
              <div
                className="absolute pointer-events-none"
                style={{
                  left: `${nextClip.caption_x ?? 50}%`,
                  top: `${nextClip.caption_y ?? 85}%`,
                  transform: 'translate(-50%, -50%)',
                  maxWidth: '80vw',
                }}
              >
                <p
                  className="font-display italic text-wheat text-center leading-snug"
                  style={{
                    fontSize: `${nextClip.caption_size || 24}px`,
                    textShadow: '0 2px 12px rgba(0,0,0,0.6), 0 0 40px rgba(0,0,0,0.4)',
                  }}
                >
                  {nextClip.caption_text}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="relative w-screen h-screen flex-shrink-0 bg-deep" />
        )}
      </div>

      {/* ── Static chrome — stays in place ── */}

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

      {/* Segmented progress bar - clearly below buttons with gap */}
      <div className="absolute top-[92px] left-5 right-5 flex gap-1 z-20">
        {clips.map((clip, i) => (
          <div
            key={clip.id}
            className="flex-1 h-[2.5px] rounded-full overflow-hidden"
            style={{ background: 'rgba(245,222,179,0.2)' }}
          >
            {i < currentIndex && (
              <div className="h-full w-full" style={{ background: 'rgba(245,222,179,0.7)' }} />
            )}
            {i === currentIndex && (
              <div
                className="h-full"
                style={{ width: `${progress * 100}%`, background: '#F5DEB3' }}
              />
            )}
          </div>
        ))}
      </div>

      {/* Bottom info + play button */}
      <div className="absolute bottom-10 left-0 right-0 px-6 flex items-end justify-between z-20">
        <div>
          <p className="text-amber/50 text-[10px] font-semibold tracking-[0.15em] uppercase mb-1">
            {scrapbook?.name}
          </p>
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

            <div className="w-full flex items-center gap-3.5 px-2 py-4 border-b border-walnut-light opacity-35">
              <Share2 size={20} strokeWidth={1.75} className="text-amber flex-shrink-0" />
              <div>
                <p className="text-wheat font-semibold text-[15px]">Share Scrapbook</p>
                <p className="text-rust text-[11px] mt-0.5">Coming soon</p>
              </div>
            </div>

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
