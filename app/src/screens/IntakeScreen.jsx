import { useState, useRef, useMemo, useEffect, useCallback } from 'react'
import { ArrowLeft, Check, Image, ChevronDown, X } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { uploadToR2 } from '../lib/r2'
import { useAuth } from '../context/AuthContext'
import { remuxWithFaststart } from '../lib/remux'
import { useUpload } from '../context/UploadContext'
import { dataURLtoBlob } from '../lib/utils'
import Reel from '../components/Reel'

// ── Helpers ────────────────────────────────────────────────────────────────

function getPhotoMeta(file) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve({ duration: 5, thumbnail: e.target.result, mediaType: 'photo' })
    reader.onerror = () => resolve({ duration: 5, thumbnail: null, mediaType: 'photo' })
    reader.readAsDataURL(file)
  })
}

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
      video.onloadedmetadata = null
      video.onseeked = null
      video.onerror = null
      video.src = ''
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


function PickerDropdown({ value, options, onChange, mb = true }) {
  const [open, setOpen] = useState(false)
  const selectedLabel = options.find(o => o.value === value)?.label ?? '···'
  return (
    <div className={`relative ${mb ? 'mb-5' : ''}`}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between rounded-xl px-4 py-3 border border-walnut-light active:opacity-80"
        style={{ background: '#2C1A0E' }}
      >
        <span className="font-display font-bold text-[18px] text-wheat">{selectedLabel}</span>
        <ChevronDown size={18} strokeWidth={1.75} className="text-amber" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div
            className="absolute left-0 right-0 top-full mt-1 rounded-xl border border-walnut-light z-30 overflow-y-auto"
            style={{ background: '#2C1A0E', maxHeight: 210 }}
          >
            {options.map(opt => (
              <button
                key={String(opt.value)}
                onClick={() => { onChange(opt.value); setOpen(false) }}
                className="w-full px-4 py-3 text-left border-b active:opacity-70"
                style={{ borderColor: '#3D2410', background: opt.value === value ? 'rgba(242,162,74,0.10)' : 'transparent' }}
              >
                <span className="font-display font-semibold text-[16px]" style={{ color: opt.value === value ? '#F2A24A' : '#F5DEB3' }}>
                  {opt.label}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function IntakeScreen() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const addToId = searchParams.get('addTo') // existing scrapbook id, if adding clips
  const { session } = useAuth()
  const { startBackgroundUpload } = useUpload()
  const fileInputRef = useRef(null)

  const [items, setItems] = useState([])        // { id, file, duration, thumbnail, selected, date }
  const [step, setStep] = useState('pick')      // 'pick' | 'name'
  const [name, setName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadPhase, setUploadPhase] = useState('remuxing') // 'remuxing' | 'uploading'
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 })
  const [error, setError] = useState(null)
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [coverFile, setCoverFile] = useState(null)
  const [coverPreview, setCoverPreview] = useState(null)
  const nameInputRef = useRef(null)
  const coverInputRef = useRef(null)
  const wakeLockRef = useRef(null)
  const cancelledRef = useRef(false)

  // Pre-remux clip 1 silently while user types the scrapbook name
  const preRemuxRef = useRef(null)
  const [preRemuxReady, setPreRemuxReady] = useState(false)

  // Metadata loading progress
  const [metaLoaded, setMetaLoaded] = useState(0)
  const [metaTotal, setMetaTotal] = useState(0)

  // Smooth progress bar
  const smoothPctRef = useRef(0)
  const [displayPct, setDisplayPct] = useState(0)
  const uploadPhaseRef = useRef(uploadPhase)
  const uploadProgressRef = useRef(uploadProgress)
  useEffect(() => { uploadPhaseRef.current = uploadPhase }, [uploadPhase])
  useEffect(() => { uploadProgressRef.current = uploadProgress }, [uploadProgress])
  useEffect(() => {
    if (!uploading) { smoothPctRef.current = 0; setDisplayPct(0); return }
    const id = setInterval(() => {
      const prog = uploadProgressRef.current
      const phase = uploadPhaseRef.current
      const target = phase === 'remuxing'
        ? (prog.current / Math.max(prog.total, 1)) * 40
        : 40 + (prog.current / Math.max(prog.total, 1)) * 55
      smoothPctRef.current += (target - smoothPctRef.current) * 0.05
      setDisplayPct(smoothPctRef.current)
    }, 80)
    return () => clearInterval(id)
  }, [uploading])

  // ── Wake lock helpers ────────────────────────────────────────────────────
  async function acquireWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen')
      }
    } catch { /* not supported or denied — continue without it */ }
  }

  function releaseWakeLock() {
    try { wakeLockRef.current?.release() } catch {}
    wakeLockRef.current = null
  }

  // Re-acquire wake lock if page comes back into view while still uploading
  // (iOS releases it automatically when the app is backgrounded)
  useEffect(() => {
    if (!uploading) return
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') acquireWakeLock()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [uploading])

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
      setMonth(earliest.getMonth() + 1)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  // Kick off pre-remux for clip 1 as soon as the name sheet opens
  useEffect(() => {
    if (step !== 'name') {
      preRemuxRef.current = null
      setPreRemuxReady(false)
      return
    }
    const first = selectedItems[0]
    if (!first || first.mediaType === 'photo') {
      setPreRemuxReady(true)
      return
    }
    preRemuxRef.current = { result: null }
    remuxWithFaststart(first.file)
      .then(remuxed => {
        preRemuxRef.current = { result: { ...first, file: remuxed } }
        setPreRemuxReady(true)
      })
      .catch(() => {
        preRemuxRef.current = { result: first }
        setPreRemuxReady(true)
      })
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
      mediaType: file.type.startsWith('image/') ? 'photo' : 'video',
    }))
    setItems(seeded)
    setMetaLoaded(0)
    setMetaTotal(seeded.length)

    // Extract metadata in parallel (update each as it resolves)
    seeded.forEach(async (item) => {
      const meta = item.mediaType === 'photo'
        ? await getPhotoMeta(item.file)
        : await getVideoMeta(item.file)
      setItems(prev => prev.map(p =>
        p.id === item.id ? { ...p, ...meta } : p
      ))
      setMetaLoaded(prev => prev + 1)
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

  function handleCancel() {
    cancelledRef.current = true
    releaseWakeLock()
    setUploading(false)
    navigate(addToId ? `/scrapbook/${addToId}/edit` : '/')
  }

  async function handleCreate() {
    if (!name.trim() || !selectedItems.length || uploading) return
    cancelledRef.current = false
    setUploading(true)
    setError(null)
    await acquireWakeLock()

    try {
      // 1. Get remuxed clip 1 — use pre-remux result if ready, otherwise remux now
      setUploadPhase('remuxing')
      setUploadProgress({ current: 0, total: 1 })
      let clip1
      if (preRemuxRef.current?.result) {
        clip1 = preRemuxRef.current.result
      } else {
        const first = selectedItems[0]
        if (first.mediaType === 'photo') {
          clip1 = first
        } else {
          const remuxed = await remuxWithFaststart(first.file)
          if (cancelledRef.current) { releaseWakeLock(); return }
          clip1 = { ...first, file: remuxed }
        }
      }
      setUploadProgress({ current: 1, total: 1 })

      // 2. Create scrapbook record
      setUploadPhase('uploading')
      setUploadProgress({ current: 0, total: 1 })
      const { data: sb, error: sbErr } = await supabase
        .from('scrapbooks')
        .insert({ name: name.trim(), user_id: session.user.id, year, month })
        .select()
        .single()
      if (sbErr) throw sbErr

      // 3. Auto-share with defaults (silent — never blocks scrapbook creation)
      try {
        const { data: shareDefaults } = await supabase
          .from('sharing_defaults')
          .select('recipient_id')
          .eq('user_id', session.user.id)
        if (shareDefaults && shareDefaults.length > 0) {
          await supabase.from('scrapbook_shares').upsert(
            shareDefaults.map(d => ({
              scrapbook_id: sb.id,
              owner_id: session.user.id,
              shared_with_id: d.recipient_id,
            })),
            { onConflict: 'scrapbook_id,shared_with_id', ignoreDuplicates: true }
          )
        }
      } catch { /* never block creation */ }

      // 4. Upload cover image if provided
      if (coverFile) {
        const ext = coverFile.name.split('.').pop()?.toLowerCase() || 'jpg'
        try {
          const coverUrl = await uploadToR2(`${session.user.id}/covers/${sb.id}.${ext}`, coverFile)
          await supabase.from('scrapbooks').update({ cover_image_url: coverUrl }).eq('id', sb.id)
        } catch { /* non-blocking */ }
      }

      // 5. Upload clip 1 + thumbnail, insert DB row
      const clipId = crypto.randomUUID()
      const isPhoto1 = clip1.mediaType === 'photo'
      const ext1 = clip1.file.name.split('.').pop()?.toLowerCase() || (isPhoto1 ? 'jpg' : 'mp4')
      const storagePath1 = `${session.user.id}/${sb.id}/${clipId}.${ext1}`
      const publicUrl1 = await uploadToR2(storagePath1, clip1.file, undefined, (fraction) => {
        setUploadProgress({ current: fraction, total: 1 })
      })
      if (cancelledRef.current) { releaseWakeLock(); return }

      let thumbnailUrl1 = isPhoto1 ? publicUrl1 : null
      if (!isPhoto1 && clip1.thumbnail) {
        try {
          thumbnailUrl1 = await uploadToR2(
            `${session.user.id}/${sb.id}/${clipId}_thumb.jpg`,
            dataURLtoBlob(clip1.thumbnail),
            'image/jpeg'
          )
        } catch { /* non-blocking */ }
      }

      const clipDuration1 = isPhoto1 ? (clip1.duration || 5) : (clip1.duration || null)
      const { error: clipErr } = await supabase.from('clips').insert({
        id: clipId,
        scrapbook_id: sb.id,
        storage_path: storagePath1,
        video_url: publicUrl1,
        thumbnail_url: thumbnailUrl1,
        order: 0,
        duration: clipDuration1,
        trim_in: 0,
        trim_out: clipDuration1,
        recorded_at: clip1.date?.toISOString(),
        media_type: clip1.mediaType || 'video',
      })
      if (clipErr) throw clipErr

      setUploadProgress({ current: 1, total: 1 })

      // 6. ★ Navigate now — clip 1 is live
      releaseWakeLock()
      setUploading(false)

      // 7. Hand remaining clips to background context (clips 2..N, un-remuxed)
      const remaining = selectedItems.slice(1)
      if (remaining.length > 0) {
        startBackgroundUpload({
          scrapbookId: sb.id,
          clips: remaining,
          userId: session.user.id,
          concurrency: 3,
        })
      }

      navigate(`/scrapbook/${sb.id}`)
    } catch (err) {
      console.error(err)
      releaseWakeLock()
      setError(err.message || 'Upload failed. Please try again.')
      setUploading(false)
    }
  }

  async function handleAddClips() {
    if (!selectedItems.length || uploading) return
    cancelledRef.current = false
    setUploading(true)
    setError(null)
    await acquireWakeLock()

    try {
      // 1. Remux clip 1 only
      setUploadPhase('remuxing')
      setUploadProgress({ current: 0, total: 1 })
      const first = selectedItems[0]
      let clip1
      if (first.mediaType === 'photo') {
        clip1 = first
      } else {
        const remuxed = await remuxWithFaststart(first.file)
        if (cancelledRef.current) { releaseWakeLock(); return }
        clip1 = { ...first, file: remuxed }
      }
      setUploadProgress({ current: 1, total: 1 })

      // 2. Get current max order
      setUploadPhase('uploading')
      setUploadProgress({ current: 0, total: 1 })
      const { data: existingClips } = await supabase
        .from('clips')
        .select('order')
        .eq('scrapbook_id', addToId)
        .order('order', { ascending: false })
        .limit(1)
      const orderOffset = existingClips?.length > 0 ? (existingClips[0].order + 1) : 0

      // 3. Upload clip 1 + thumbnail, insert DB row
      const clipId = crypto.randomUUID()
      const isPhoto1 = clip1.mediaType === 'photo'
      const ext1 = clip1.file.name.split('.').pop()?.toLowerCase() || (isPhoto1 ? 'jpg' : 'mp4')
      const storagePath1 = `${session.user.id}/${addToId}/${clipId}.${ext1}`
      const publicUrl1 = await uploadToR2(storagePath1, clip1.file, undefined, (fraction) => {
        setUploadProgress({ current: fraction, total: 1 })
      })
      if (cancelledRef.current) { releaseWakeLock(); return }

      let thumbnailUrl1 = isPhoto1 ? publicUrl1 : null
      if (!isPhoto1 && clip1.thumbnail) {
        try {
          thumbnailUrl1 = await uploadToR2(
            `${session.user.id}/${addToId}/${clipId}_thumb.jpg`,
            dataURLtoBlob(clip1.thumbnail),
            'image/jpeg'
          )
        } catch { /* non-blocking */ }
      }

      const clipDuration1 = isPhoto1 ? (clip1.duration || 5) : (clip1.duration || null)
      const { error: clipErr } = await supabase.from('clips').insert({
        id: clipId,
        scrapbook_id: addToId,
        storage_path: storagePath1,
        video_url: publicUrl1,
        thumbnail_url: thumbnailUrl1,
        order: orderOffset,
        duration: clipDuration1,
        trim_in: 0,
        trim_out: clipDuration1,
        recorded_at: clip1.date?.toISOString(),
        media_type: clip1.mediaType || 'video',
      })
      if (clipErr) throw clipErr

      setUploadProgress({ current: 1, total: 1 })

      // 4. Navigate now — clip 1 is live
      releaseWakeLock()
      setUploading(false)

      // 5. Hand remaining clips to background context
      const remaining = selectedItems.slice(1)
      if (remaining.length > 0) {
        startBackgroundUpload({
          scrapbookId: addToId,
          clips: remaining,
          userId: session.user.id,
          concurrency: 3,
        })
      }

      navigate(`/scrapbook/${addToId}/edit`)
    } catch (err) {
      console.error(err)
      releaseWakeLock()
      setError(err.message || 'Upload failed. Please try again.')
      setUploading(false)
    }
  }

  const progressPct = items.length > 0
    ? Math.round((selectedItems.length / items.length) * 100)
    : 0

  // ── Uploading overlay ───────────────────────────────────────────────────
  if (uploading) {
    const queuedCount = selectedItems.length - 1
    return (
      <div className="relative flex flex-col items-center justify-center bg-walnut gap-8 px-8 text-center" style={{ height: '100dvh' }}>
        <button
          onClick={handleCancel}
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
          <p className="font-display italic text-amber text-3xl tracking-tight mb-2">
            {uploadPhase === 'remuxing' ? 'Getting ready…' : addToId ? 'Adding clips…' : 'Saving memories…'}
          </p>
          <p className="text-rust text-sm leading-relaxed">
            {uploadPhase === 'remuxing' ? 'Optimizing first clip' : 'Uploading first clip'}
          </p>
        </div>
        <div className="w-full max-w-xs flex flex-col gap-2.5">
          <div>
            <div className="flex justify-between mb-1.5">
              <span className="text-[10px] font-bold text-wheat font-sans">Clip 1</span>
              <span className="text-[10px] text-rust font-sans">{Math.round(displayPct)}%</span>
            </div>
            <div className="h-[3px] bg-walnut-light rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${displayPct}%`,
                  background: 'linear-gradient(90deg, #F2A24A, #E8855A)',
                  transition: 'width 0.08s linear',
                }}
              />
            </div>
          </div>
          {queuedCount > 0 && (
            <div className="flex items-center gap-2 pt-0.5">
              <div className="flex-1 h-px bg-walnut-light rounded-full" />
              <span className="text-[10px] text-rust font-sans whitespace-nowrap">
                {queuedCount} more clip{queuedCount !== 1 ? 's' : ''} queued
              </span>
              <div className="flex-1 h-px bg-walnut-light rounded-full" />
            </div>
          )}
        </div>
        {queuedCount > 0 && (
          <div
            className="w-full max-w-xs rounded-xl px-4 py-3 border border-walnut-light text-left"
            style={{ background: '#2C1A0E' }}
          >
            <p className="text-wheat text-[11px] font-semibold font-sans mb-1">You can start editing right away</p>
            <p className="text-rust text-[11px] font-sans leading-relaxed">
              Remaining clips upload in the background — any trims or captions you add are saved instantly.
            </p>
          </div>
        )}
      </div>
    )
  }

  // ── Empty / pre-pick state ───────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <div className="flex flex-col h-screen bg-walnut">
        <header className="flex items-center gap-3 px-5 pt-8 pb-2 flex-shrink-0">
          <button
            onClick={() => navigate(addToId ? `/scrapbook/${addToId}/edit` : '/')}
            className="w-11 h-11 flex items-center justify-center rounded-full bg-walnut-mid active:opacity-80 transition-opacity"
          >
            <ArrowLeft size={22} strokeWidth={2} className="text-wheat" />
          </button>
          <h1 className="font-display font-semibold text-[19px] text-wheat">
            {addToId ? 'Add Clips' : 'New Scrapbook'}
          </h1>
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
          accept="video/*,image/*"
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
      <header className="flex items-center justify-between px-5 pt-8 pb-2 flex-shrink-0">
        <button
          onClick={() => navigate(addToId ? `/scrapbook/${addToId}/edit` : '/')}
          className="flex items-center gap-1.5 text-wheat/60 font-sans text-[14px] font-semibold"
        >
          <ArrowLeft size={18} strokeWidth={2} />
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
          {metaLoaded < metaTotal ? (
            <span className="flex items-center gap-1.5 text-amber text-[11px] font-semibold font-sans">
              <span className="w-2.5 h-2.5 rounded-full border-[1.5px] border-amber border-t-transparent animate-spin inline-block flex-shrink-0" />
              Loading clip info… {metaLoaded} of {metaTotal}
            </span>
          ) : (
            <span className="text-rust text-[11px] font-medium tracking-wide">
              {items.length} {items.length === 1 ? 'item' : 'items'} imported
            </span>
          )}
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
                      className={`absolute inset-0 bg-walnut-mid${item.duration === null ? ' animate-pulse' : ''}`}
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
          onClick={() => {
            if (!selectedItems.length) return
            if (addToId) handleAddClips()
            else setStep('name')
          }}
          disabled={selectedItems.length === 0}
          className="bg-amber text-walnut font-sans font-bold text-sm rounded-full px-7 py-3.5 active:opacity-80 transition-opacity disabled:opacity-40"
        >
          {addToId ? 'Add to Scrapbook' : 'Continue →'}
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
            <PickerDropdown
              value={year}
              options={Array.from({ length: new Date().getFullYear() - 2014 }, (_, i) => {
                const y = new Date().getFullYear() - i
                return { value: y, label: String(y) }
              })}
              onChange={setYear}
            />

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
            <div className="flex items-center gap-2 bg-walnut border border-walnut-light rounded-full px-3.5 py-2 mb-4 w-fit">
              <div className="w-1.5 h-1.5 rounded-full bg-amber flex-shrink-0" />
              <span className="text-wheat/65 text-[11px] font-medium">
                {selectedItems.length} clips · {formatTotalDuration(totalDuration)}
                {formatSummaryRange(items) ? ` · ${formatSummaryRange(items)}` : ''}
              </span>
            </div>

            {/* Pre-remux indicator — only for batches with video clips */}
            {selectedItems.some(i => i.mediaType !== 'photo') && (
              <div
                className="flex items-center gap-2.5 rounded-xl px-3 py-2 mb-4 border border-walnut-light"
                style={{ background: '#2C1A0E' }}
              >
                {preRemuxReady ? (
                  <div className="w-4 h-4 rounded-full bg-amber flex items-center justify-center flex-shrink-0">
                    <Check size={9} strokeWidth={3} className="text-walnut" />
                  </div>
                ) : (
                  <div className="w-4 h-4 rounded-full border-2 border-amber border-t-transparent animate-spin flex-shrink-0" />
                )}
                <span
                  className="text-[11px] font-semibold font-sans"
                  style={{ color: preRemuxReady ? '#F2A24A' : '#F5DEB3' }}
                >
                  {preRemuxReady ? 'Clip 1 optimized and ready' : 'Optimizing clip 1 while you type…'}
                </span>
              </div>
            )}

            {error && (
              <p className="text-sienna text-sm mb-3">{error}</p>
            )}

            {/* Create button — always tappable; falls back to inline remux if pre-remux isn't done */}
            <button
              onClick={handleCreate}
              disabled={!name.trim() || uploading}
              className="w-full bg-amber text-walnut font-sans font-bold text-[15px] rounded-2xl py-4 active:opacity-85 transition-all disabled:opacity-40"
              style={{ opacity: name.trim() ? (preRemuxReady ? 1 : 0.75) : undefined }}
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
