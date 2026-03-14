import { loadFFmpeg } from './remux'
import { fetchFile } from '@ffmpeg/util'

// exportScrapbook — trims each clip and stitches into a single MP4
// onProgress({ phase: 'fetching'|'trimming'|'stitching', current, total })
export async function exportScrapbook(clips, onProgress) {
  const ff = await loadFFmpeg()
  const total = clips.length

  // Phase 1: fetch + trim each clip one at a time to keep memory low
  for (let i = 0; i < total; i++) {
    const clip = clips[i]
    const trimIn = clip.trim_in || 0
    const trimOut = clip.trim_out || clip.duration
    const duration = trimOut - trimIn

    onProgress({ phase: 'fetching', current: i + 1, total })
    await ff.writeFile(`raw_${i}.mp4`, await fetchFile(clip.video_url))

    onProgress({ phase: 'trimming', current: i + 1, total })
    if (trimIn > 0 || (duration > 0 && duration < (clip.duration || Infinity))) {
      await ff.exec([
        '-ss', String(trimIn),
        '-i', `raw_${i}.mp4`,
        '-t', String(duration),
        '-c', 'copy',
        `clip_${i}.mp4`,
      ])
    } else {
      // No trim needed — straight copy
      await ff.exec(['-i', `raw_${i}.mp4`, '-c', 'copy', `clip_${i}.mp4`])
    }

    await ff.deleteFile(`raw_${i}.mp4`)
  }

  // Phase 2: stitch
  onProgress({ phase: 'stitching', current: total, total })
  const list = clips.map((_, i) => `file 'clip_${i}.mp4'`).join('\n')
  await ff.writeFile('list.txt', list)
  await ff.exec(['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', 'output.mp4'])

  // Read result
  const data = await ff.readFile('output.mp4')

  // Cleanup virtual FS
  for (let i = 0; i < total; i++) await ff.deleteFile(`clip_${i}.mp4`).catch(() => {})
  await ff.deleteFile('list.txt').catch(() => {})
  await ff.deleteFile('output.mp4').catch(() => {})

  return new Blob([data.buffer], { type: 'video/mp4' })
}
