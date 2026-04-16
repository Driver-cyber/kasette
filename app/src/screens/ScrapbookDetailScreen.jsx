import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Play, Edit3, Share2, Image, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { uploadToR2, deleteFromR2 } from '../lib/r2'
import { useAuth } from '../context/AuthContext'
import { preloadClips, preloadRest } from '../lib/blobCache'
import { cacheScrapbook } from '../lib/dataCache'
import { exportScrapbook } from '../lib/export'

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
  for (let i = 0; i < id.length; i++) h = (Math.imul(31, h) + id.charCodeAt(i)) | 0
  return Math.abs(h)
}

function fmt(secs) {
  if (!secs) return ''
  const total = Math.round(secs)
  const m = Math.floor(total / 60)
  const s = total % 60
  if (m === 0) return `${s}s`
  if (s === 0) return `${m} min`
  return `${m} min ${s}s`
}

// Cassette reel SVG — used in the loading animation
function Reel({ reverse = false }) {
  return (
    <div
      className="animate-spin"
      style={{
        animationDuration: reverse ? '1.7s' : '2.1s',
        animationDirection: reverse ? 'reverse' : 'normal',
      }}
    >
      <svg width="52" height="52" viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="24" r="20" stroke="#F2A24A" strokeWidth="2.5" fill="none" />
        <circle cx="24" cy="24" r="7" stroke="#F2A24A" strokeWidth="1.5" fill="none" />
        <circle cx="24" cy="24" r="2.5" fill="#F2A24A" />
        {/* Three spokes at 0°, 120°, 240° from top */}
        <line x1="24" y1="4" x2="24" y2="17" stroke="#F2A24A" strokeWidth="2" strokeLinecap="round" />
        <line x1="41.3" y1="34" x2="30.1" y2="27.5" stroke="#F2A24A" strokeWidth="2" strokeLinecap="round" />
        <line x1="6.7" y1="34" x2="17.9" y2="27.5" stroke="#F2A24A" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  )
}

export default function ScrapbookDetailScreen() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const coverInputRef = useRef(null)

  const [scrapbook, setScrapbook] = useState(null)
  const [clips, setClips] = useState([])
  const [loading, setLoading] = useState(true)
  const [isLaunching, setIsLaunching] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameDraft, setRenameDraft] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [exportState, setExportState] = useState(null) // null | {phase,current,total} | 'done' | {error}
  const [exportBlob, setExportBlob] = useState(null)

  useEffect(() => {
    Promise.all([
      supabase.from('scrapbooks').select('*').eq('id', id).single(),
      supabase.from('clips')
        .select('id, video_url, thumbnail_url, duration, trim_in, trim_out, caption_text, caption_x, caption_y, caption_size, order, recorded_at')
        .eq('scrapbook_id', id)
        .order('order', { ascending: true }),
    ]).then(([{ data: sb }, { data: cl }]) => {
      setScrapbook(sb)
      const c = cl || []
      setClips(c)
      setLoading(false)
      // Populate data cache so workspace/playback can skip their loading spinners
      if (sb) cacheScrapbook(id, sb, c)
      // Start preloading first 2 clips immediately — by the time they tap Watch, they'll be ready
      if (c.length > 0) {
        preloadClips(c, 2).then(() => preloadRest(c, 2))
      }
    })
  }, [id])

  const isOwner = session?.user?.id === scrapbook?.user_id

  const totalDuration = clips.reduce((sum, c) => {
    const out = c.trim_out ?? c.duration ?? 0
    return sum + (out - (c.trim_in ?? 0))
  }, 0)

  const gradient = scrapbook ? CARD_GRADIENTS[hashId(scrapbook.id) % CARD_GRADIENTS.length] : CARD_GRADIENTS[0]

  async function handleWatch() {
    if (!clips.length) return
    setIsLaunching(true)
    // Minimum 2.5s branded loading + wait for first clip blob
    const minDelay = new Promise(r => setTimeout(r, 2000))
    const firstReady = preloadClips(clips, 1)
    preloadRest(clips, 1) // kick off the rest without blocking
    await Promise.all([minDelay, firstReady])
    navigate(`/scrapbook/${id}/watch`)
  }

  async function handleRename() {
    const name = renameDraft.trim()
    if (!name) return
    setScrapbook(s => ({ ...s, name }))
    setRenaming(false)
    await supabase.from('scrapbooks').update({ name }).eq('id', id)
  }

  async function handleCoverChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const reader = new FileReader()
    reader.onload = ev => setScrapbook(s => ({ ...s, cover_image_url: ev.target.result }))
    reader.readAsDataURL(file)
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const coverKey = `${session.user.id}/covers/${id}.${ext}`
    try {
      const publicUrl = await uploadToR2(coverKey, file)
      const bustUrl = `${publicUrl}?v=${Date.now()}`
      await supabase.from('scrapbooks').update({ cover_image_url: bustUrl }).eq('id', id)
      setScrapbook(s => ({ ...s, cover_image_url: bustUrl }))
    } catch { /* non-blocking */ }
  }

  async function handleDelete() {
    if (deleting) return
    setDeleting(true)
    const videoUrls = clips.map(c => c.video_url).filter(Boolean)
    if (videoUrls.length) await deleteFromR2(videoUrls)
    await supabase.from('clips').delete().eq('scrapbook_id', id)
    await supabase.from('scrapbooks').delete().eq('id', id)
    navigate('/', { replace: true })
  }

  async function handleExport() {
    if (!clips.length) return
    setExportState({ phase: 'fetching', current: 1, total: clips.length })
    try {
      const blob = await exportScrapbook(clips, p => setExportState(p))
      setExportBlob(blob)
      setExportState('done')
    } catch (e) {
      setExportState({ error: e?.message || String(e) })
    }
  }

  async function handleShareExport() {
    if (!exportBlob) return
    const filename = `${scrapbook?.name || 'cassette'}.mp4`
    const file = new File([exportBlob], filename, { type: 'video/mp4' })
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: filename })
    } else {
      const url = URL.createObjectURL(exportBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    }
  }

  function exportPhaseLabel(state) {
    if (!state || state === 'done') return ''
    if (state.phase === 'fetching') return `Fetching clip ${state.current} of ${state.total}…`
    if (state.phase === 'trimming') return `Trimming clip ${state.current} of ${state.total}…`
    return 'Stitching clips together…'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center bg-walnut" style={{ height: '100dvh' }}>
        <div className="w-8 h-8 rounded-full border-2 border-amber border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col bg-walnut" style={{ height: '100dvh' }}>

      {/* ── Hero cover area ── */}
      <div className="relative flex-shrink-0" style={{ height: '42%' }}>
        {scrapbook?.cover_image_url ? (
          <div className="absolute inset-0 bg-center bg-cover"
            style={{ backgroundImage: `url(${scrapbook.cover_image_url})` }} />
        ) : (
          <div className="absolute inset-0" style={{ background: gradient }} />
        )}
        {/* Gradient overlay — fades into walnut at the bottom */}
        <div className="absolute inset-0"
          style={{ background: 'linear-gradient(180deg, rgba(44,26,14,0.3) 0%, rgba(44,26,14,0.0) 30%, rgba(44,26,14,0.85) 100%)' }} />

        {/* Back button */}
        <button
          onClick={() => navigate('/')}
          className="absolute top-12 left-4 flex items-center gap-1.5 text-white/70 font-sans text-[14px] font-semibold active:opacity-70"
        >
          <ArrowLeft size={18} strokeWidth={2} />
          Library
        </button>

        {/* Name + stats at bottom of hero */}
        <div className="absolute bottom-5 left-5 right-5">
          <h1 className="font-display font-bold text-[28px] text-wheat leading-tight mb-1">
            {scrapbook?.name}
          </h1>
          <p className="text-wheat/55 text-[12px] font-sans">
            {scrapbook?.year && `${scrapbook.year} · `}
            {clips.length} {clips.length === 1 ? 'clip' : 'clips'}
            {totalDuration > 0 && ` · ${fmt(totalDuration)}`}
          </p>
        </div>
      </div>

      {/* ── Actions ── */}
      <div className="flex-1 overflow-y-auto px-5 pt-5 pb-10">

        {/* Watch — primary CTA */}
        <button
          onClick={handleWatch}
          disabled={!clips.length}
          className="w-full flex items-center justify-center gap-2.5 bg-amber text-walnut font-sans font-bold text-[16px] rounded-2xl py-4 mb-3 active:opacity-85 disabled:opacity-40 transition-opacity"
        >
          <Play size={16} fill="#2C1A0E" strokeWidth={0} className="ml-0.5" />
          Watch
        </button>

        {/* Secondary row — only for owner */}
        {isOwner && (
          <div className="flex gap-2 mb-5">
            <button
              onClick={() => navigate(`/scrapbook/${id}/edit`)}
              className="flex-1 flex flex-col items-center gap-1.5 py-3.5 rounded-2xl active:opacity-75 transition-opacity border border-walnut-light"
              style={{ background: '#3D2410' }}
            >
              <Edit3 size={18} strokeWidth={1.75} className="text-amber" />
              <span className="text-wheat/60 text-[11px] font-semibold font-sans">Edit</span>
            </button>
            <button
              onClick={() => navigate(`/scrapbook/${id}/share`)}
              className="flex-1 flex flex-col items-center gap-1.5 py-3.5 rounded-2xl active:opacity-75 transition-opacity border border-walnut-light"
              style={{ background: '#3D2410' }}
            >
              <Share2 size={18} strokeWidth={1.75} className="text-amber" />
              <span className="text-wheat/60 text-[11px] font-semibold font-sans">Share</span>
            </button>
            <button
              onClick={handleExport}
              disabled={!!exportState}
              className="flex-1 flex flex-col items-center gap-1.5 py-3.5 rounded-2xl active:opacity-75 transition-opacity border border-walnut-light disabled:opacity-50"
              style={{ background: '#3D2410' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F2A24A" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              <span className="text-wheat/60 text-[11px] font-semibold font-sans">Export</span>
            </button>
          </div>
        )}

        {/* Settings rows — owner only */}
        {isOwner && (
          <div className="rounded-2xl overflow-hidden border border-walnut-light mb-4" style={{ background: '#3D2410' }}>
            {/* Rename */}
            <button
              onClick={() => { setRenameDraft(scrapbook?.name || ''); setRenaming(true) }}
              className="w-full flex items-center gap-3 px-4 py-3.5 active:opacity-75 border-b border-walnut-light"
            >
              <Pencil size={16} strokeWidth={1.75} className="text-rust" />
              <span className="text-wheat/80 text-[14px] font-sans font-medium">Rename</span>
            </button>
            {/* Change cover */}
            <button
              onClick={() => coverInputRef.current?.click()}
              className="w-full flex items-center gap-3 px-4 py-3.5 active:opacity-75"
            >
              <Image size={16} strokeWidth={1.75} className="text-rust" />
              <span className="text-wheat/80 text-[14px] font-sans font-medium">
                {scrapbook?.cover_image_url ? 'Change Cover Photo' : 'Add Cover Photo'}
              </span>
            </button>
          </div>
        )}

        {/* Delete — owner only */}
        {isOwner && (
          <button
            onClick={() => setConfirmDelete(true)}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl active:opacity-75 border border-walnut-light"
            style={{ background: '#3D2410' }}
          >
            <Trash2 size={16} strokeWidth={1.75} className="text-sienna" />
            <span className="text-sienna text-[14px] font-sans font-medium">Delete Scrapbook</span>
          </button>
        )}
      </div>

      {/* ── Launching overlay — cassette reel animation ── */}
      {isLaunching && (
        <div className="absolute inset-0 bg-walnut flex flex-col items-center justify-center gap-6 z-50">
          {/* Counter-rotating reels */}
          <div className="flex items-center gap-3">
            <Reel />
            <div className="flex flex-col gap-1 items-center">
              <div className="h-0.5 w-8 rounded-full bg-sienna/50" />
              <div className="h-0.5 w-8 rounded-full bg-sienna/30" />
            </div>
            <Reel reverse />
          </div>
          <div className="text-center">
            <p className="font-display italic text-amber text-[22px] mb-1">
              crafting your experience…
            </p>
            <p className="text-rust text-[13px]">just a moment</p>
          </div>
        </div>
      )}

      {/* ── Export progress overlay ── */}
      {exportState && (
        <div className="absolute inset-0 bg-walnut/95 flex flex-col items-center justify-center gap-5 z-50 px-8">
          {exportState === 'done' ? (
            <>
              <p className="font-display font-semibold text-xl text-wheat">Export ready</p>
              <button
                onClick={handleShareExport}
                className="w-full py-4 bg-amber text-walnut font-sans font-bold text-[15px] rounded-2xl active:opacity-80"
              >
                Save / Share
              </button>
              <button
                onClick={() => { setExportState(null); setExportBlob(null) }}
                className="text-rust font-semibold text-[14px] active:opacity-70"
              >
                Done
              </button>
            </>
          ) : exportState?.error ? (
            <>
              <p className="text-sienna font-display font-semibold text-xl">Export failed</p>
              <p className="text-wheat/40 text-[11px] font-mono text-center break-all">{exportState.error}</p>
              <button
                onClick={() => setExportState(null)}
                className="py-3 px-8 rounded-2xl bg-walnut-mid text-rust font-semibold active:opacity-70 border border-walnut-light"
              >
                Dismiss
              </button>
            </>
          ) : (
            <>
              <p className="font-display italic text-amber text-2xl">Exporting…</p>
              <div className="w-full h-1 bg-walnut-light rounded-full overflow-hidden">
                <div className="h-full bg-amber rounded-full transition-all duration-500"
                  style={{
                    width: exportState.phase === 'stitching'
                      ? '100%'
                      : `${((exportState.current - 1) / exportState.total) * 90}%`
                  }} />
              </div>
              <p className="text-rust text-sm">{exportPhaseLabel(exportState)}</p>
            </>
          )}
        </div>
      )}

      {/* ── Rename sheet ── */}
      {renaming && (
        <>
          <div className="absolute inset-0 bg-black/50 z-40" onClick={() => setRenaming(false)} />
          <div className="absolute bottom-0 left-0 right-0 z-50 rounded-t-3xl border-t border-walnut-light px-5 pb-10 pt-1"
            style={{ background: '#3D2410' }}>
            <div className="w-10 h-1 rounded-full bg-walnut-light mx-auto mt-3 mb-5" />
            <p className="font-display font-semibold text-lg text-wheat mb-4 px-1">Rename Scrapbook</p>
            <input
              type="text"
              value={renameDraft}
              onChange={e => setRenameDraft(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleRename()}
              autoFocus
              maxLength={60}
              className="w-full px-4 py-3.5 rounded-2xl text-wheat text-[15px] font-sans outline-none mb-3 caret-amber"
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
            <button onClick={() => setRenaming(false)}
              className="w-full py-3 text-center text-rust font-semibold text-[15px] active:opacity-70">
              Cancel
            </button>
          </div>
        </>
      )}

      {/* ── Delete confirmation sheet ── */}
      {confirmDelete && (
        <>
          <div className="absolute inset-0 bg-black/50 z-40" onClick={() => setConfirmDelete(false)} />
          <div className="absolute bottom-0 left-0 right-0 z-50 rounded-t-3xl border-t border-walnut-light px-5 pb-10 pt-1"
            style={{ background: '#3D2410' }}>
            <div className="w-10 h-1 rounded-full bg-walnut-light mx-auto mt-3 mb-6" />
            <p className="font-display font-semibold text-xl text-wheat mb-1">
              Delete "{scrapbook?.name}"?
            </p>
            <p className="text-rust text-sm mb-8 leading-relaxed">
              This will permanently delete the scrapbook and all its clips. Your original videos won't be affected.
            </p>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="w-full bg-sienna text-white font-sans font-bold text-[15px] rounded-2xl py-4 mb-3 active:opacity-80 disabled:opacity-50"
            >
              {deleting ? 'Deleting…' : 'Delete Scrapbook'}
            </button>
            <button onClick={() => setConfirmDelete(false)}
              className="w-full py-3 text-center text-rust font-semibold text-[15px] active:opacity-70">
              Cancel
            </button>
          </div>
        </>
      )}

      <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverChange} />
    </div>
  )
}
