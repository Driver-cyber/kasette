/**
 * Cassette R2 Worker
 *
 * Endpoints:
 *   POST /presign   { key, contentType } → { uploadUrl, publicUrl }
 *   DELETE /delete?key=…                → { ok: true }
 *
 * Auth: X-Upload-Secret header must match UPLOAD_SECRET env var.
 *
 * Env vars (set via `wrangler secret put`):
 *   UPLOAD_SECRET         – shared secret between frontend and worker
 *   R2_ACCOUNT_ID         – Cloudflare account ID
 *   R2_ACCESS_KEY_ID      – R2 API token access key
 *   R2_SECRET_ACCESS_KEY  – R2 API token secret key
 *   R2_BUCKET             – bucket name (cassette-media)
 *   R2_PUBLIC_URL         – public URL base (https://pub-….r2.dev)
 *
 * BUCKET binding is declared in wrangler.toml.
 */

const PRESIGN_EXPIRY_SECS = 900 // 15 minutes

// ── Crypto helpers ────────────────────────────────────────────────────────────

function toHex(buf) {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

async function hmac(key, data) {
  const k = key instanceof ArrayBuffer || ArrayBuffer.isView(key)
    ? key
    : new TextEncoder().encode(key)
  const d = typeof data === 'string' ? new TextEncoder().encode(data) : data
  const ck = await crypto.subtle.importKey('raw', k, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return crypto.subtle.sign('HMAC', ck, d)
}

async function sha256hex(str) {
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)))
}

// AWS4 percent-encoding: encode everything except A-Z a-z 0-9 - _ . ~
function awsEncode(str) {
  return encodeURIComponent(str).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
}

// ── Presigned PUT URL for R2 S3-compatible API ────────────────────────────────

async function generatePresignedPut(key, contentType, env) {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = env
  const region = 'auto'
  const service = 's3'

  const now = new Date()
  // YYYYMMDD
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '')
  // YYYYMMDDTHHmmssZ
  const datetimeStr = dateStr + 'T' + now.toISOString().slice(11, 19).replace(/:/g, '') + 'Z'

  const host = `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
  const credScope = `${dateStr}/${region}/${service}/aws4_request`

  // Encode each path segment of the key (don't encode the separating /)
  const encodedKey = key.split('/').map(awsEncode).join('/')
  const canonicalUri = `/${R2_BUCKET}/${encodedKey}`

  // Query parameters must be sorted lexicographically by name
  const qpairs = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${R2_ACCESS_KEY_ID}/${credScope}`],
    ['X-Amz-Date', datetimeStr],
    ['X-Amz-Expires', String(PRESIGN_EXPIRY_SECS)],
    ['X-Amz-SignedHeaders', 'host'],
  ].sort(([a], [b]) => (a < b ? -1 : 1))

  const canonicalQS = qpairs.map(([k, v]) => `${awsEncode(k)}=${awsEncode(v)}`).join('&')

  const canonicalRequest = [
    'PUT',
    canonicalUri,
    canonicalQS,
    `host:${host}\n`, // canonical headers (must end with \n)
    'host',           // signed headers
    'UNSIGNED-PAYLOAD',
  ].join('\n')

  const crHash = await sha256hex(canonicalRequest)
  const stringToSign = ['AWS4-HMAC-SHA256', datetimeStr, credScope, crHash].join('\n')

  // Derive signing key: HMAC(HMAC(HMAC(HMAC("AWS4"+secret, date), region), service), "aws4_request")
  const kDate    = await hmac(`AWS4${R2_SECRET_ACCESS_KEY}`, dateStr)
  const kRegion  = await hmac(kDate, region)
  const kService = await hmac(kRegion, service)
  const kSigning = await hmac(kService, 'aws4_request')
  const sig      = toHex(await hmac(kSigning, stringToSign))

  return `https://${host}${canonicalUri}?${canonicalQS}&X-Amz-Signature=${sig}`
}

// ── CORS headers ──────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Upload-Secret',
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function err(msg, status = 400) {
  return new Response(msg, { status, headers: CORS })
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS })
    }

    // Auth
    if (request.headers.get('X-Upload-Secret') !== env.UPLOAD_SECRET) {
      return err('Unauthorized', 401)
    }

    // POST /presign
    if (request.method === 'POST' && url.pathname === '/presign') {
      let body
      try { body = await request.json() } catch { return err('Invalid JSON') }
      const { key, contentType } = body
      if (!key) return err('key required')

      const uploadUrl = await generatePresignedPut(key, contentType, env)
      const publicUrl = `${env.R2_PUBLIC_URL}/${key}`
      return json({ uploadUrl, publicUrl })
    }

    // DELETE /delete?key=…
    if (request.method === 'DELETE' && url.pathname === '/delete') {
      const key = url.searchParams.get('key')
      if (!key) return err('key required')

      await env.BUCKET.delete(key)
      return json({ ok: true })
    }

    return err('Not found', 404)
  },
}
