import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { preloadClip, preloadClips } from '../lib/blobCache'

function shuffleArray(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function Reel({ reverse = false }) {
  return (
    <div
      className="animate-spin"
      style={{ animationDuration: reverse ? '1.7s' : '2.1s', animationDirection: reverse ? 'reverse' : 'normal' }}
    >
      <svg width="56" height="56" viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="24" r="20" stroke="#F2A24A" strokeWidth="2.5" fill="none" />
        <circle cx="24" cy="24" r="7" stroke="#F2A24A" strokeWidth="1.5" fill="none" />
        <circle cx="24" cy="24" r="2.5" fill="#F2A24A" />
        <line x1="24" y1="4" x2="24" y2="17" stroke="#F2A24A" strokeWidth="2" strokeLinecap="round" />
        <line x1="41.3" y1="34" x2="30.1" y2="27.5" stroke="#F2A24A" strokeWidth="2" strokeLinecap="round" />
        <line x1="6.7" y1="34" x2="17.9" y2="27.5" stroke="#F2A24A" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  )
}

export default function RemixScreen() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const [phase, setPhase] = useState('studio') // 'studio' | 'loading'
  const [clipCount, setClipCount] = useState(8)
  const [includeShared, setIncludeShared] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)
  const cancelledRef = useRef(false)

  async function handleMakeRemix() {
    cancelledRef.current = false
    setPhase('loading')
    setErrorMsg(null)

    try {
      const pool = []

      // Own scrapbooks + clips
      const { data: ownSbs } = await supabase
        .from('scrapbooks')
        .select('id, name, year, created_at, clips(id, video_url, thumbnail_url, duration, trim_in, trim_out, cut_in, cut_out, caption_text, caption_x, caption_y, caption_size)')
        .eq('user_id', session.user.id)

      for (const sb of ownSbs || []) {
        for (const clip of sb.clips || []) {
          if (clip.video_url) {
            pool.push({
              ...clip,
              scrapbook: {
                id: sb.id,
                name: sb.name,
                year: sb.year ?? new Date(sb.created_at).getFullYear(),
              },
            })
          }
        }
      }

      // Shared scrapbooks + clips (if toggle on)
      if (includeShared) {
        const { data: sharedRows } = await supabase
          .from('scrapbook_shares')
          .select('scrapbook_id')
          .eq('shared_with_id', session.user.id)

        if (sharedRows?.length) {
          const { data: sharedSbs } = await supabase
            .from('scrapbooks')
            .select('id, name, year, created_at, clips(id, video_url, thumbnail_url, duration, trim_in, trim_out, cut_in, cut_out, caption_text, caption_x, caption_y, caption_size)')
            .in('id', sharedRows.map(r => r.scrapbook_id))

          for (const sb of sharedSbs || []) {
            for (const clip of sb.clips || []) {
              if (clip.video_url) {
                pool.push({
                  ...clip,
                  scrapbook: {
                    id: sb.id,
                    name: sb.name,
                    year: sb.year ?? new Date(sb.created_at).getFullYear(),
                  },
                })
              }
            }
          }
        }
      }

      if (pool.length === 0) {
        setPhase('studio')
        setErrorMsg('No clips found. Add some videos to a scrapbook first.')
        return
      }

      // Shuffle and pick N
      const selected = shuffleArray(pool).slice(0, Math.min(clipCount, pool.length))

      // Preload thumbnail images so swipe transitions show immediately
      selected.forEach(c => { if (c.thumbnail_url) { const img = new Image(); img.src = c.thumbnail_url } })

      // Minimum 4s loading + first 3 clip blobs ready before navigating
      const minDelay = new Promise(r => setTimeout(r, 4000))
      const firstReady = preloadClips(selected, 3)
      selected.slice(3).forEach(c => preloadClip(c.video_url)) // fire and forget rest
      await Promise.all([minDelay, firstReady])

      if (cancelledRef.current) return
      navigate('/discover', { state: { clips: selected, isRemix: true } })
    } catch {
      setPhase('studio')
      setErrorMsg('Something went wrong. Try again.')
    }
  }

  // ── Loading screen ──────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div
        className="relative flex flex-col items-center justify-center bg-walnut gap-10 px-8 text-center"
        style={{ height: '100dvh' }}
      >
        <button
          onClick={() => { cancelledRef.current = true; setPhase('studio') }}
          className="absolute top-14 right-5 w-10 h-10 flex items-center justify-center rounded-full active:opacity-60"
          style={{ background: 'rgba(74,46,24,0.6)' }}
        >
          <X size={20} strokeWidth={2} className="text-wheat/60" />
        </button>
        <div className="flex items-center gap-10">
          <Reel />
          <Reel reverse />
        </div>
        <div>
          <p className="font-display italic text-amber text-4xl tracking-tight mb-2">
            Making it groovy
          </p>
          <p className="text-rust text-sm leading-relaxed">
            Pulling your best moments together
          </p>
        </div>
      </div>
    )
  }

  // ── Studio screen ───────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col bg-walnut" style={{ height: '100dvh' }}>

      {/* Nav */}
      <header className="flex items-center px-5 pt-14 pb-2 flex-shrink-0">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 text-wheat/45 font-sans text-[15px] font-semibold active:opacity-60"
        >
          <ArrowLeft size={18} strokeWidth={2} />
          Library
        </button>
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 gap-10 pb-8">

        {/* Title */}
        <div className="text-center">
          <p className="font-display italic text-amber text-5xl tracking-tight mb-2">The Remix</p>
          <p className="text-rust/80 text-sm">A random cut from your library</p>
        </div>

        {/* Clip count stepper */}
        <div className="w-full max-w-xs">
          <p className="text-rust text-[10px] font-bold tracking-[0.18em] uppercase text-center mb-5">
            How many clips?
          </p>
          <div className="flex items-center justify-center gap-6">
            <button
              onClick={() => setClipCount(c => Math.max(6, c - 1))}
              disabled={clipCount <= 6}
              className="w-12 h-12 rounded-full flex items-center justify-center border text-[22px] font-bold active:opacity-70 transition-opacity"
              style={{
                borderColor: clipCount <= 6 ? '#3D2410' : '#4A2E18',
                color: clipCount <= 6 ? '#4A2E18' : '#F2A24A',
                background: 'rgba(242,162,74,0.06)',
              }}
            >
              –
            </button>
            <span className="font-display text-[72px] text-wheat tabular-nums w-20 text-center leading-none">
              {clipCount}
            </span>
            <button
              onClick={() => setClipCount(c => Math.min(12, c + 1))}
              disabled={clipCount >= 12}
              className="w-12 h-12 rounded-full flex items-center justify-center border text-[22px] font-bold active:opacity-70 transition-opacity"
              style={{
                borderColor: clipCount >= 12 ? '#3D2410' : '#4A2E18',
                color: clipCount >= 12 ? '#4A2E18' : '#F2A24A',
                background: 'rgba(242,162,74,0.06)',
              }}
            >
              +
            </button>
          </div>
          <div className="flex justify-between mt-2.5 px-1">
            <span className="text-walnut-light text-[9px] font-bold tracking-wider uppercase">6 min</span>
            <span className="text-walnut-light text-[9px] font-bold tracking-wider uppercase">12 max</span>
          </div>
        </div>

        {/* Include shared toggle */}
        <div className="w-full max-w-xs">
          <div
            className="flex items-center justify-between px-4 py-4 rounded-2xl border"
            style={{ background: '#3D2410', borderColor: includeShared ? 'rgba(242,162,74,0.25)' : '#4A2E18' }}
          >
            <div>
              <p className="text-wheat text-[14px] font-semibold mb-0.5">Include shared clips</p>
              <p className="text-rust text-[11px] leading-snug">Pull from scrapbooks shared with you</p>
            </div>
            <button
              onClick={() => setIncludeShared(v => !v)}
              className="relative flex-shrink-0 ml-4 active:scale-95 transition-transform"
              style={{ width: 44, height: 26 }}
            >
              <div
                className="absolute inset-0 rounded-full transition-colors duration-200"
                style={{ background: includeShared ? '#F2A24A' : '#2C1A0E', border: `1px solid ${includeShared ? '#F2A24A' : '#4A2E18'}` }}
              />
              <div
                className="absolute top-[4px] rounded-full bg-white shadow transition-all duration-200"
                style={{ width: 18, height: 18, left: includeShared ? 22 : 4 }}
              />
            </button>
          </div>
        </div>

        {/* Error message */}
        {errorMsg && (
          <p className="text-sienna text-sm text-center max-w-xs leading-relaxed">{errorMsg}</p>
        )}

        {/* CTA */}
        <button
          onClick={handleMakeRemix}
          className="w-full max-w-xs py-4 rounded-2xl font-sans font-bold text-[16px] text-walnut active:opacity-80"
          style={{ background: '#F2A24A' }}
        >
          Make My Remix
        </button>

      </div>
    </div>
  )
}
