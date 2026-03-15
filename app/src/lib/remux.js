import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'

let ffmpeg = null
let loadPromise = null

const FFMPEG_BASE = 'https://ybjbsylocgqcgghmgxeh.supabase.co/storage/v1/object/public/cassette-media/ffmpeg'

// toBlobURL but with explicit CORS mode — COEP:credentialless makes default fetches
// return opaque responses (empty body), so the blob ends up empty and importScripts fails.
async function fetchToBlobURL(url, mimeType) {
  const res = await fetch(url, { mode: 'cors', credentials: 'omit' })
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`)
  const buf = await res.arrayBuffer()
  console.log('[ffmpeg] fetched', url.split('/').pop(), buf.byteLength, 'bytes')
  return URL.createObjectURL(new Blob([buf], { type: mimeType }))
}

export async function loadFFmpeg() {
  if (ffmpeg) return ffmpeg
  if (loadPromise) return loadPromise

  loadPromise = (async () => {
    const coreURL = await fetchToBlobURL(`${FFMPEG_BASE}/ffmpeg-core.js`, 'text/javascript')
    const wasmURL = await fetchToBlobURL(`${FFMPEG_BASE}/ffmpeg-core.wasm`, 'application/wasm')
    const ff = new FFmpeg()
    ff.on('log', ({ message }) => console.log('[ffmpeg worker]', message))
    await ff.load({ coreURL, wasmURL })
    console.log('[ffmpeg] loaded successfully!')
    ffmpeg = ff
    return ff
  })().catch((e) => {
    console.error('[ffmpeg] load failed:', e)
    loadPromise = null
    throw e
  })

  return loadPromise
}

export async function remuxWithFaststart(file) {
  try {
    if (!ffmpeg) return file  // not loaded — upload original as fallback

    const ext = file.name.split('.').pop()?.toLowerCase() || 'mov'
    const inputName = `input.${ext}`
    const outputName = 'output.mp4'

    await ffmpeg.writeFile(inputName, await fetchFile(file))
    await ffmpeg.exec(['-i', inputName, '-c', 'copy', '-movflags', '+faststart', outputName])
    const data = await ffmpeg.readFile(outputName)
    await ffmpeg.deleteFile(inputName)
    await ffmpeg.deleteFile(outputName)

    return new File([data.buffer], 'video.mp4', { type: 'video/mp4' })
  } catch (e) {
    console.warn('[remux] Failed, uploading original:', e)
    return file
  }
}
