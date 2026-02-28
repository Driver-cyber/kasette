import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Play } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// Warm gradient palettes for cards without a cover image
const CARD_GRADIENTS = [
  'linear-gradient(135deg, #6B2D0E 0%, #3D1A0A 40%, #8B3A18 100%)',
  'linear-gradient(135deg, #1A3A2E 0%, #0E2218 40%, #2A5040 100%)',
  'linear-gradient(135deg, #3A2A0E 0%, #6B4A18 60%, #2C1A0E 100%)',
  'linear-gradient(135deg, #4A1A2A 0%, #2C0E18 40%, #6B2A3A 100%)',
  'linear-gradient(135deg, #1A2A3A 0%, #0E1A28 60%, #2A3A50 100%)',
  'linear-gradient(135deg, #3A1A10 0%, #6B2A18 60%, #2C1008 100%)',
]

function hashId(id) {
  let h = 0
  for (let i = 0; i < id.length; i++) {
    h = (Math.imul(31, h) + id.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

function formatCardDuration(seconds) {
  if (!seconds) return ''
  const total = Math.round(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  if (m === 0) return `${s} sec`
  if (s === 0) return `${m} min`
  return `${m} min ${s} sec`
}

function formatCardDate(clips, createdAt) {
  const dates = clips
    .map(c => c.recorded_at ? new Date(c.recorded_at) : null)
    .filter(Boolean)
  const ref = dates.length > 0
    ? new Date(Math.min(...dates.map(d => d.getTime())))
    : new Date(createdAt)
  return ref.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function ScrapbookCard({ scrapbook, index, onClick }) {
  const clips = scrapbook.clips ?? []
  const totalDuration = clips.reduce((sum, c) => {
    const out = c.trim_out ?? c.duration ?? 0
    return sum + (out - (c.trim_in ?? 0))
  }, 0)
  const gradient = CARD_GRADIENTS[hashId(scrapbook.id) % CARD_GRADIENTS.length]
  const date = formatCardDate(clips, scrapbook.created_at)
  const duration = formatCardDuration(totalDuration)

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-[18px] overflow-hidden active:scale-[0.98] transition-transform border border-walnut-light"
      style={{ background: '#3D2410' }}
    >
      {/* Thumbnail */}
      <div className="relative h-[148px] overflow-hidden">
        {scrapbook.cover_image_url ? (
          <img
            src={scrapbook.cover_image_url}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0" style={{ background: gradient }} />
        )}

        {/* Gradient overlay */}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(180deg, rgba(44,26,14,0) 40%, rgba(44,26,14,0.85) 100%)' }}
        />

        {/* Clip count badge */}
        <div
          className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-amber font-sans text-[10px] font-semibold tracking-widest border"
          style={{ background: 'rgba(44,26,14,0.75)', borderColor: 'rgba(242,162,74,0.25)', backdropFilter: 'blur(4px)' }}
        >
          {clips.length} {clips.length === 1 ? 'clip' : 'clips'}
        </div>

        {/* Play hint */}
        <div className="absolute bottom-3.5 right-3.5 w-9 h-9 rounded-full bg-amber flex items-center justify-center">
          <Play size={13} fill="#2C1A0E" strokeWidth={0} className="ml-0.5" />
        </div>
      </div>

      {/* Card body */}
      <div className="px-4 pt-3.5 pb-4">
        <div className="font-display font-semibold text-[18px] text-wheat leading-snug mb-1">
          {scrapbook.name}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-rust text-[11px]">{date}</span>
          {duration && (
            <span className="text-wheat text-[11px] opacity-35">{duration}</span>
          )}
        </div>
      </div>
    </button>
  )
}

export default function HomeScreen() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const [scrapbooks, setScrapbooks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session) return
    setLoading(true)
    supabase
      .from('scrapbooks')
      .select('*, clips(id, duration, trim_in, trim_out, recorded_at)')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) setScrapbooks(data)
        setLoading(false)
      })
  }, [session])

  return (
    <div className="flex flex-col h-screen bg-walnut">

      {/* Nav */}
      <header className="flex items-center justify-between px-6 pt-14 pb-4 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          {/* Spool logo */}
          <svg width="28" height="28" viewBox="0 0 48 48" fill="none">
            <rect width="48" height="48" rx="9" fill="#3D2410"/>
            <circle cx="16" cy="22" r="8" stroke="#F2A24A" strokeWidth="3.5" fill="none"/>
            <circle cx="32" cy="22" r="8" stroke="#F2A24A" strokeWidth="3.5" fill="none"/>
            <circle cx="16" cy="22" r="2.5" fill="#F2A24A"/>
            <circle cx="32" cy="22" r="2.5" fill="#F2A24A"/>
            <rect x="14" y="31" width="20" height="3" rx="1.5" fill="#E8855A"/>
          </svg>
          <span className="font-display font-bold text-[22px] text-amber leading-none">
            Cassette<em className="font-light text-sienna not-italic">.</em>
          </span>
        </div>

        <button
          onClick={() => navigate('/intake')}
          className="flex items-center gap-1.5 bg-amber text-walnut font-sans font-bold text-xs rounded-full px-4 py-2.5 tracking-wide active:opacity-80 transition-opacity"
        >
          <Plus size={12} strokeWidth={2.5} />
          New
        </button>
      </header>

      {/* Divider */}
      <div className="mx-6 mb-5 h-px bg-walnut-light opacity-60" />

      {/* Section heading */}
      <div className="px-6 mb-4 flex-shrink-0">
        <p className="text-rust text-[10px] font-semibold tracking-[0.2em] uppercase mb-1">
          Your scrapbooks
        </p>
        <h2 className="font-display font-bold text-[30px] text-wheat leading-[1.1]">
          What would you<br />like to <em className="font-light text-sienna">watch?</em>
        </h2>
      </div>

      {/* Scrapbook list */}
      <main className="flex-1 overflow-y-auto px-5 pb-8">
        {loading ? (
          <div className="flex items-center justify-center pt-20">
            <div className="w-7 h-7 rounded-full border-2 border-amber border-t-transparent animate-spin" />
          </div>
        ) : scrapbooks.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-20 gap-3 text-center">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="opacity-20">
              <circle cx="16" cy="22" r="8" stroke="#F5DEB3" strokeWidth="3" fill="none"/>
              <circle cx="32" cy="22" r="8" stroke="#F5DEB3" strokeWidth="3" fill="none"/>
              <circle cx="16" cy="22" r="2.5" fill="#F5DEB3"/>
              <circle cx="32" cy="22" r="2.5" fill="#F5DEB3"/>
              <rect x="14" y="31" width="20" height="3" rx="1.5" fill="#F5DEB3"/>
            </svg>
            <p className="font-display font-semibold text-xl text-wheat opacity-60">
              No scrapbooks yet
            </p>
            <p className="text-rust text-sm leading-relaxed max-w-[220px]">
              Tap <strong className="text-amber">New</strong> to import videos from your camera roll and create your first scrapbook.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3.5">
            {scrapbooks.map((sb, i) => (
              <ScrapbookCard
                key={sb.id}
                scrapbook={sb}
                index={i}
                onClick={() => navigate(`/scrapbook/${sb.id}`)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
