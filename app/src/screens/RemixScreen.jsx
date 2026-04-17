import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ChevronDown, Check, X, Shuffle, Bookmark } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { preloadClip, preloadClips } from '../lib/blobCache'

const CLIP_SELECT = 'id, video_url, thumbnail_url, duration, trim_in, trim_out, cut_in, cut_out, caption_text, caption_x, caption_y, caption_size'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// ── Cassette reel animation ─────────────────────────────────────────────────
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

// ── Multi-select dropdown ───────────────────────────────────────────────────
function MultiSelectDropdown({ allLabel, options, selected, onToggle, onClearAll }) {
  const [open, setOpen] = useState(false)

  let displayLabel
  if (selected.length === 0) {
    displayLabel = allLabel
  } else if (selected.length <= 3) {
    displayLabel = selected
      .map(v => options.find(o => o.value === v)?.label)
      .filter(Boolean)
      .join(', ')
  } else {
    displayLabel = `${selected.length} selected`
  }

  const isAll = selected.length === 0

  return (
    <div className="relative mb-3">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between rounded-xl px-4 py-3.5 border active:opacity-80"
        style={{ background: '#3D2410', borderColor: open ? 'rgba(242,162,74,0.4)' : '#4A2E18' }}
      >
        <span className="font-display font-semibold text-[17px] text-wheat">{displayLabel}</span>
        <ChevronDown
          size={18}
          strokeWidth={1.75}
          className="text-amber flex-shrink-0"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
        />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div
            className="absolute left-0 right-0 top-full mt-1 rounded-xl border border-walnut-light z-30 overflow-y-auto"
            style={{ background: '#2C1A0E', maxHeight: 240 }}
          >
            {/* All / clear option */}
            <button
              onClick={() => { onClearAll(); setOpen(false) }}
              className="w-full flex items-center gap-3 px-4 py-3 border-b active:opacity-70"
              style={{ borderColor: '#3D2410', background: isAll ? 'rgba(242,162,74,0.10)' : 'transparent' }}
            >
              <div
                className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center"
                style={{
                  background: isAll ? '#F2A24A' : 'transparent',
                  border: isAll ? '1.5px solid #F2A24A' : '1.5px solid #4A2E18',
                }}
              >
                {isAll && <Check size={11} strokeWidth={2.5} className="text-walnut" />}
              </div>
              <span
                className="font-display font-semibold text-[15px]"
                style={{ color: isAll ? '#F2A24A' : '#F5DEB3' }}
              >
                {allLabel}
              </span>
            </button>

            {options.map(opt => {
              const isSel = selected.includes(opt.value)
              return (
                <button
                  key={String(opt.value)}
                  onClick={() => onToggle(opt.value)}
                  className="w-full flex items-center gap-3 px-4 py-3 border-b active:opacity-70"
                  style={{ borderColor: '#3D2410', background: isSel ? 'rgba(242,162,74,0.08)' : 'transparent' }}
                >
                  <div
                    className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center"
                    style={{
                      background: isSel ? '#F2A24A' : 'transparent',
                      border: isSel ? '1.5px solid #F2A24A' : '1.5px solid #4A2E18',
                    }}
                  >
                    {isSel && <Check size={11} strokeWidth={2.5} className="text-walnut" />}
                  </div>
                  <span
                    className="font-display font-semibold text-[15px]"
                    style={{ color: isSel ? '#F2A24A' : '#F5DEB3' }}
                  >
                    {opt.label}
                  </span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ── Coming soon modal ───────────────────────────────────────────────────────
function ComingSoonModal({ onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(26,15,8,0.88)' }}
      onClick={onClose}
    >
      <div
        className="mx-8 rounded-2xl border border-walnut-light px-8 py-10 text-center"
        style={{ background: '#3D2410' }}
        onClick={e => e.stopPropagation()}
      >
        <p className="font-display italic text-amber text-3xl tracking-tight mb-3">Coming soon</p>
        <p className="text-rust text-sm leading-relaxed mb-6">This feature is on its way.</p>
        <button
          onClick={onClose}
          className="px-8 py-3 rounded-xl font-sans font-bold text-[14px] text-walnut active:opacity-80"
          style={{ background: '#F2A24A' }}
        >
          Got it
        </button>
      </div>
    </div>
  )
}

// ── Main screen ─────────────────────────────────────────────────────────────
export default function FilmFestScreen() {
  const navigate = useNavigate()
  const { session } = useAuth()

  const [availableYears, setAvailableYears] = useState([])
  const [selectedYears, setSelectedYears] = useState([])   // empty = all
  const [selectedMonths, setSelectedMonths] = useState([]) // empty = all
  const [phase, setPhase] = useState('studio')             // 'studio' | 'select' | 'loading' | 'loading-surprise'
  const [errorMsg, setErrorMsg] = useState(null)
  const [comingSoon, setComingSoon] = useState(false)
  const [scrapbooksToSelect, setScrapbooksToSelect] = useState([])
  const [checkedIds, setCheckedIds] = useState(new Set())
  const [savedConfigs, setSavedConfigs] = useState([])
  const [showSavesSheet, setShowSavesSheet] = useState(false)
  const [saveNameInput, setSaveNameInput] = useState('')
  const [showSaveInput, setShowSaveInput] = useState(false)
  const [showCombineSheet, setShowCombineSheet] = useState(false)
  const [combineNameInput, setCombineNameInput] = useState('')
  const [combineWorking, setCombineWorking] = useState(false)
  const [combineError, setCombineError] = useState(null)
  const cancelledRef = useRef(false)
  const loadingSourceRef = useRef('studio') // tracks which phase to return to on cancel

  // Fetch available years + prewarm blob cache in parallel on mount
  useEffect(() => {
    async function fetchYears() {
      const { data } = await supabase
        .from('scrapbooks')
        .select('year')
        .eq('user_id', session.user.id)
      const years = [...new Set((data || []).map(s => s.year).filter(Boolean))].sort((a, b) => b - a)
      setAvailableYears(years.length > 0 ? years : [new Date().getFullYear()])
    }

    async function prewarm() {
      const { data: books } = await supabase
        .from('scrapbooks')
        .select('clips(video_url, thumbnail_url)')
        .eq('user_id', session.user.id)
      const allClips = (books || []).flatMap(sb => sb.clips || []).filter(c => c.video_url)
      if (allClips.length === 0) return
      const shuffled = [...allClips].sort(() => Math.random() - 0.5)
      shuffled.slice(0, 5).forEach(c => {
        preloadClip(c.video_url)
        if (c.thumbnail_url) { const img = new Image(); img.src = c.thumbnail_url }
      })
    }

    async function fetchSavedConfigs() {
      const { data } = await supabase
        .from('film_fest_saves')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
      setSavedConfigs(data || [])
    }

    fetchYears()
    prewarm()
    fetchSavedConfigs()
  }, [session])

  function toggleYear(y) {
    setErrorMsg(null)
    setSelectedYears(prev => prev.includes(y) ? prev.filter(x => x !== y) : [...prev, y])
  }

  function toggleMonth(m) {
    setErrorMsg(null)
    setSelectedMonths(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])
  }

  function handleLoadConfig(config) {
    setSelectedYears(config.filter_config?.years || [])
    setSelectedMonths(config.filter_config?.months || [])
    setErrorMsg(null)
    setShowSavesSheet(false)
  }

  async function handleSaveConfig() {
    if (!saveNameInput.trim()) return
    const { data } = await supabase
      .from('film_fest_saves')
      .insert({
        user_id: session.user.id,
        name: saveNameInput.trim(),
        filter_config: { years: selectedYears, months: selectedMonths },
      })
      .select()
      .single()
    if (data) {
      setSavedConfigs(prev => [data, ...prev])
      setSaveNameInput('')
      setShowSaveInput(false)
    }
  }

  async function handleDeleteConfig(id) {
    await supabase.from('film_fest_saves').delete().eq('id', id)
    setSavedConfigs(prev => prev.filter(c => c.id !== id))
  }

  function openCombineSheet() {
    const checkedBooks = scrapbooksToSelect.filter(sb => checkedIds.has(sb.id))
    const years = [...new Set(checkedBooks.map(sb => sb.year).filter(Boolean))].sort((a, b) => a - b)
    const suggested = years.length === 0
      ? 'Mixtape'
      : years.length === 1
        ? `${years[0]} Mixtape`
        : `${years[0]}–${years[years.length - 1]} Mixtape`
    setCombineNameInput(suggested)
    setCombineError(null)
    setCombineWorking(false)
    setShowCombineSheet(true)
  }

  async function handleCombine() {
    if (!combineNameInput.trim() || combineWorking) return
    setCombineWorking(true)
    setCombineError(null)

    try {
      const checkedBooks = scrapbooksToSelect.filter(sb => checkedIds.has(sb.id))

      // Derive year/month for new scrapbook
      const years = [...new Set(checkedBooks.map(sb => sb.year).filter(Boolean))].sort((a, b) => a - b)
      const months = [...new Set(checkedBooks.map(sb => sb.month).filter(Boolean))]
      const newYear = years[0] ?? null
      // Only carry month if all checked scrapbooks share the same single year and month
      const newMonth = years.length === 1 && months.length === 1 ? months[0] : null
      const coverUrl = checkedBooks.find(sb => sb.cover_image_url)?.cover_image_url ?? null

      // Create new scrapbook
      const { data: newScrapbook, error: sbError } = await supabase
        .from('scrapbooks')
        .insert({
          user_id: session.user.id,
          name: combineNameInput.trim(),
          year: newYear,
          month: newMonth,
          cover_image_url: coverUrl,
        })
        .select()
        .single()

      if (sbError || !newScrapbook) throw new Error('Could not create scrapbook')

      // Fetch all clips from checked scrapbooks with full metadata
      const { data: sourceClips, error: clipFetchError } = await supabase
        .from('clips')
        .select('video_url, thumbnail_url, duration, trim_in, trim_out, cut_in, cut_out, caption_text, caption_x, caption_y, caption_size, recorded_at, media_type, order, scrapbook_id')
        .in('scrapbook_id', checkedBooks.map(sb => sb.id))

      if (clipFetchError) throw new Error('Could not load clips')

      // Sort: preserve the user's chosen scrapbook order from the select screen, then clip order within each
      const bookOrder = checkedBooks.map(sb => sb.id)
      const sorted = [...(sourceClips || [])].sort((a, b) => {
        const ai = bookOrder.indexOf(a.scrapbook_id)
        const bi = bookOrder.indexOf(b.scrapbook_id)
        if (ai !== bi) return ai - bi
        return (a.order ?? 0) - (b.order ?? 0)
      })

      const clipsWithVideo = sorted.filter(c => c.video_url)
      if (!clipsWithVideo.length) throw new Error('No clips found in selected scrapbooks')

      const clipRows = clipsWithVideo.map((clip, i) => ({
        scrapbook_id: newScrapbook.id,
        video_url: clip.video_url,
        thumbnail_url: clip.thumbnail_url,
        duration: clip.duration,
        trim_in: clip.trim_in,
        trim_out: clip.trim_out,
        cut_in: clip.cut_in,
        cut_out: clip.cut_out,
        caption_text: clip.caption_text,
        caption_x: clip.caption_x,
        caption_y: clip.caption_y,
        caption_size: clip.caption_size,
        recorded_at: clip.recorded_at,
        media_type: clip.media_type,
        order: i,
      }))

      const { error: insertError } = await supabase.from('clips').insert(clipRows)
      if (insertError) throw new Error('Could not save clips')

      navigate(`/scrapbook/${newScrapbook.id}`)
    } catch (e) {
      setCombineError(e.message || 'Something went wrong')
      setCombineWorking(false)
    }
  }

  // Watch button on studio — fetch matching scrapbooks and show select screen
  async function handleWatch() {
    setErrorMsg(null)

    let query = supabase
      .from('scrapbooks')
      .select(`id, name, year, month, cover_image_url, created_at, clips(${CLIP_SELECT})`)
      .eq('user_id', session.user.id)
      .order('year', { ascending: false })

    if (selectedYears.length > 0) query = query.in('year', selectedYears)
    if (selectedMonths.length > 0) query = query.in('month', selectedMonths)

    const { data: books } = await query
    const withClips = (books || []).filter(sb => (sb.clips || []).some(c => c.video_url))

    if (withClips.length === 0) {
      setErrorMsg('No clips found for those filters. Try a broader selection.')
      return
    }

    setScrapbooksToSelect(withClips)
    setCheckedIds(new Set(withClips.map(sb => sb.id)))
    setPhase('select')
  }

  // Watch button on select screen — preload and navigate to Discovery
  async function handleWatchSelected() {
    cancelledRef.current = false
    loadingSourceRef.current = 'select'
    setPhase('loading')

    try {
      const selectedBooks = scrapbooksToSelect.filter(sb => checkedIds.has(sb.id))
      const pool = []
      for (const sb of selectedBooks) {
        for (const clip of sb.clips || []) {
          if (clip.video_url) {
            pool.push({
              ...clip,
              scrapbook: { id: sb.id, name: sb.name, year: sb.year ?? new Date(sb.created_at).getFullYear() },
            })
          }
        }
      }

      if (pool.length === 0) { setPhase('select'); return }

      pool.forEach(c => { if (c.thumbnail_url) { const img = new Image(); img.src = c.thumbnail_url } })
      const minDelay = new Promise(r => setTimeout(r, 2000))
      const firstReady = preloadClips(pool, Math.min(3, pool.length))
      pool.slice(3).forEach(c => preloadClip(c.video_url))
      await Promise.all([minDelay, firstReady])

      if (cancelledRef.current) return
      navigate('/discover', { state: { clips: pool, isRemix: true, screenTitle: 'Film Fest' } })
    } catch {
      setPhase('select')
    }
  }

  async function handleSurpriseMe() {
    cancelledRef.current = false
    loadingSourceRef.current = 'studio'
    setPhase('loading-surprise')
    setErrorMsg(null)

    try {
      // Read setting + own clips in parallel
      const [{ data: profile }, { data: ownBooks }] = await Promise.all([
        supabase.from('profiles').select('surprise_me_include_shared').eq('user_id', session.user.id).single(),
        supabase.from('scrapbooks').select(`id, name, year, created_at, clips(${CLIP_SELECT})`).eq('user_id', session.user.id),
      ])

      const includeShared = profile?.surprise_me_include_shared ?? false

      const pool = []

      for (const sb of ownBooks || []) {
        for (const clip of sb.clips || []) {
          if (clip.video_url) pool.push({ ...clip, scrapbook: { id: sb.id, name: sb.name, year: sb.year ?? new Date(sb.created_at).getFullYear() } })
        }
      }

      if (includeShared) {
        const { data: sharedRows } = await supabase
          .from('scrapbook_shares')
          .select(`scrapbooks(id, name, year, created_at, clips(${CLIP_SELECT}))`)
          .eq('shared_with_id', session.user.id)

        for (const row of sharedRows || []) {
          const sb = row.scrapbooks
          if (!sb) continue
          for (const clip of sb.clips || []) {
            if (clip.video_url) pool.push({ ...clip, scrapbook: { id: sb.id, name: sb.name, year: sb.year ?? new Date(sb.created_at).getFullYear() } })
          }
        }
      }

      if (pool.length === 0) {
        setPhase('studio')
        setErrorMsg('No clips found. Add some videos to get started.')
        return
      }

      // Shuffle and pick 10–15
      const shuffled = [...pool].sort(() => Math.random() - 0.5)
      const pickCount = Math.min(pool.length, Math.floor(Math.random() * 6) + 10)
      const selected = shuffled.slice(0, pickCount)

      // Preload thumbnails
      selected.forEach(c => { if (c.thumbnail_url) { const img = new Image(); img.src = c.thumbnail_url } })

      const minDelay = new Promise(r => setTimeout(r, 2000))
      const firstReady = preloadClips(selected, Math.min(3, selected.length))
      selected.slice(3).forEach(c => preloadClip(c.video_url))
      await Promise.all([minDelay, firstReady])

      if (cancelledRef.current) return
      navigate('/discover', { state: { clips: selected, isRemix: true, screenTitle: 'Surprise Me' } })
    } catch {
      setPhase('studio')
      setErrorMsg('Something went wrong. Try again.')
    }
  }

  // ── Loading screen ──────────────────────────────────────────────────────────
  if (phase === 'loading' || phase === 'loading-surprise') {
    const isSurprise = phase === 'loading-surprise'
    return (
      <div
        className="relative flex flex-col items-center justify-center bg-walnut gap-10 px-8 text-center"
        style={{ height: '100dvh' }}
      >
        <button
          onClick={() => { cancelledRef.current = true; setPhase(loadingSourceRef.current) }}
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
            {isSurprise ? 'Rolling the dice…' : 'Preparing your film…'}
          </p>
          <p className="text-rust text-sm leading-relaxed">
            {isSurprise ? 'Picking a mix just for you' : 'Loading clips for your Film Fest'}
          </p>
        </div>
      </div>
    )
  }

  // ── Select screen ────────────────────────────────────────────────────────────
  if (phase === 'select') {
    const allChecked = checkedIds.size === scrapbooksToSelect.length
    const noneChecked = checkedIds.size === 0
    const checkedCount = checkedIds.size
    const totalClipCount = scrapbooksToSelect.filter(sb => checkedIds.has(sb.id)).reduce((n, sb) => n + (sb.clips || []).filter(c => c.video_url).length, 0)

    return (
      <div className="flex flex-col bg-walnut" style={{ height: '100dvh' }}>

        {/* Combine sheet */}
        {showCombineSheet && (
          <div className="fixed inset-0 z-40 flex flex-col justify-end">
            <div
              className="absolute inset-0"
              style={{ background: 'rgba(26,15,8,0.8)' }}
              onClick={() => !combineWorking && setShowCombineSheet(false)}
            />
            <div
              className="relative flex flex-col rounded-t-3xl px-5 pt-6 pb-10"
              style={{ background: '#2C1A0E' }}
            >
              {/* Sheet header */}
              <div className="flex items-center justify-between mb-6 flex-shrink-0">
                <p className="font-display font-semibold text-[19px] text-wheat">Save as New Scrapbook</p>
                <button
                  onClick={() => !combineWorking && setShowCombineSheet(false)}
                  className="w-8 h-8 flex items-center justify-center active:opacity-60"
                >
                  <X size={18} strokeWidth={2} className="text-wheat/50" />
                </button>
              </div>

              {/* Name input */}
              <p className="text-rust text-[10px] font-bold tracking-[0.18em] uppercase mb-2">Name</p>
              <input
                type="text"
                value={combineNameInput}
                onChange={e => setCombineNameInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCombine()}
                placeholder="Give it a name…"
                autoFocus
                className="w-full rounded-xl px-4 py-3.5 font-display font-semibold text-[17px] text-wheat outline-none placeholder:text-rust mb-5"
                style={{ background: '#3D2410', border: '1px solid rgba(242,162,74,0.35)' }}
              />

              {/* Summary */}
              <div className="rounded-xl px-4 py-3.5 mb-2" style={{ background: '#3D2410' }}>
                <p className="font-sans text-[14px] text-wheat/80 leading-relaxed">
                  <span className="text-amber font-semibold">{totalClipCount} clip{totalClipCount !== 1 ? 's' : ''}</span>
                  {' '}from{' '}
                  <span className="text-amber font-semibold">{checkedCount} scrapbook{checkedCount !== 1 ? 's' : ''}</span>
                </p>
                <p className="font-sans text-[12px] text-rust mt-1 leading-relaxed">
                  Clips are linked, not copied. Original scrapbooks are unchanged.
                </p>
              </div>

              {combineError && (
                <p className="text-sienna text-[13px] mb-3 leading-relaxed">{combineError}</p>
              )}

              {/* Create button */}
              <button
                onClick={handleCombine}
                disabled={!combineNameInput.trim() || combineWorking}
                className="w-full py-4 rounded-2xl font-sans font-bold text-[16px] text-walnut active:opacity-80 disabled:opacity-30 mt-3"
                style={{ background: '#F2A24A' }}
              >
                {combineWorking ? 'Creating…' : 'Create Scrapbook'}
              </button>
            </div>
          </div>
        )}
        {/* Nav */}
        <header className="flex items-center justify-between px-5 pt-14 pb-4 flex-shrink-0">
          <button
            onClick={() => setPhase('studio')}
            className="flex items-center gap-1.5 text-wheat/45 font-sans text-[15px] font-semibold active:opacity-60"
          >
            <ArrowLeft size={18} strokeWidth={2} />
            Filters
          </button>
          <p className="font-display font-semibold text-[17px] text-wheat">Your Film Fest</p>
          <button
            onClick={() => setCheckedIds(allChecked ? new Set() : new Set(scrapbooksToSelect.map(sb => sb.id)))}
            className="font-sans font-semibold text-[13px] text-amber active:opacity-70"
          >
            {allChecked ? 'Deselect all' : 'Select all'}
          </button>
        </header>

        {/* Filter summary pills */}
        {(selectedYears.length > 0 || selectedMonths.length > 0) && (
          <div className="px-5 pb-3 flex-shrink-0 flex gap-2 flex-wrap">
            {selectedYears.length > 0 && (
              <div className="rounded-full px-3 py-1" style={{ background: 'rgba(242,162,74,0.12)', border: '1px solid rgba(242,162,74,0.25)' }}>
                <span className="text-amber font-sans text-[12px] font-semibold">{selectedYears.join(', ')}</span>
              </div>
            )}
            {selectedMonths.length > 0 && (
              <div className="rounded-full px-3 py-1" style={{ background: 'rgba(242,162,74,0.12)', border: '1px solid rgba(242,162,74,0.25)' }}>
                <span className="text-amber font-sans text-[12px] font-semibold">
                  {selectedMonths.map(m => MONTH_NAMES[m - 1].slice(0, 3)).join(', ')}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Scrapbook list */}
        <div className="flex-1 overflow-y-auto px-5 pb-4">
          <div className="space-y-2">
            {scrapbooksToSelect.map(sb => {
              const isChecked = checkedIds.has(sb.id)
              const clipCount = (sb.clips || []).length
              const dateLabel = [
                sb.year,
                sb.month ? MONTH_NAMES[sb.month - 1] : null,
              ].filter(Boolean).join(' · ')

              return (
                <button
                  key={sb.id}
                  onClick={() => setCheckedIds(prev => {
                    const n = new Set(prev)
                    n.has(sb.id) ? n.delete(sb.id) : n.add(sb.id)
                    return n
                  })}
                  className="w-full flex items-center gap-3.5 p-3 rounded-2xl active:opacity-75"
                  style={{
                    background: isChecked ? 'rgba(242,162,74,0.08)' : '#3D2410',
                    border: `1px solid ${isChecked ? 'rgba(242,162,74,0.3)' : '#4A2E18'}`,
                  }}
                >
                  {/* Cover thumb */}
                  <div className="w-[52px] h-[52px] rounded-xl overflow-hidden flex-shrink-0" style={{ background: '#2C1A0E' }}>
                    {sb.cover_image_url
                      ? <img src={sb.cover_image_url} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full" style={{ background: 'linear-gradient(135deg, #4A2010 0%, #2C1A0E 100%)' }} />
                    }
                  </div>

                  {/* Info */}
                  <div className="flex-1 text-left min-w-0">
                    <p className="font-display font-semibold text-[16px] text-wheat truncate leading-snug">{sb.name}</p>
                    <p className="text-rust text-[11px] mt-0.5">
                      {dateLabel}{dateLabel ? ' · ' : ''}{clipCount} clip{clipCount !== 1 ? 's' : ''}
                    </p>
                  </div>

                  {/* Checkbox */}
                  <div
                    className="flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center"
                    style={{
                      background: isChecked ? '#F2A24A' : 'transparent',
                      border: `1.5px solid ${isChecked ? '#F2A24A' : '#4A2E18'}`,
                    }}
                  >
                    {isChecked && <Check size={13} strokeWidth={2.5} className="text-walnut" />}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex-shrink-0 flex gap-3 px-5 pb-10 pt-3">
          <button
            onClick={handleWatchSelected}
            disabled={noneChecked}
            className="flex-1 py-4 rounded-2xl font-sans font-bold text-[16px] text-walnut active:opacity-80 disabled:opacity-30"
            style={{ background: '#F2A24A' }}
          >
            Watch{checkedIds.size > 0 ? ` · ${checkedIds.size}` : ''}
          </button>
          <button
            onClick={openCombineSheet}
            disabled={noneChecked}
            className="flex-1 py-4 rounded-2xl font-sans font-bold text-[15px] border active:opacity-80 disabled:opacity-30"
            style={{ borderColor: '#4A2E18', color: '#F5DEB3' }}
          >
            Save as Scrapbook
          </button>
        </div>
      </div>
    )
  }

  // ── Studio / filter screen ──────────────────────────────────────────────────
  return (
    <div className="flex flex-col bg-walnut" style={{ height: '100dvh' }}>

      {comingSoon && <ComingSoonModal onClose={() => setComingSoon(false)} />}

      {/* Saved filters sheet */}
      {showSavesSheet && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end">
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(26,15,8,0.75)' }}
            onClick={() => setShowSavesSheet(false)}
          />
          <div
            className="relative flex flex-col rounded-t-3xl px-5 pt-6 pb-10"
            style={{ background: '#2C1A0E', maxHeight: '75dvh' }}
          >
            {/* Sheet header */}
            <div className="flex items-center justify-between mb-5 flex-shrink-0">
              <p className="font-display font-semibold text-[19px] text-wheat">Saved Filters</p>
              <button
                onClick={() => setShowSavesSheet(false)}
                className="w-8 h-8 flex items-center justify-center active:opacity-60"
              >
                <X size={18} strokeWidth={2} className="text-wheat/50" />
              </button>
            </div>

            {/* Saves list */}
            <div className="flex-1 overflow-y-auto space-y-2 mb-4">
              {savedConfigs.length === 0 && !showSaveInput && (
                <p className="text-rust text-sm text-center py-8 leading-relaxed">
                  No saved filters yet.{'\n'}Set some filters and save them here.
                </p>
              )}
              {savedConfigs.map(cfg => {
                const { years = [], months = [] } = cfg.filter_config || {}
                const yearLabel = years.length > 0 ? years.join(', ') : 'All Years'
                const monthLabel = months.length > 0
                  ? months.map(m => MONTH_NAMES[m - 1].slice(0, 3)).join(', ')
                  : 'All Months'
                return (
                  <button
                    key={cfg.id}
                    onClick={() => handleLoadConfig(cfg)}
                    className="w-full flex items-center gap-3 p-4 rounded-2xl text-left active:opacity-75"
                    style={{ background: '#3D2410', border: '1px solid #4A2E18' }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-display font-semibold text-[16px] text-wheat truncate">{cfg.name}</p>
                      <p className="text-rust text-[12px] mt-0.5">{yearLabel} · {monthLabel}</p>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); handleDeleteConfig(cfg.id) }}
                      className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full active:opacity-60"
                      style={{ background: 'rgba(74,46,24,0.8)' }}
                    >
                      <X size={14} strokeWidth={2} className="text-wheat/50" />
                    </button>
                  </button>
                )
              })}
            </div>

            {/* Save input area */}
            {showSaveInput ? (
              <div className="flex-shrink-0 flex gap-2 items-center">
                <input
                  type="text"
                  value={saveNameInput}
                  onChange={e => setSaveNameInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSaveConfig()}
                  placeholder="Name this filter…"
                  autoFocus
                  className="flex-1 rounded-xl px-4 py-3 font-sans text-[15px] text-wheat outline-none placeholder:text-rust"
                  style={{ background: '#3D2410', border: '1px solid rgba(242,162,74,0.4)' }}
                />
                <button
                  onClick={handleSaveConfig}
                  disabled={!saveNameInput.trim()}
                  className="flex-shrink-0 px-4 py-3 rounded-xl font-sans font-bold text-[14px] text-walnut active:opacity-80 disabled:opacity-30"
                  style={{ background: '#F2A24A' }}
                >
                  Save
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowSaveInput(true)}
                className="flex-shrink-0 w-full py-3.5 rounded-2xl font-sans font-semibold text-[15px] border active:opacity-75"
                style={{ borderColor: 'rgba(242,162,74,0.3)', color: '#F2A24A', background: 'rgba(242,162,74,0.06)' }}
              >
                + Save current filters
              </button>
            )}
          </div>
        </div>
      )}

      {/* Nav */}
      <header className="flex items-center justify-between px-5 pt-14 pb-2 flex-shrink-0">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 text-wheat/45 font-sans text-[15px] font-semibold active:opacity-60"
        >
          <ArrowLeft size={18} strokeWidth={2} />
          Library
        </button>
        <button
          onClick={() => { setShowSaveInput(false); setShowSavesSheet(true) }}
          className="w-10 h-10 flex items-center justify-center rounded-full active:opacity-60"
        >
          <Bookmark
            size={20}
            strokeWidth={1.75}
            className={savedConfigs.length > 0 ? 'text-amber' : 'text-wheat/35'}
            fill={savedConfigs.length > 0 ? 'rgba(242,162,74,0.25)' : 'none'}
          />
        </button>
        <button
          onClick={handleSurpriseMe}
          className="flex items-center gap-1.5 border rounded-full px-3.5 py-1.5 active:opacity-70"
          style={{ borderColor: 'rgba(242,162,74,0.35)', background: 'rgba(242,162,74,0.06)' }}
        >
          <Shuffle size={13} strokeWidth={1.75} className="text-amber" />
          <span className="font-sans font-semibold text-[13px] text-amber">Surprise Me</span>
        </button>
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col px-6 pt-10 pb-4 overflow-y-auto">

        {/* Title block */}
        <div className="mb-10">
          <p
            className="font-display italic text-amber"
            style={{ fontSize: 52, lineHeight: 1.05, letterSpacing: '-0.02em' }}
          >
            Film Fest
          </p>
          <p className="text-rust/80 text-sm mt-2">Watch clips across your whole library</p>
        </div>

        {/* Filter section */}
        <p className="text-rust text-[10px] font-bold tracking-[0.18em] uppercase mb-4">
          Filter your film
        </p>

        <MultiSelectDropdown
          allLabel="All Years"
          options={availableYears.map(y => ({ value: y, label: String(y) }))}
          selected={selectedYears}
          onToggle={toggleYear}
          onClearAll={() => { setSelectedYears([]); setErrorMsg(null) }}
        />

        <MultiSelectDropdown
          allLabel="All Months"
          options={MONTH_NAMES.map((name, i) => ({ value: i + 1, label: name }))}
          selected={selectedMonths}
          onToggle={toggleMonth}
          onClearAll={() => { setSelectedMonths([]); setErrorMsg(null) }}
        />

        {errorMsg && (
          <p className="text-sienna text-sm leading-relaxed mt-3">{errorMsg}</p>
        )}
      </div>

      {/* Bottom action bar */}
      <div className="flex-shrink-0 flex gap-3 px-5 pb-10 pt-3">
        <button
          onClick={handleWatch}
          className="flex-1 py-4 rounded-2xl font-sans font-bold text-[16px] text-walnut active:opacity-80"
          style={{ background: '#F2A24A' }}
        >
          Watch
        </button>
        <button
          onClick={() => setComingSoon(true)}
          className="flex-1 py-4 rounded-2xl font-sans font-bold text-[16px] border active:opacity-80"
          style={{ borderColor: '#4A2E18', color: '#F5DEB3' }}
        >
          Download
        </button>
      </div>
    </div>
  )
}
