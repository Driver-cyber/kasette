import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Play, Pause, MoreHorizontal, Edit, Share2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function PlaybackScreen() {
  const navigate = useNavigate()
  const { id } = useParams()
  const videoRef = useRef(null)
  const touchStartY = useRef(null)
  const touchStartX = useRef(null)

  const [scrapbook, setScrapbook] = useState(null)
  const [clips, setClips] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [showPauseOverlay, setShowPauseOverlay] = useState(false)
  const [showActionSheet, setShowActionSheet] = useState(false)
  const [progress, setProgress] = useState(0) // 0–1 for current clip segment
  const [loading, setLoading] = useState(true)

  // Fetch scrapbook + clips
  useEffect(() => {
    Promise.all([
      supabase.from('scrapbooks').select('*').eq('id', id).single(),
      supabase.from('clips').select('*').eq('scrapbook_id', id).order('order', { ascending: true }),
    ]).then(([{ data: sb }, { data: cl }]) => {
      if (sb) setScrapbook(sb)
      if (cl) setClips(cl)
      setLoading(false)
    })
  }, [id])

  const currentClip = clips[currentIndex]

  // Load + play when clip changes
  useEffect(() => {
    const video = videoRef.current
    if (!video || !currentClip) return
    setProgress(0)
    setShowPauseOverlay(false)
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

    // Auto-advance at trim_out
    if (trimOut && video.currentTime >= trimOut) {
      goToClip(currentIndex + 1)
    }
  }

  function handleTap(e) {
    // Don't toggle play if tapping a button
    if (e.target.closest('button')) return
    if (showActionSheet) { setShowActionSheet(false); return }

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

  function handleTouchStart(e) {
    touchStartY.current = e.touches[0].clientY
    touchStartX.current = e.touches[0].clientX
  }

  function handleTouchEnd(e) {
    if (touchStartY.current === null) return
    const deltaY = touchStartY.current - e.changedTouches[0].clientY
    const deltaX = Math.abs(touchStartX.current - e.changedTouches[0].clientX)
    touchStartY.current = null
    touchStartX.current = null

    // Only count as a swipe if mostly vertical
    if (Math.abs(deltaY) < 60 || deltaX > Math.abs(deltaY) * 0.7) return
    if (deltaY > 0) goToClip(currentIndex + 1) // swipe up → next
    else goToClip(currentIndex - 1)             // swipe down → prev
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
      onTouchEnd={handleTouchEnd}
    >
      {/* Video element */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => goToClip(currentIndex + 1)}
        onPlay={() => { setIsPlaying(true); setShowPauseOverlay(false) }}
        onPause={() => setIsPlaying(false)}
        playsInline
        preload="auto"
      />

      {/* Top vignette */}
      <div
        className="absolute inset-x-0 top-0 h-44 pointer-events-none z-10"
        style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, transparent 100%)' }}
      />

      {/* Bottom vignette */}
      <div
        className="absolute inset-x-0 bottom-0 h-56 pointer-events-none z-10"
        style={{ background: 'linear-gradient(0deg, rgba(0,0,0,0.7) 0%, transparent 100%)' }}
      />

      {/* ── Top controls ── */}
      <div className="absolute top-14 left-0 right-0 flex items-center justify-between px-5 z-20">
        <button
          onClick={(e) => { e.stopPropagation(); navigate('/') }}
          className="w-9 h-9 rounded-full flex items-center justify-center border border-white/10 active:opacity-70"
          style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(8px)' }}
        >
          <ArrowLeft size={16} strokeWidth={1.75} className="text-wheat/80" />
        </button>

        <span className="font-display font-semibold text-sm text-wheat/70 truncate mx-4 max-w-[200px]">
          {scrapbook?.name}
        </span>

        <button
          onClick={(e) => { e.stopPropagation(); setShowActionSheet(true) }}
          className="w-9 h-9 rounded-full flex items-center justify-center border border-white/10 active:opacity-70"
          style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(8px)' }}
        >
          <MoreHorizontal size={16} strokeWidth={1.75} className="text-wheat/80" />
        </button>
      </div>

      {/* ── Segmented progress bar ── */}
      <div className="absolute top-[96px] left-5 right-5 flex gap-1 z-20">
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

      {/* ── Caption overlay ── */}
      {currentClip?.caption_text && (
        <div
          className="absolute z-20 pointer-events-none"
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

      {/* ── Pause overlay ── */}
      {showPauseOverlay && (
        <div className="absolute inset-0 bg-black/35 z-[15] flex items-center justify-center pointer-events-none">
          <div
            className="w-[72px] h-[72px] rounded-full flex items-center justify-center"
            style={{ background: 'rgba(242,162,74,0.9)', boxShadow: '0 0 40px rgba(242,162,74,0.3)' }}
          >
            <Play size={28} fill="#2C1A0E" strokeWidth={0} className="ml-1" />
          </div>
        </div>
      )}

      {/* ── Bottom info ── */}
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

      {/* ── Action sheet ── */}
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

            {/* Edit Scrapbook */}
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

            {/* Share — coming soon */}
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
