// ── Scrapbook data cache ────────────────────────────────────────────────────
// Stores scrapbook + clips fetched by ScrapbookDetailScreen so that
// WorkspaceScreen and PlaybackScreen can render instantly without a loading
// spinner when navigating from the detail screen.

const cache = new Map() // scrapbookId → { scrapbook, clips }

export function cacheScrapbook(id, scrapbook, clips) {
  cache.set(id, { scrapbook, clips })
}

export function getCached(id) {
  return cache.get(id) ?? null
}
