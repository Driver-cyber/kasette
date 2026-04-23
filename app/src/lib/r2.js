/**
 * R2 storage helpers — all new uploads and deletes go through here.
 *
 * Requires env vars:
 *   VITE_WORKER_URL        – deployed Worker URL (no trailing slash)
 *   VITE_UPLOAD_SECRET     – shared secret matching Worker's UPLOAD_SECRET
 */

const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'https://cassette-worker.cstewch.workers.dev'
const UPLOAD_SECRET = import.meta.env.VITE_UPLOAD_SECRET
const R2_PUBLIC_URL = 'https://pub-bab6003c5bee4548b6a48fc2eca4583a.r2.dev'

async function workerFetch(path, options = {}, maxAttempts = 3) {
  let lastErr
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)))
    try {
      const res = await fetch(`${WORKER_URL}${path}`, {
        ...options,
        headers: { ...options.headers, 'X-Upload-Secret': UPLOAD_SECRET },
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        lastErr = new Error(`Worker ${path} failed (${res.status}): ${text || 'empty body'}`)
        if (res.status === 401) throw lastErr
        continue
      }
      return res.json()
    } catch (e) {
      if (e.message?.includes('Unauthorized')) throw e
      lastErr = e
    }
  }
  throw lastErr
}

/**
 * Upload a File/Blob to R2. Returns the public R2 URL.
 * Gets a presigned PUT URL from the Worker, then uploads directly to R2 —
 * bypassing the 100 MB Worker body limit entirely.
 * Requires CORS configured on the R2 bucket: AllowedMethods=[PUT], AllowedHeaders=[Content-Type].
 * @param {string} key  Storage key, e.g. `userId/scrapbookId/clipId.mp4`
 * @param {File|Blob} file
 * @param {string} [contentType]  Defaults to file.type
 * @param {(fraction: number) => void} [onProgress]  Called with 0–1 as bytes are sent
 */
export async function uploadToR2(key, file, contentType, onProgress) {
  const ct = contentType || file.type || 'application/octet-stream'

  const { uploadUrl, publicUrl } = await workerFetch('/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, contentType: ct }),
  })

  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', uploadUrl)
    xhr.setRequestHeader('Content-Type', ct)

    if (onProgress) {
      xhr.upload.addEventListener('progress', e => {
        if (e.lengthComputable) onProgress(e.loaded / e.total)
      })
    }

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
      } else {
        reject(new Error(`R2 upload failed (${xhr.status}): ${xhr.responseText || 'empty body'}`))
      }
    })

    xhr.addEventListener('error', () => reject(new Error('Network error during upload')))
    xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')))

    xhr.send(file)
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
