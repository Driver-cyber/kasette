import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Shuffle } from 'lucide-react'
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
  const { session } = useAuth()
  const videoRef = useRef(null)

  const [clips, setClips] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showInfo, setShowInfo] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)

  // Swipe detection
  const touchStartY = useRef(null)
  const touchStartTime = useRef(null)
  const didSwipe = useRef(false)

  const loadClips = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('scrapbooks')
      .select('id, name, year, created_at, clips(*)')
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
  }, [session])

  useEffect(() => {
    loadClips()
  }, [loadClips])

  const currentClip = clips[currentIndex]

  // Load + autoplay when clip changes
  useEffect(() => {
    const video = videoRef.current
    if (!video || !currentClip) return
    video.src = currentClip.video_url
    video.currentTime = currentClip.trim_in || 0
    video.load()
    video.play().catch(() => {})
    setShowInfo(false)
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
    if (currentIndex < clips.length - 1) {
      setCurrentIndex(i => i + 1)
    }
  }

  function goPrev() {
    if (currentIndex > 0) {
      setCurrentIndex(i => i - 1)
    }
  }

  function reshuffle() {
    setClips(prev => shuffleArray(prev))
    setCurrentIndex(0)
    setShowInfo(false)
  }

  function handleTouchStart(e) {
    touchStartY.current = e.touches[0].clientY
    touchStartTime.current = Date.now()
    didSwipe.current = false
  }

  function handleTouchMove(e) {
    if (touchStartY.current === null) return
    const dy = Math.abs(e.touches[0].clientY - touchStartY.current)
    if (dy > 10) didSwipe.current = true
  }

  function handleTouchEnd(e) {
    if (touchStartY.current === null) return
    const dy = touchStartY.current - e.changedTouches[0].clientY
    const dt = Date.now() - touchStartTime.current
    const isSwipe = Math.abs(dy) > 40 && dt < 500

    if (isSwipe) {
      if (dy > 0) goNext()
      else goPrev()
    } else if (!didSwipe.current) {
      setShowInfo(prev => !prev)
    }
    touchStartY.current = null
  }

  // ── Loading ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center bg-deep" style={{ height: '100dvh' }}>
        <div className="w-8 h-8 rounded-full border-2 border-amber border-t-transparent animate-spin" />
      </div>
    )
  }

  // ── Empty ────────────────────────────────────────────────────────────────
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

  // ── Main view ────────────────────────────────────────────────────────────
  return (
    <div
      className="relative bg-deep overflow-hidden"
      style={{ height: '100dvh' }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Video */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        onTimeUpdate={handleTimeUpdate}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        playsInline
        preload="auto"
        muted={false}
      />

      {/* Gradient overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(180deg, rgba(0,0,0,0.45) 0%, transparent 25%, transparent 55%, rgba(0,0,0,0.7) 100%)',
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

      {/* ── Top bar ── */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between pt-14 px-5 pb-4">
        {/* Back */}
        <button
          onClick={() => navigate('/')}
          className="w-9 h-9 flex items-center justify-center rounded-full active:opacity-70"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(10px)' }}
        >
          <ArrowLeft size={16} strokeWidth={1.75} className="text-wheat" />
        </button>

        {/* Counter */}
        <div
          className="px-3.5 py-1.5 rounded-full"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(10px)' }}
        >
          <span className="text-wheat/80 text-[11px] font-semibold tabular-nums">
            {currentIndex + 1} / {clips.length}
          </span>
        </div>

        {/* Reshuffle */}
        <button
          onClick={(e) => { e.stopPropagation(); reshuffle() }}
          className="w-9 h-9 flex items-center justify-center rounded-full active:opacity-70"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(10px)' }}
        >
          <Shuffle size={15} strokeWidth={1.75} className="text-wheat" />
        </button>
      </div>

      {/* ── Scrapbook info overlay — revealed on tap ── */}
      {showInfo && (
        <div
          className="absolute bottom-0 left-0 right-0 px-6 pt-10 pointer-events-none"
          style={{
            background: 'linear-gradient(0deg, rgba(26,15,8,0.95) 0%, rgba(26,15,8,0.6) 70%, transparent 100%)',
            paddingBottom: 'max(2.5rem, env(safe-area-inset-bottom))',
          }}
        >
          <p className="text-rust text-[9px] font-bold tracking-[0.2em] uppercase mb-1.5">
            From your library · {currentClip.scrapbook.year}
          </p>
          <p className="font-display font-semibold text-[26px] text-wheat leading-tight mb-5">
            {currentClip.scrapbook.name}
          </p>
          <button
            className="pointer-events-auto flex items-center gap-2 bg-amber text-walnut font-sans font-bold text-sm rounded-full px-5 py-3 active:opacity-80"
            onClick={(e) => { e.stopPropagation(); navigate(`/scrapbook/${currentClip.scrapbook.id}`) }}
          >
            Watch scrapbook →
          </button>
        </div>
      )}

      {/* Swipe hint — shown briefly on first load */}
      {!showInfo && clips.length > 1 && (
        <div className="absolute bottom-8 left-0 right-0 flex justify-center pointer-events-none">
          <p className="text-white/25 text-[11px] font-medium">
            Swipe to explore · tap for details
          </p>
        </div>
      )}
    </div>
  )
}
