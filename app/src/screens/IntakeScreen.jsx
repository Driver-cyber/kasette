import { useState, useRef, useMemo, useEffect, useCallback } from 'react'
import { ArrowLeft, Check, Image, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// ── Helpers ────────────────────────────────────────────────────────────────

function getVideoMeta(file) {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    const canvas = document.createElement('canvas')
    const url = URL.createObjectURL(file)
    let duration = 0
    let settled = false

    function finish(thumbnail) {
      if (settled) return
      settled = true
      URL.revokeObjectURL(url)
      resolve({ duration, thumbnail })
    }

    const timeout = setTimeout(() => finish(null), 8000)

    video.onloadedmetadata = () => {
      duration = isFinite(video.duration) ? video.duration : 0
      video.currentTime = Math.min(0.5, duration * 0.1)
    }

    video.onseeked = () => {
      clearTimeout(timeout)
      try {
        const w = Math.min(video.videoWidth || 320, 400)
        const h = Math.round(w * ((video.videoHeight || 568) / (video.videoWidth || 320)))
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d').drawImage(video, 0, 0, w, h)
        finish(canvas.toDataURL('image/jpeg', 0.65))
      } catch {
        finish(null)
      }
    }

    video.onerror = () => {
      clearTimeout(timeout)
      finish(null)
    }

    video.src = url
    video.load()
  })
}

function formatDuration(secs) {
  if (!secs || isNaN(secs)) return '–'
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatTotalDuration(secs) {
  const m = Math.round(secs / 60)
  if (m < 1) return '<1 min'
  return `~${m} min`
}

function formatDateGroup(date) {
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function formatSummaryRange(items) {
  const sel = items.filter(i => i.selected)
  if (!sel.length) return ''
  const timestamps = sel.map(i => i.date.getTime())
  const min = new Date(Math.min(...timestamps))
  const max = new Date(Math.max(...timestamps))
  const opts = { month: 'short', day: 'numeric' }
  if (min.toDateString() === max.toDateString()) {
    return min.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }
  if (min.getFullYear() === max.getFullYear()) {
    return `${min.toLocaleDateString('en-US', opts)}–${max.toLocaleDateString('en-US', opts)}, ${max.getFullYear()}`
  }
  return `${min.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}–${max.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`
}

// ── Main component ─────────────────────────────────────────────────────────

export default function IntakeScreen() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const fileInputRef = useRef(null)

  const [items, setItems] = useState([])        // { id, file, duration, thumbnail, selected, date }
  const [step, setStep] = useState('pick')      // 'pick' | 'name'
  const [name, setName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 })
  const [error, setError] = useState(null)
  const [year, setYear] = useState(new Date().getFullYear())
  const [coverFile, setCoverFile] = useState(null)
  const [coverPreview, setCoverPreview] = useState(null)
  const nameInputRef = useRef(null)
  const coverInputRef = useRef(null)

  const selectedItems = useMemo(() => items.filter(i => i.selected), [items])
  const totalDuration = useMemo(
    () => selectedItems.reduce((sum, i) => sum + (i.duration || 0), 0),
    [selectedItems]
  )
  const allSelected = items.length > 0 && items.every(i => i.selected)

  // Date-grouped, sorted newest first
  const groups = useMemo(() => {
    const map = new Map()
    for (const item of items) {
      const key = item.date.toDateString()
      if (!map.has(key)) map.set(key, { date: item.date, items: [] })
      map.get(key).items.push(item)
    }
    return Array.from(map.values()).sort((a, b) => b.date - a.date)
  }, [items])

  // Focus name input + default year when sheet opens
  useEffect(() => {
    if (step === 'name') {
      setTimeout(() => nameInputRef.current?.focus(), 300)
      const sel = items.filter(i => i.selected)
      const dates = sel.map(i => i.date.getTime())
      const earliest = dates.length > 0 ? new Date(Math.min(...dates)) : new Date()
      setYear(earliest.getFullYear())
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  const handleFilePick = useCallback(async (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return

    // Seed items immediately (selected, no metadata yet)
    const seeded = files.map(file => ({
      id: crypto.randomUUID(),
      file,
      duration: null,
      thumbnail: null,
      selected: true,
      date: new Date(file.lastModified),
    }))
    setItems(seeded)

    // Extract metadata in parallel (update each as it resolves)
    seeded.forEach(async (item) => {
      const meta = await getVideoMeta(item.file)
      setItems(prev => prev.map(p =>
        p.id === item.id ? { ...p, ...meta } : p
      ))
    })

    // Clear input so the same files can be re-picked if needed
    e.target.value = ''
  }, [])

  function toggleItem(id) {
    setItems(prev => prev.map(p => p.id === id ? { ...p, selected: !p.selected } : p))
  }

  function toggleAll() {
    setItems(prev => prev.map(p => ({ ...p, selected: !allSelected })))
  }

  function handleCoverPick(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setCoverFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => setCoverPreview(ev.target.result)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function clearCover() {
    setCoverFile(null)
    setCoverPreview(null)
  }

  async function handleCreate() {
    if (!name.trim() || !selectedItems.length || uploading) return
    setUploading(true)
    setError(null)

    try {
      // 1. Create scrapbook record
      const { data: sb, error: sbErr } = await supabase
        .from('scrapbooks')
        .insert({ name: name.trim(), user_id: session.user.id, year })
        .select()
        .single()
      if (sbErr) throw sbErr

      // 2. Upload cover image if provided
      if (coverFile) {
        const ext = coverFile.name.split('.').pop()?.toLowerCase() || 'jpg'
        const coverPath = `${session.user.id}/covers/${sb.id}.${ext}`
        const { error: coverErr } = await supabase.storage
          .from('cassette-media')
          .upload(coverPath, coverFile, { cacheControl: '3600' })
        if (!coverErr) {
          const { data: { publicUrl } } = supabase.storage
            .from('cassette-media')
            .getPublicUrl(coverPath)
          await supabase.from('scrapbooks').update({ cover_image_url: publicUrl }).eq('id', sb.id)
        }
      }

      // 3. Upload each clip
      for (let i = 0; i < selectedItems.length; i++) {
        setUploadProgress({ current: i + 1, total: selectedItems.length })
        const item = selectedItems[i]
        const clipId = crypto.randomUUID()
        const ext = item.file.name.split('.').pop()?.toLowerCase() || 'mov'
        const storagePath = `${session.user.id}/${sb.id}/${clipId}.${ext}`

        const { error: uploadErr } = await supabase.storage
          .from('cassette-media')
          .upload(storagePath, item.file, { cacheControl: '3600' })
        if (uploadErr) throw uploadErr

        const { data: { publicUrl } } = supabase.storage
          .from('cassette-media')
          .getPublicUrl(storagePath)

        const { error: clipErr } = await supabase
          .from('clips')
          .insert({
            id: clipId,
            scrapbook_id: sb.id,
            storage_path: storagePath,
            video_url: publicUrl,
            order: i,
            duration: item.duration || null,
            trim_in: 0,
            trim_out: item.duration || null,
            recorded_at: item.date.toISOString(),
          })
        if (clipErr) throw clipErr
      }

      navigate(`/scrapbook/${sb.id}`)
    } catch (err) {
      console.error(err)
      setError(err.message || 'Upload failed. Please try again.')
      setUploading(false)
    }
  }

  const progressPct = items.length > 0
    ? Math.round((selectedItems.length / items.length) * 100)
    : 0

  // ── Uploading overlay ───────────────────────────────────────────────────
  if (uploading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-walnut gap-6 px-8 text-center">
        <div className="w-12 h-12 rounded-full border-2 border-amber border-t-transparent animate-spin" />
        <div>
          <p className="font-display font-semibold text-xl text-wheat mb-1">
            Creating your scrapbook…
          </p>
          <p className="text-rust text-sm">
            Uploading clip {uploadProgress.current} of {uploadProgress.total}
          </p>
        </div>
        {/* Mini progress bar */}
        <div className="w-full max-w-xs h-1 bg-walnut-light rounded-full overflow-hidden">
          <div
            className="h-full bg-amber rounded-full transition-all duration-500"
            style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
          />
        </div>
      </div>
    )
  }

  // ── Empty / pre-pick state ───────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <div className="flex flex-col h-screen bg-walnut">
        <header className="flex items-center gap-3 px-5 pt-14 pb-4 flex-shrink-0">
          <button
            onClick={() => navigate('/')}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-walnut-mid active:opacity-80 transition-opacity"
          >
            <ArrowLeft size={20} strokeWidth={1.75} className="text-wheat" />
          </button>
          <h1 className="font-display font-semibold text-[17px] text-wheat">New Scrapbook</h1>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center px-8 gap-6 text-center pb-16">
          <div className="w-20 h-20 rounded-full bg-walnut-mid border border-walnut-light flex items-center justify-center">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#F2A24A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 10l4.553-2.277A1 1 0 0121 8.68v6.632a1 1 0 01-1.447.894L15 14"/>
              <rect x="3" y="6" width="12" height="12" rx="2"/>
            </svg>
          </div>
          <div>
            <p className="font-display font-semibold text-xl text-wheat mb-2">
              Pick your clips
            </p>
            <p className="text-rust text-sm leading-relaxed">
              Choose videos from your camera roll. You'll be able to review and deselect before uploading.
            </p>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="bg-amber text-walnut font-sans font-bold text-sm rounded-full px-8 py-4 active:opacity-80 transition-opacity"
          >
            Open Camera Roll
          </button>
        </main>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="video/*"
          className="hidden"
          onChange={handleFilePick}
        />
      </div>
    )
  }

  // ── Grid + selection state ───────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-walnut overflow-hidden">

      {/* Nav */}
      <header className="flex items-center justify-between px-5 pt-14 pb-3 flex-shrink-0">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 text-wheat/60 font-sans text-sm font-medium"
        >
          <ArrowLeft size={16} strokeWidth={1.75} />
          Back
        </button>
        <h1 className="font-display font-semibold text-[17px] text-wheat">Pick your clips</h1>
        <button
          onClick={toggleAll}
          className="text-amber font-sans font-semibold text-sm active:opacity-70"
        >
          {allSelected ? 'None' : 'All'}
        </button>
      </header>

      {/* Progress bar */}
      <div className="px-5 pb-4 flex-shrink-0">
        <div className="flex justify-between items-center mb-2">
          <span className="text-rust text-[11px] font-medium tracking-wide">
            {items.length} video{items.length !== 1 ? 's' : ''} imported
          </span>
          <span className="text-amber text-[11px] font-semibold">
            {selectedItems.length} selected
          </span>
        </div>
        <div className="h-[3px] bg-walnut-light rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${progressPct}%`,
              background: 'linear-gradient(90deg, #F2A24A, #E8855A)',
            }}
          />
        </div>
      </div>

      {/* Scrollable grid */}
      <div className="flex-1 overflow-y-auto px-4 pb-32">
        {groups.map(group => (
          <div key={group.date.toDateString()} className="mb-5">
            <p className="text-rust text-[10px] font-bold tracking-[0.18em] uppercase px-1 pb-2.5">
              {formatDateGroup(group.date)}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {group.items.map(item => (
                <button
                  key={item.id}
                  onClick={() => toggleItem(item.id)}
                  className="relative rounded-xl overflow-hidden active:scale-[0.96] transition-transform border-2"
                  style={{
                    aspectRatio: '9/12',
                    background: '#3D2410',
                    borderColor: item.selected ? '#F2A24A' : 'transparent',
                  }}
                >
                  {/* Thumbnail */}
                  {item.thumbnail ? (
                    <img
                      src={item.thumbnail}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                      style={{ filter: item.selected ? 'none' : 'brightness(0.5)' }}
                    />
                  ) : (
                    <div
                      className="absolute inset-0 bg-walnut-mid"
                      style={{ filter: item.selected ? 'none' : 'brightness(0.5)' }}
                    />
                  )}

                  {/* Gradient overlay */}
                  {item.selected && (
                    <div
                      className="absolute inset-0"
                      style={{
                        background: 'linear-gradient(180deg, rgba(44,26,14,0) 50%, rgba(26,15,8,0.7) 100%)',
                      }}
                    />
                  )}

                  {/* Amber tint on selected */}
                  {item.selected && (
                    <div className="absolute inset-0" style={{ background: 'rgba(242,162,74,0.07)' }} />
                  )}

                  {/* Duration badge */}
                  {item.duration !== null && (
                    <div
                      className="absolute bottom-2 left-2 text-wheat text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                      style={{ background: 'rgba(26,15,8,0.65)', backdropFilter: 'blur(4px)' }}
                    >
                      {formatDuration(item.duration)}
                    </div>
                  )}

                  {/* Checkmark */}
                  <div
                    className="absolute top-2 right-2 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all"
                    style={{
                      borderColor: item.selected ? '#F2A24A' : 'rgba(245,222,179,0.5)',
                      background: item.selected ? '#F2A24A' : 'transparent',
                    }}
                  >
                    {item.selected && (
                      <Check size={11} strokeWidth={3} className="text-walnut" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Sticky bottom bar */}
      <div
        className="absolute bottom-0 left-0 right-0 flex items-center gap-3 px-5 pb-8 pt-5"
        style={{ background: 'linear-gradient(180deg, transparent 0%, #2C1A0E 30%)' }}
      >
        <div className="flex-1">
          <p className="font-display font-semibold text-xl text-amber leading-none mb-0.5">
            {selectedItems.length} {selectedItems.length === 1 ? 'clip' : 'clips'}
          </p>
          <p className="text-rust text-[11px]">
            selected · {formatTotalDuration(totalDuration)} total
          </p>
        </div>
        <button
          onClick={() => selectedItems.length > 0 && setStep('name')}
          disabled={selectedItems.length === 0}
          className="bg-amber text-walnut font-sans font-bold text-sm rounded-full px-7 py-3.5 active:opacity-80 transition-opacity disabled:opacity-40"
        >
          Continue →
        </button>
      </div>

      {/* ── Step 2: Bottom sheet ─────────────────────────────────── */}
      {step === 'name' && (
        <>
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-walnut/80 z-10"
            onClick={() => setStep('pick')}
          />

          {/* Sheet */}
          <div
            className="absolute bottom-0 left-0 right-0 z-20 rounded-t-3xl border-t border-walnut-light px-6 pb-10"
            style={{ background: '#3D2410', boxShadow: '0 -20px 60px rgba(0,0,0,0.4)' }}
          >
            {/* Handle */}
            <div className="w-10 h-1 rounded-full bg-walnut-light mx-auto mt-3.5 mb-6" />

            <h2 className="font-display font-bold text-2xl text-amber mb-1">
              Almost <em className="font-light text-sienna">there.</em>
            </h2>
            <p className="text-rust text-xs leading-relaxed mb-7">
              Give this scrapbook a name. You can always rename it later.
            </p>

            {/* Name field */}
            <p className="text-rust text-[9px] font-bold tracking-[0.18em] uppercase mb-2">
              Scrapbook name
            </p>
            <input
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="e.g. Christmas Morning"
              className="w-full rounded-xl px-4 py-3.5 font-display font-semibold text-lg text-wheat placeholder:text-rust/50 outline-none border-[1.5px] border-walnut-light focus:border-amber transition-colors mb-5 caret-amber"
              style={{ background: '#2C1A0E' }}
            />

            {/* Year picker */}
            <p className="text-rust text-[9px] font-bold tracking-[0.18em] uppercase mb-2">
              Year
            </p>
            <div
              className="flex items-center justify-between rounded-xl px-2 py-1 mb-5 border border-walnut-light"
              style={{ background: '#2C1A0E' }}
            >
              <button
                onClick={() => setYear(y => y - 1)}
                className="w-11 h-11 flex items-center justify-center active:opacity-60"
              >
                <ChevronLeft size={20} strokeWidth={1.75} className="text-amber" />
              </button>
              <span className="font-display font-bold text-[22px] text-wheat tabular-nums">
                {year}
              </span>
              <button
                onClick={() => setYear(y => y + 1)}
                className="w-11 h-11 flex items-center justify-center active:opacity-60"
              >
                <ChevronRight size={20} strokeWidth={1.75} className="text-amber" />
              </button>
            </div>

            {/* Cover picker */}
            <button
              onClick={() => coverInputRef.current?.click()}
              className="flex items-center gap-3.5 mb-7 w-full text-left active:opacity-75 transition-opacity"
            >
              <div className="relative w-[60px] h-[60px] rounded-xl border-[1.5px] flex-shrink-0 overflow-hidden"
                style={{ borderColor: coverPreview ? '#F2A24A' : '#4A2E18', borderStyle: coverPreview ? 'solid' : 'dashed', background: '#2C1A0E' }}
              >
                {coverPreview ? (
                  <img src={coverPreview} alt="" className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Image size={20} strokeWidth={1.75} className="text-rust" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-wheat text-[13px] font-semibold mb-0.5">Cover image</p>
                <p className="text-rust text-[11px] leading-snug">
                  {coverPreview ? coverFile?.name ?? 'Image selected' : 'Optional · pick from camera roll'}
                </p>
              </div>
              {coverPreview && (
                <button
                  onClick={(e) => { e.stopPropagation(); clearCover() }}
                  className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 active:opacity-70"
                  style={{ background: 'rgba(232,133,90,0.15)' }}
                >
                  <X size={13} strokeWidth={2.5} className="text-sienna" />
                </button>
              )}
            </button>

            {/* Summary pill */}
            <div className="flex items-center gap-2 bg-walnut border border-walnut-light rounded-full px-3.5 py-2 mb-6 w-fit">
              <div className="w-1.5 h-1.5 rounded-full bg-amber flex-shrink-0" />
              <span className="text-wheat/65 text-[11px] font-medium">
                {selectedItems.length} clips · {formatTotalDuration(totalDuration)}
                {formatSummaryRange(items) ? ` · ${formatSummaryRange(items)}` : ''}
              </span>
            </div>

            {error && (
              <p className="text-sienna text-sm mb-3">{error}</p>
            )}

            {/* Create button */}
            <button
              onClick={handleCreate}
              disabled={!name.trim() || uploading}
              className="w-full bg-amber text-walnut font-sans font-bold text-[15px] rounded-2xl py-4 active:opacity-85 transition-opacity disabled:opacity-40"
            >
              Create Scrapbook
            </button>
          </div>
        </>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="video/*"
        className="hidden"
        onChange={handleFilePick}
      />
      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleCoverPick}
      />
    </div>
  )
}
