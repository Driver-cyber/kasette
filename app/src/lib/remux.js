import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

let ffmpeg = null
let loadPromise = null

const CDN = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd'

export async function loadFFmpeg() {
  if (ffmpeg) return ffmpeg
  if (loadPromise) return loadPromise

  loadPromise = (async () => {
    const ff = new FFmpeg()
    await ff.load({
      coreURL: await toBlobURL(`${CDN}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${CDN}/ffmpeg-core.wasm`, 'application/wasm'),
    })
    ffmpeg = ff
    return ff
  })().catch((e) => {
    loadPromise = null  // allow retry next time
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
