import { createContext, useContext, useRef, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { uploadToR2 } from '../lib/r2'
import { remuxWithFaststart } from '../lib/remux'
import { dataURLtoBlob } from '../lib/utils'

const UploadContext = createContext(null)

export function UploadProvider({ children }) {
  const [state, setState] = useState({
    scrapbookId: null,
    totalClips: 0,
    completedClips: 0,
    failedClips: [],
    isActive: false,
  })
  const cancelledRef = useRef(false)
  const wakeLockRef = useRef(null)

  async function acquireWakeLock() {
    try {
      if ('wakeLock' in navigator)
        wakeLockRef.current = await navigator.wakeLock.request('screen')
    } catch {}
  }

  function releaseWakeLock() {
    try { wakeLockRef.current?.release() } catch {}
    wakeLockRef.current = null
  }

  useEffect(() => {
    if (!state.isActive) return
    function onVisibility() {
      if (document.visibilityState === 'visible') acquireWakeLock()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [state.isActive])

  async function startBackgroundUpload({ scrapbookId, clips, userId, concurrency = 3 }) {
    if (!clips.length) return
    cancelledRef.current = false
    await acquireWakeLock()

    // Determine order offset from what's already in the DB (clip 0 already inserted)
    const { data: existing } = await supabase
      .from('clips')
      .select('order')
      .eq('scrapbook_id', scrapbookId)
      .order('order', { ascending: false })
      .limit(1)
    const orderOffset = existing?.length > 0 ? existing[0].order + 1 : 1

    setState({
      scrapbookId,
      totalClips: clips.length,
      completedClips: 0,
      failedClips: [],
      isActive: true,
    })

    const tasks = clips.map((clip, idx) => async () => {
      if (cancelledRef.current) return
      try {
        const isPhoto = clip.mediaType === 'photo'
        const remuxed = isPhoto ? clip.file : await remuxWithFaststart(clip.file)
        if (cancelledRef.current) return

        const clipId = crypto.randomUUID()
        const ext = clip.file.name.split('.').pop()?.toLowerCase() || (isPhoto ? 'jpg' : 'mp4')
        const storagePath = `${userId}/${scrapbookId}/${clipId}.${ext}`
        const publicUrl = await uploadToR2(storagePath, remuxed)

        let thumbnailUrl = isPhoto ? publicUrl : null
        if (!isPhoto && clip.thumbnail) {
          try {
            const thumbBlob = dataURLtoBlob(clip.thumbnail)
            thumbnailUrl = await uploadToR2(
              `${userId}/${scrapbookId}/${clipId}_thumb.jpg`,
              thumbBlob,
              'image/jpeg'
            )
          } catch {}
        }

        const duration = isPhoto ? (clip.duration || 5) : (clip.duration || null)
        await supabase.from('clips').insert({
          id: clipId,
          scrapbook_id: scrapbookId,
          storage_path: storagePath,
          video_url: publicUrl,
          thumbnail_url: thumbnailUrl,
          order: orderOffset + idx,
          duration,
          trim_in: 0,
          trim_out: duration,
          recorded_at: clip.date?.toISOString(),
          media_type: clip.mediaType || 'video',
        })

        setState(prev => ({ ...prev, completedClips: prev.completedClips + 1 }))
      } catch {
        setState(prev => ({ ...prev, failedClips: [...prev.failedClips, idx] }))
      }
    })

    // Concurrency-limited pool — JS single-thread makes index++ safe across workers
    let index = 0
    async function worker() {
      while (index < tasks.length) {
        const i = index++
        await tasks[i]()
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker))

    releaseWakeLock()
    setState(prev => ({ ...prev, isActive: false }))
  }

  function cancel() {
    cancelledRef.current = true
    releaseWakeLock()
    setState(prev => ({ ...prev, isActive: false }))
  }

  return (
    <UploadContext.Provider value={{ ...state, startBackgroundUpload, cancel }}>
      {children}
    </UploadContext.Provider>
  )
}

export function useUpload() {
  const ctx = useContext(UploadContext)
  if (!ctx) throw new Error('useUpload must be used within UploadProvider')
  return ctx
}
