// ── Scrapbook data cache ────────────────────────────────────────────────────
// Stores scrapbook + clips fetched by ScrapbookDetailScreen so that
// WorkspaceScreen and PlaybackScreen can render instantly without a loading
// spinner when navigating from the detail screen.

const cache = new Map() // scrapbookId → { scrapbook, clips }
const MAX_ENTRIES = 10

export function cacheScrapbook(id, scrapbook, clips) {
  // Evict oldest entry when at capacity (Map preserves insertion order)
  if (!cache.has(id) && cache.size >= MAX_ENTRIES) {
    cache.delete(cache.keys().next().value)
  }
  cache.set(id, { scrapbook, clips })
}

export function getCached(id) {
  return cache.get(id) ?? null
}
