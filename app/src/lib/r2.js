/**
 * R2 storage helpers — all new uploads and deletes go through here.
 *
 * Requires env vars:
 *   VITE_WORKER_URL        – deployed Worker URL (no trailing slash)
 *   VITE_UPLOAD_SECRET     – shared secret matching Worker's UPLOAD_SECRET
 */

const WORKER_URL = import.meta.env.VITE_WORKER_URL
const UPLOAD_SECRET = import.meta.env.VITE_UPLOAD_SECRET
const R2_PUBLIC_URL = 'https://pub-bab6003c5bee4548b6a48fc2eca4583a.r2.dev'

async function workerFetch(path, options = {}) {
  const res = await fetch(`${WORKER_URL}${path}`, {
    ...options,
    headers: {
      ...options.headers,
      'X-Upload-Secret': UPLOAD_SECRET,
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.status)
    throw new Error(`Worker ${path} failed: ${text}`)
  }
  return res.json()
}

/**
 * Upload a File/Blob to R2 via the Worker. Returns the public R2 URL.
 * The Worker streams the body directly into R2 using its bucket binding,
 * avoiding any CORS issues with R2's S3-compatible API.
 * @param {string} key  Storage key, e.g. `userId/scrapbookId/clipId.mp4`
 * @param {File|Blob} file
 * @param {string} [contentType]  Defaults to file.type
 */
export async function uploadToR2(key, file, contentType) {
  const ct = contentType || file.type || 'application/octet-stream'

  const { publicUrl } = await workerFetch(`/upload?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': ct },
    body: file,
  })

  return publicUrl
}

/**
 * Delete one or more files from R2. Accepts full R2 URLs or plain keys.
 * Silently skips items that look like non-R2 URLs to avoid breaking on
 * any legacy Supabase Storage URLs still in the database.
 * @param {string|string[]} urls  Full R2 public URLs or storage keys
 */
export async function deleteFromR2(urls) {
  const arr = Array.isArray(urls) ? urls : [urls]

  const keys = arr.map(u => {
    if (!u) return null
    // Strip query string
    const clean = u.split('?')[0]
    // Full R2 public URL
    if (clean.includes(R2_PUBLIC_URL)) {
      return clean.slice(R2_PUBLIC_URL.length + 1) // drop leading /
    }
    // Already a plain key (no scheme)
    if (!clean.startsWith('http')) {
      return clean
    }
    // Unknown URL format — skip
    return null
  }).filter(Boolean)

  await Promise.all(
    keys.map(key =>
      workerFetch(`/delete?key=${encodeURIComponent(key)}`, { method: 'DELETE' })
        .catch(e => console.warn('R2 delete failed (non-blocking):', key, e))
    )
  )
}
