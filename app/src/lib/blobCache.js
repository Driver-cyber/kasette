// ── Blob preload cache ──────────────────────────────────────────────────────
// Fetches video files as blobs and caches them by URL.
// Blob URLs are in-memory — zero network latency on playback.

const cache = new Map()   // videoUrl → blob URL string
const pending = new Map() // videoUrl → Promise<string>

export async function preloadClip(videoUrl) {
  if (!videoUrl) return videoUrl
  if (cache.has(videoUrl)) return cache.get(videoUrl)
  if (pending.has(videoUrl)) return pending.get(videoUrl)

  const promise = fetch(videoUrl)
    .then(r => r.blob())
    .then(blob => {
      const blobUrl = URL.createObjectURL(blob)
      cache.set(videoUrl, blobUrl)
      pending.delete(videoUrl)
      return blobUrl
    })
    .catch(() => {
      pending.delete(videoUrl)
      return videoUrl // fallback — play from URL if fetch fails
    })

  pending.set(videoUrl, promise)
  return promise
}

// Returns cached blob URL synchronously, or original URL as fallback
export function getBlob(videoUrl) {
  return cache.get(videoUrl) ?? videoUrl
}

// Preloads the first `count` clips. Returns a Promise that resolves when
// ALL requested clips are ready (use for gating the Watch transition).
export function preloadClips(clips, count = 2) {
  return Promise.all(clips.slice(0, count).map(c => preloadClip(c.video_url)))
}

// Sequentially preloads remaining clips so bandwidth stays focused on
// the next-up clip rather than all clips competing at once
export async function preloadRest(clips, startFrom = 1) {
  for (const c of clips.slice(startFrom)) {
    await preloadClip(c.video_url)
  }
}

export function clearCache() {
  for (const url of cache.values()) {
    try { URL.revokeObjectURL(url) } catch {}
  }
  cache.clear()
  pending.clear()
}
