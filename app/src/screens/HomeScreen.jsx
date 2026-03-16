import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Play, Search, X, MoreHorizontal, ChevronDown, Image, Shuffle, Pencil, Settings } from 'lucide-react'
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

function ScrapbookCard({ scrapbook, onClick, onOptionsPress, readOnly = false, isNew = false }) {
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
          <div
            className="absolute inset-0 bg-center bg-cover"
            style={{ backgroundImage: `url(${scrapbook.cover_image_url})` }}
          />
        ) : (
          <div className="absolute inset-0" style={{ background: gradient }} />
        )}
        {onOptionsPress && (
          <button
            onClick={(e) => { e.stopPropagation(); onOptionsPress() }}
            className="absolute top-2 left-2 w-8 h-8 rounded-full flex items-center justify-center active:opacity-70 z-10"
            style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }}
          >
            <MoreHorizontal size={15} strokeWidth={2} className="text-white" />
          </button>
        )}
        {isNew && (
          <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-amber text-walnut font-sans font-bold text-[10px] tracking-wider uppercase">
            New
          </div>
        )}
        <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-sans font-semibold text-white/90"
          style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }}>
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
  const [sharedScrapbooks, setSharedScrapbooks] = useState([]) // { id, seen, scrapbooks: {...} }
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [optionsId, setOptionsId] = useState(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [sharedOptionsShareId, setSharedOptionsShareId] = useState(null)
  const [renameId, setRenameId] = useState(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [showVersion, setShowVersion] = useState(false) // Version popup
  const [displayName, setDisplayName] = useState(null)
   
   const greetings = [
     "Hello",
     "Hey there",
     "Good day",
     "Top o' the mornin'",
     "Welcome back",
     "Howdy",
     "G'day",
     "Greetings",
   ]
   const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)]
  const searchInputRef = useRef(null)
  const coverChangeInputRef = useRef(null)

useEffect(() => {
     if (!session) return
     supabase
       .from('profiles')
       .select('display_name')
       .eq('user_id', session.user.id)
       .single()
       .then(({ data }) => {
         if (data) setDisplayName(data.display_name)
       })
   }, [session])
  
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

  useEffect(() => {
    if (!session) return
    supabase
      .from('scrapbook_shares')
      .select('id, seen, scrapbooks(*, clips(id, video_url, duration, trim_in, trim_out, recorded_at))')
      .eq('shared_with_id', session.user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setSharedScrapbooks(data)
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
  const [sharedCollapsed, setSharedCollapsed] = useState(false)

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
  const sharedOptionsShare = sharedScrapbooks.find(s => s.id === sharedOptionsShareId)
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
      .upload(coverPath, file, { cacheControl: '0', upsert: true })
    if (!error) {
      const { data: { publicUrl } } = supabase.storage
        .from('cassette-media')
        .getPublicUrl(coverPath)
      const bustUrl = `${publicUrl}?v=${Date.now()}`
      await supabase.from('scrapbooks').update({ cover_image_url: bustUrl }).eq('id', sbId)
      setScrapbooks(prev => prev.map(sb =>
        sb.id === sbId ? { ...sb, cover_image_url: bustUrl } : sb
      ))
    }
  }

  async function handleSharedCardTap(share) {
    if (!share.seen) {
      setSharedScrapbooks(prev => prev.map(s => s.id === share.id ? { ...s, seen: true } : s))
      supabase.from('scrapbook_shares').update({ seen: true }).eq('id', share.id).then(() => {})
    }
    navigate(`/scrapbook/${share.scrapbooks.id}`)
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

  async function removeFromLibrary(shareId) {
    setSharedScrapbooks(prev => prev.filter(s => s.id !== shareId))
    setSharedOptionsShareId(null)
    await supabase.from('scrapbook_shares').delete().eq('id', shareId)
  }

  async function handleRename() {
    const name = renameDraft.trim()
    if (!name || !renameId) return
    setScrapbooks(prev => prev.map(sb => sb.id === renameId ? { ...sb, name } : sb))
    setRenameId(null)
    await supabase.from('scrapbooks').update({ name }).eq('id', renameId)
  }

  return (
    <div className="flex flex-col h-screen bg-walnut">

      {/* Nav - Compressed header */}
      <header className="flex items-center justify-between px-6 pt-12 pb-2 flex-shrink-0">
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
            onClick={() => navigate('/settings')}
            className="w-10 h-10 flex items-center justify-center rounded-full active:opacity-70"
          >
            <Settings size={18} strokeWidth={2} className="text-wheat/50" />
          </button>
          <button
            onClick={() => navigate('/discover')}
            className="w-10 h-10 flex items-center justify-center rounded-full active:opacity-70"
          >
            <Shuffle size={18} strokeWidth={2} className="text-wheat/50" />
          </button>

          <button
            onClick={() => showSearch ? closeSearch() : setShowSearch(true)}
            className="w-10 h-10 flex items-center justify-center rounded-full active:opacity-70"
            style={{ background: showSearch ? 'rgba(242,162,74,0.15)' : 'transparent' }}
          >
            {showSearch ? (
              <X size={18} strokeWidth={2.5} className="text-amber" />
            ) : (
              <Search size={18} strokeWidth={2} className="text-wheat/50" />
            )}
          </button>
        </div>
      </header>

{/* Whimsical greeting */}
   {displayName && !showSearch && (
     <div className="px-6 pt-2 pb-1">
       <p className="font-display italic text-wheat/60 text-[15px]">
         {randomGreeting}, {displayName}
       </p>
     </div>
   )}
      
      {/* Search input */}
      {showSearch && (
        <div className="px-6 pb-4 flex-shrink-0">
          <input
            ref={searchInputRef}
            type="search"
            placeholder="Search scrapbooks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-walnut-mid border border-walnut-light rounded-2xl px-4 py-3 text-wheat text-[15px] font-sans placeholder:text-rust focus:outline-none focus:border-amber"
          />
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 overflow-y-auto px-6 pb-20">
        {loading ? (
          <div className="flex items-center justify-center pt-20">
            <div className="w-8 h-8 rounded-full border-2 border-amber border-t-transparent animate-spin" />
          </div>
        ) : filteredScrapbooks.length === 0 && sharedScrapbooks.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center pt-20 px-8">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mb-6"
              style={{ background: 'rgba(242,162,74,0.1)' }}>
              <Play size={24} strokeWidth={2} className="text-amber ml-1" />
            </div>
            <p className="text-wheat font-display font-semibold text-xl mb-2">No scrapbooks yet</p>
            <p className="text-rust text-sm leading-relaxed mb-8">
              Create your first scrapbook to get started.
            </p>
            <button
              onClick={() => navigate('/intake')}
              className="px-6 py-3 bg-amber text-walnut font-sans font-bold text-[15px] rounded-2xl active:opacity-80 flex items-center gap-2"
            >
              <Plus size={18} strokeWidth={2.5} />
              New Scrapbook
            </button>
          </div>
        ) : (
          <div className="space-y-8 pt-4">
            {/* Shared with you section */}
            {sharedScrapbooks.length > 0 && (
              <div>
                <button
                  onClick={() => setSharedCollapsed(!sharedCollapsed)}
                  className="flex items-center justify-between w-full mb-3 active:opacity-70"
                >
                  <div className="flex items-center gap-2">
                    <h2 className="text-rust font-sans font-semibold text-[13px] tracking-wide uppercase">
                      Shared with you
                    </h2>
                    <ChevronDown
                      size={16}
                      strokeWidth={2}
                      className={`text-rust transition-transform ${sharedCollapsed ? '-rotate-90' : ''}`}
                    />
                  </div>
                </button>
                {!sharedCollapsed && (
                  <div className="grid gap-4">
                    {sharedScrapbooks.map((share) => (
                      <ScrapbookCard
                        key={share.id}
                        scrapbook={share.scrapbooks}
                        onClick={() => handleSharedCardTap(share)}
                        onOptionsPress={() => setSharedOptionsShareId(share.id)}
                        readOnly={true}
                        isNew={!share.seen}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Year groups */}
            {years.map((year) => {
              const yearScrapbooks = groupedByYear[year]
              const isCollapsed = collapsedYears.has(year)
              return (
                <div key={year}>
                  <button
                    onClick={() => toggleYear(year)}
                    className="flex items-center gap-2 mb-3 active:opacity-70"
                  >
                    <h2 className="text-rust font-sans font-semibold text-[13px] tracking-wide uppercase">
                      {year}
                    </h2>
                    <ChevronDown
                      size={16}
                      strokeWidth={2}
                      className={`text-rust transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                    />
                  </button>
                  {!isCollapsed && (
                    <div className="grid gap-4">
                      {yearScrapbooks.map((sb) => (
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
              )
            })}
          </div>
        )}
      </main>

      {/* FAB */}
      <button
        onClick={() => navigate('/intake')}
        className="absolute bottom-8 right-6 w-14 h-14 rounded-full bg-amber flex items-center justify-center active:scale-95 transition-transform shadow-lg"
      >
        <Plus size={24} strokeWidth={2.5} className="text-walnut" />
      </button>

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
                  {optionsScrapbook?.cover_image_url ? 'Change Cover' : 'Add Cover Photo'}
                </p>
                <p className="text-rust text-[11px]">Choose from your photos</p>
              </div>
            </button>

            {/* Rename */}
            <button
              onClick={() => { setOptionsId(null); setRenameDraft(optionsScrapbook?.name || ''); setRenameId(optionsId) }}
              className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl mb-2 active:opacity-75"
              style={{ background: '#2C1A0E' }}
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(242,162,74,0.1)' }}>
                <Pencil size={16} strokeWidth={1.75} className="text-amber" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-wheat text-[14px] font-semibold leading-none mb-0.5">Rename</p>
                <p className="text-rust text-[11px]">Change the scrapbook name</p>
              </div>
            </button>

            {/* Delete */}
            <button
              onClick={() => {
                setOptionsId(null)
                setConfirmDeleteId(optionsId)
              }}
              className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl mb-4 active:opacity-75"
              style={{ background: '#2C1A0E' }}
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(232,133,90,0.1)' }}>
                <X size={16} strokeWidth={2} className="text-sienna" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sienna text-[14px] font-semibold leading-none mb-0.5">Delete Scrapbook</p>
                <p className="text-rust text-[11px]">This can't be undone</p>
              </div>
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

      {/* Rename sheet */}
      {renameId && (
        <>
          <div
            className="absolute inset-0 bg-black/50 z-10"
            onClick={() => setRenameId(null)}
          />
          <div
            className="absolute bottom-0 left-0 right-0 z-20 rounded-t-3xl border-t border-walnut-light px-5 pb-10 pt-1"
            style={{ background: '#3D2410' }}
          >
            <div className="w-10 h-1 rounded-full bg-walnut-light mx-auto mt-3 mb-5" />
            <p className="font-display font-semibold text-lg text-wheat mb-4 px-1">Rename Scrapbook</p>
            <input
              type="text"
              value={renameDraft}
              onChange={e => setRenameDraft(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleRename()}
              autoFocus
              maxLength={60}
              className="w-full px-4 py-3.5 rounded-2xl text-wheat text-[15px] font-sans outline-none mb-3"
              style={{ background: '#2C1A0E', border: '1px solid #4A2E18' }}
            />
            <button
              onClick={handleRename}
              disabled={!renameDraft.trim()}
              className="w-full py-3.5 rounded-2xl font-sans font-bold text-[15px] mb-2 active:opacity-80 disabled:opacity-30"
              style={{ background: '#F2A24A', color: '#2C1A0E' }}
            >
              Save
            </button>
            <button
              onClick={() => setRenameId(null)}
              className="w-full py-3 text-center text-rust font-semibold text-[15px] active:opacity-70"
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {/* Shared scrapbook options sheet */}
      {sharedOptionsShareId && (
        <>
          <div
            className="absolute inset-0 bg-black/50 z-10"
            onClick={() => setSharedOptionsShareId(null)}
          />
          <div
            className="absolute bottom-0 left-0 right-0 z-20 rounded-t-3xl border-t border-walnut-light px-5 pb-10 pt-1"
            style={{ background: '#3D2410' }}
          >
            <div className="w-10 h-1 rounded-full bg-walnut-light mx-auto mt-3 mb-5" />
            <p className="font-display font-semibold text-lg text-wheat mb-5 px-1">
              {sharedOptionsShare?.scrapbooks?.name}
            </p>

            {/* Remove from library */}
            <button
              onClick={() => removeFromLibrary(sharedOptionsShareId)}
              className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl mb-4 active:opacity-75"
              style={{ background: '#2C1A0E' }}
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(232,133,90,0.1)' }}>
                <X size={16} strokeWidth={2} className="text-sienna" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sienna text-[14px] font-semibold leading-none mb-0.5">Remove from Library</p>
                <p className="text-rust text-[11px]">You'll no longer have access to this scrapbook</p>
              </div>
            </button>

            <button
              onClick={() => setSharedOptionsShareId(null)}
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
