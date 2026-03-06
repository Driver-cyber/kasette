import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Play, Search, X, MoreHorizontal, ChevronDown, Image, Shuffle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { APP_VERSION } from '../version'

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

function extractStoragePath(url) {
  const marker = 'cassette-media/'
  const idx = url.indexOf(marker)
  return idx >= 0 ? url.slice(idx + marker.length) : null
}

function ScrapbookCard({ scrapbook, onClick, onOptionsPress }) {
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

        {/* Options button — top left */}
        <button
          onClick={(e) => { e.stopPropagation(); onOptionsPress() }}
          className="absolute top-2.5 left-2.5 w-8 h-8 rounded-full flex items-center justify-center active:opacity-70"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
        >
          <MoreHorizontal size={15} strokeWidth={1.75} className="text-wheat/70" />
        </button>

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
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [optionsId, setOptionsId] = useState(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [showVersion, setShowVersion] = useState(false) // Version popup
  const searchInputRef = useRef(null)
  const coverChangeInputRef = useRef(null)

  useEffect(() => {
    if (!session) return
    setLoading(true)
    supabase
      .from('scrapbooks')
      .select('*, clips(id, video_url, duration, trim_in, trim_out, recorded_at)')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) setScrapbooks(data)
        setLoading(false)
      })
  }, [session])

  // Focus search input when it opens
  useEffect(() => {
    if (showSearch) {
      setTimeout(() => searchInputRef.current?.focus(), 100)
    }
  }, [showSearch])

  function closeSearch() {
    setShowSearch(false)
    setSearchQuery('')
  }

  const [collapsedYears, setCollapsedYears] = useState(new Set())

  function toggleYear(year) {
    setCollapsedYears(prev => {
      const next = new Set(prev)
      next.has(year) ? next.delete(year) : next.add(year)
      return next
    })
  }

  const filteredScrapbooks = searchQuery.trim()
    ? scrapbooks.filter(sb =>
        sb.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : scrapbooks

  // Group by year, sorted newest first
  const groupedByYear = filteredScrapbooks.reduce((acc, sb) => {
    const y = sb.year ?? new Date(sb.created_at).getFullYear()
    ;(acc[y] ??= []).push(sb)
    return acc
  }, {})
  const years = Object.keys(groupedByYear).map(Number).sort((a, b) => b - a)

  const optionsScrapbook = scrapbooks.find(sb => sb.id === optionsId)
  const confirmDeleteScrapbook = scrapbooks.find(sb => sb.id === confirmDeleteId)

  async function handleCoverChange(e) {
    const file = e.target.files?.[0]
    if (!file || !optionsId) return
    const sbId = optionsId
    setOptionsId(null)
    e.target.value = ''

    // Optimistic preview while uploading
    const reader = new FileReader()
    reader.onload = (ev) => {
      setScrapbooks(prev => prev.map(sb =>
        sb.id === sbId ? { ...sb, cover_image_url: ev.target.result } : sb
      ))
    }
    reader.readAsDataURL(file)

    // Upload to storage (upsert — overwrites existing cover)
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const coverPath = `${session.user.id}/covers/${sbId}.${ext}`
    const { error } = await supabase.storage
      .from('cassette-media')
      .upload(coverPath, file, { cacheControl: '3600', upsert: true })
    if (!error) {
      const { data: { publicUrl } } = supabase.storage
        .from('cassette-media')
        .getPublicUrl(coverPath)
      await supabase.from('scrapbooks').update({ cover_image_url: publicUrl }).eq('id', sbId)
      setScrapbooks(prev => prev.map(sb =>
        sb.id === sbId ? { ...sb, cover_image_url: publicUrl } : sb
      ))
    }
  }

  async function deleteScrapbook() {
    if (!confirmDeleteId || deleting) return
    setDeleting(true)

    const target = scrapbooks.find(sb => sb.id === confirmDeleteId)

    // Optimistically remove from UI
    setScrapbooks(prev => prev.filter(sb => sb.id !== confirmDeleteId))
    setConfirmDeleteId(null)

    // Delete storage files (best effort)
    const clips = target?.clips ?? []
    const storagePaths = clips
      .map(c => extractStoragePath(c.video_url))
      .filter(Boolean)
    if (storagePaths.length > 0) {
      await supabase.storage.from('cassette-media').remove(storagePaths)
    }

    // Delete clips then scrapbook from DB
    await supabase.from('clips').delete().eq('scrapbook_id', confirmDeleteId)
    await supabase.from('scrapbooks').delete().eq('id', confirmDeleteId)

    setDeleting(false)
  }

  return (
    <div className="flex flex-col h-screen bg-walnut">

      {/* Nav - Compressed header */}
      <header className="flex items-center justify-between px-6 pt-8 pb-2 flex-shrink-0">
        <button 
          onClick={() => setShowVersion(true)}
          className="flex items-center gap-2.5 active:opacity-70"
        >
          {/* Spool logo - slightly bigger */}
          <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
            <rect width="48" height="48" rx="9" fill="#3D2410"/>
            <circle cx="16" cy="22" r="8" stroke="#F2A24A" strokeWidth="3.5" fill="none"/>
            <circle cx="32" cy="22" r="8" stroke="#F2A24A" strokeWidth="3.5" fill="none"/>
            <circle cx="16" cy="22" r="2.5" fill="#F2A24A"/>
            <circle cx="32" cy="22" r="2.5" fill="#F2A24A"/>
            <rect x="14" y="31" width="20" height="3" rx="1.5" fill="#E8855A"/>
          </svg>
          <span className="font-display font-bold text-[24px] text-amber leading-none">
            Cassette<em className="font-light text-sienna not-italic">.</em>
          </span>
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/discover')}
            className="w-10 h-10 flex items-center justify-center rounded-full active:opacity-70"
          >
            <Shuffle size={18} strokeWidth={2} className="text-wheat/50" />
          </button>

          <button
            onClick={() => showSearch ? closeSearch() : setShowSearch(true)}
            className="w-10 h-10 flex items-center justify-center rounded-full active:opacity-70"
            style={{ background: showSearch ? 'rgba(242,162,74,0.12)' : 'transparent' }}
          >
            {showSearch
              ? <X size={18} strokeWidth={2} className="text-amber" />
              : <Search size={18} strokeWidth={2} className="text-wheat/50" />
            }
          </button>

          <button
            onClick={() => navigate('/intake')}
            className="flex items-center gap-1.5 bg-amber text-walnut font-sans font-bold text-[13px] rounded-full px-5 py-2.5 tracking-wide active:opacity-80 transition-opacity"
          >
            <Plus size={12} strokeWidth={2.5} />
            New
          </button>
        </div>
      </header>

      {/* Search bar */}
      {showSearch && (
        <div className="px-5 pb-3 flex-shrink-0">
          <div
            className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 border"
            style={{ background: '#3D2410', borderColor: '#4A2E18' }}
          >
            <Search size={14} strokeWidth={1.75} className="text-rust flex-shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search scrapbooks…"
              className="flex-1 bg-transparent font-sans text-base text-wheat placeholder:text-rust/50 outline-none"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="active:opacity-70">
                <X size={13} strokeWidth={2} className="text-rust" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Divider */}
      <div className="mx-6 mb-5 h-px bg-walnut-light opacity-60 flex-shrink-0" />

      {/* Section heading */}
      {!showSearch && (
        <div className="px-6 mb-4 flex-shrink-0">
          <p className="text-rust text-[10px] font-semibold tracking-[0.2em] uppercase mb-1">
            Your scrapbooks
          </p>
          <h2 className="font-display font-bold text-[30px] text-wheat leading-[1.1]">
            What would you<br />like to <em className="font-light text-sienna">watch?</em>
          </h2>
        </div>
      )}

      {/* Scrapbook list */}
      <main className="flex-1 overflow-y-auto px-5 pb-8">
        {loading ? (
          <div className="flex items-center justify-center pt-20">
            <div className="w-7 h-7 rounded-full border-2 border-amber border-t-transparent animate-spin" />
          </div>
        ) : filteredScrapbooks.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-20 gap-3 text-center">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="opacity-20">
              <circle cx="16" cy="22" r="8" stroke="#F5DEB3" strokeWidth="3" fill="none"/>
              <circle cx="32" cy="22" r="8" stroke="#F5DEB3" strokeWidth="3" fill="none"/>
              <circle cx="16" cy="22" r="2.5" fill="#F5DEB3"/>
              <circle cx="32" cy="22" r="2.5" fill="#F5DEB3"/>
              <rect x="14" y="31" width="20" height="3" rx="1.5" fill="#F5DEB3"/>
            </svg>
            <p className="font-display font-semibold text-xl text-wheat opacity-60">
              {searchQuery ? `No results for "${searchQuery}"` : 'No scrapbooks yet'}
            </p>
            {!searchQuery && (
              <p className="text-rust text-sm leading-relaxed max-w-[220px]">
                Tap <strong className="text-amber">New</strong> to import videos from your camera roll and create your first scrapbook.
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col">
            {years.map((year, yi) => (
              <div key={year}>
                {/* Year header */}
                <button
                  onClick={() => toggleYear(year)}
                  className="w-full flex items-center justify-between py-3 active:opacity-70"
                  style={{ paddingTop: yi === 0 ? 4 : 20 }}
                >
                  <div className="flex items-baseline gap-2.5">
                    <span className="font-display font-bold text-[26px] text-wheat leading-none">{year}</span>
                    <span className="text-rust text-[11px] font-semibold">
                      {groupedByYear[year].length} {groupedByYear[year].length === 1 ? 'scrapbook' : 'scrapbooks'}
                    </span>
                  </div>
                  <ChevronDown
                    size={16}
                    strokeWidth={2}
                    className="text-wheat/30 transition-transform duration-200"
                    style={{ transform: collapsedYears.has(year) ? 'rotate(-90deg)' : 'rotate(0deg)' }}
                  />
                </button>

                {/* Cards */}
                {!collapsedYears.has(year) && (
                  <div className="flex flex-col gap-3.5 pb-2">
                    {groupedByYear[year].map((sb) => (
                      <ScrapbookCard
                        key={sb.id}
                        scrapbook={sb}
                        onClick={() => navigate(`/scrapbook/${sb.id}`)}
                        onOptionsPress={() => setOptionsId(sb.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Delete confirmation sheet */}
      {confirmDeleteId && (
        <>
          <div
            className="absolute inset-0 bg-black/50 z-10"
            onClick={() => setConfirmDeleteId(null)}
          />
          <div
            className="absolute bottom-0 left-0 right-0 z-20 rounded-t-3xl border-t border-walnut-light px-5 pb-10 pt-1"
            style={{ background: '#3D2410' }}
          >
            <div className="w-10 h-1 rounded-full bg-walnut-light mx-auto mt-3 mb-6" />
            <p className="font-display font-semibold text-xl text-wheat mb-1">
              Delete "{confirmDeleteScrapbook?.name}"?
            </p>
            <p className="text-rust text-sm mb-8 leading-relaxed">
              This will permanently delete the scrapbook and remove all clips from Cassette. Your original videos won't be affected.
            </p>
            <button
              onClick={deleteScrapbook}
              disabled={deleting}
              className="w-full bg-sienna text-white font-sans font-bold text-[15px] rounded-2xl py-4 mb-3 active:opacity-80 disabled:opacity-50"
            >
              {deleting ? 'Deleting…' : 'Delete Scrapbook'}
            </button>
            <button
              onClick={() => setConfirmDeleteId(null)}
              className="w-full py-3 text-center text-rust font-semibold text-[15px] active:opacity-70"
            >
              Cancel
            </button>
          </div>
        </>
      )}
      {/* Options sheet */}
      {optionsId && (
        <>
          <div
            className="absolute inset-0 bg-black/50 z-10"
            onClick={() => setOptionsId(null)}
          />
          <div
            className="absolute bottom-0 left-0 right-0 z-20 rounded-t-3xl border-t border-walnut-light px-5 pb-10 pt-1"
            style={{ background: '#3D2410' }}
          >
            <div className="w-10 h-1 rounded-full bg-walnut-light mx-auto mt-3 mb-5" />
            <p className="font-display font-semibold text-lg text-wheat mb-5 px-1">
              {optionsScrapbook?.name}
            </p>

            {/* Change cover */}
            <button
              onClick={() => coverChangeInputRef.current?.click()}
              className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl mb-2 active:opacity-75"
              style={{ background: '#2C1A0E' }}
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(242,162,74,0.1)' }}>
                <Image size={16} strokeWidth={1.75} className="text-amber" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-wheat text-[14px] font-semibold leading-none mb-0.5">
                  {optionsScrapbook?.cover_image_url ? 'Change cover' : 'Add cover image'}
                </p>
                <p className="text-rust text-[11px]">Pick a photo from your camera roll</p>
              </div>
            </button>

            {/* Delete */}
            <button
              onClick={() => { setOptionsId(null); setConfirmDeleteId(optionsId) }}
              className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl mb-4 active:opacity-75"
              style={{ background: '#2C1A0E' }}
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(232,133,90,0.1)' }}>
                <X size={16} strokeWidth={2} className="text-sienna" />
              </div>
              <p className="text-sienna text-[14px] font-semibold">Delete Scrapbook</p>
            </button>

            <button
              onClick={() => setOptionsId(null)}
              className="w-full py-3 text-center text-rust font-semibold text-[15px] active:opacity-70"
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {/* Version popup */}
      {showVersion && (
        <>
          <div 
            className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center"
            onClick={() => setShowVersion(false)}
          >
            <div 
              className="mx-6 max-w-sm w-full bg-walnut rounded-2xl p-6 border border-walnut-light"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Logo */}
              <div className="flex items-center justify-center gap-3 mb-4">
                <svg width="40" height="40" viewBox="0 0 48 48" fill="none">
                  <rect width="48" height="48" rx="9" fill="#3D2410"/>
                  <circle cx="16" cy="22" r="8" stroke="#F2A24A" strokeWidth="3.5" fill="none"/>
                  <circle cx="32" cy="22" r="8" stroke="#F2A24A" strokeWidth="3.5" fill="none"/>
                  <circle cx="16" cy="22" r="2.5" fill="#F2A24A"/>
                  <circle cx="32" cy="22" r="2.5" fill="#F2A24A"/>
                  <rect x="14" y="31" width="20" height="3" rx="1.5" fill="#E8855A"/>
                </svg>
                <span className="font-display font-bold text-[28px] text-amber leading-none">
                  Cassette<em className="font-light text-sienna not-italic">.</em>
                </span>
              </div>

              {/* Version info */}
              <div className="text-center mb-5">
                <p className="text-wheat/40 text-[11px] font-bold tracking-[0.15em] uppercase mb-1">
                  Version
                </p>
                <p className="font-display text-[32px] font-bold text-amber">
                  {APP_VERSION.number}
                </p>
              </div>

              {/* Build info */}
              <div className="bg-deep rounded-xl p-4 mb-5 border border-walnut-light">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-rust text-[10px] font-bold tracking-widest uppercase">Build</span>
                  <span className="text-wheat/60 font-mono text-xs">{APP_VERSION.build}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-rust text-[10px] font-bold tracking-widest uppercase">Status</span>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber animate-pulse" />
                    <span className="text-amber text-xs font-semibold">{APP_VERSION.status}</span>
                  </div>
                </div>
              </div>

              {/* Logout button */}
              <button
                onClick={async () => {
                  await supabase.auth.signOut()
                  setShowVersion(false)
                  navigate('/login')
                }}
                className="w-full bg-walnut-mid text-rust font-sans font-semibold text-[14px] rounded-xl py-3 active:opacity-80 mb-2 border border-walnut-light"
              >
                Log Out
              </button>

              {/* Close button */}
              <button
                onClick={() => setShowVersion(false)}
                className="w-full bg-amber text-walnut font-sans font-bold text-[15px] rounded-xl py-3.5 active:opacity-80"
              >
                Got it
              </button>
            </div>
          </div>
        </>
      )}

      {/* Hidden cover image input */}
      <input
        ref={coverChangeInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleCoverChange}
      />
    </div>
  )
}
