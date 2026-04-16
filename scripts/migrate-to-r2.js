/**
 * migrate-to-r2.js
 *
 * Copies all Cassette media files from Supabase Storage → Cloudflare R2.
 * Generates migration-mapping.json and migration-update.sql but does NOT
 * run the SQL — that's Checkpoint 3 (done separately after verifying).
 *
 * Usage:
 *   node migrate-to-r2.js            # real migration
 *   node migrate-to-r2.js --dry-run  # preview only, no files moved
 *
 * Setup:
 *   cp .env.example .env
 *   # fill in .env
 *   npm install
 *   node migrate-to-r2.js --dry-run
 */

import { createClient } from '@supabase/supabase-js'
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { writeFileSync } from 'fs'
import dotenv from 'dotenv'

dotenv.config()

// ── Config ───────────────────────────────────────────────────────────────────

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET = 'cassette-media',
  R2_PUBLIC_URL,
} = process.env

for (const [k, v] of Object.entries({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_URL })) {
  if (!v) { console.error(`Missing env var: ${k}`); process.exit(1) }
}

const DRY_RUN = process.argv.includes('--dry-run')

// ── Clients ──────────────────────────────────────────────────────────────────

// Service role key — bypasses RLS so we can read all users' data
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
})

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract the storage path from a Supabase public URL.
 * e.g. https://xyz.supabase.co/storage/v1/object/public/cassette-media/uid/sbid/clip.mp4
 *   → uid/sbid/clip.mp4
 * Also strips any ?v=timestamp cache-buster query string first.
 */
function extractStoragePath(url) {
  if (!url) return null
  const clean = url.split('?')[0]
  const marker = 'cassette-media/'
  const idx = clean.indexOf(marker)
  return idx >= 0 ? clean.slice(idx + marker.length) : null
}

function r2Url(path) {
  return `${R2_PUBLIC_URL}/${path}`
}

function contentTypeFor(path) {
  const lower = path.toLowerCase()
  if (lower.endsWith('.mp4')) return 'video/mp4'
  if (lower.endsWith('.mov')) return 'video/quicktime'
  if (lower.endsWith('.webm')) return 'video/webm'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.png')) return 'image/png'
  return 'application/octet-stream'
}

async function existsInR2(path) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: path }))
    return true
  } catch {
    return false
  }
}

/**
 * Download one file from Supabase Storage and upload it to R2.
 * Returns the new R2 public URL, or null on failure.
 * Skips (and returns R2 URL) if the file already exists in R2.
 */
async function migrateFile(storagePath) {
  if (DRY_RUN) {
    console.log(`  [dry-run] ${storagePath}`)
    return r2Url(storagePath)
  }

  if (await existsInR2(storagePath)) {
    console.log(`  ✓ skip (already in R2): ${storagePath}`)
    return r2Url(storagePath)
  }

  const { data, error } = await supabase.storage.from('cassette-media').download(storagePath)
  if (error) {
    console.error(`  ✗ download failed: ${storagePath} — ${error.message}`)
    return null
  }

  const buffer = Buffer.from(await data.arrayBuffer())
  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: storagePath,
    Body: buffer,
    ContentType: contentTypeFor(storagePath),
  }))

  console.log(`  ✓ migrated: ${storagePath}`)
  return r2Url(storagePath)
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(DRY_RUN
    ? '🔍  DRY RUN — no files will be moved\n'
    : '🚀  Starting Supabase → R2 migration\n')

  // ── 1. Fetch all clips (all users via service role) ──────────────────────
  const { data: clips, error: clipsErr } = await supabase
    .from('clips')
    .select('id, video_url, thumbnail_url, storage_path')
  if (clipsErr) throw clipsErr

  // ── 2. Fetch all scrapbooks with a cover ────────────────────────────────
  const { data: scrapbooks, error: sbErr } = await supabase
    .from('scrapbooks')
    .select('id, cover_image_url')
    .not('cover_image_url', 'is', null)
  if (sbErr) throw sbErr

  console.log(`Clips found:     ${clips.length}`)
  console.log(`Scrapbook covers: ${scrapbooks.length}\n`)

  const mapping = {}   // old_url (no query string) → new R2 url
  const failures = []

  // ── 3. Clip videos ───────────────────────────────────────────────────────
  console.log('── Clip videos ──────────────────────────────────────────────')
  for (const clip of clips) {
    if (!clip.video_url) continue
    const path = extractStoragePath(clip.video_url)
    if (!path) { console.warn(`  ⚠ can't extract path: ${clip.video_url}`); continue }
    const newUrl = await migrateFile(path)
    if (newUrl) mapping[clip.video_url.split('?')[0]] = newUrl
    else failures.push({ type: 'video', clipId: clip.id, path })
  }

  // ── 4. Thumbnails ────────────────────────────────────────────────────────
  console.log('\n── Thumbnails ───────────────────────────────────────────────')
  for (const clip of clips) {
    if (!clip.thumbnail_url) continue
    const path = extractStoragePath(clip.thumbnail_url)
    if (!path) continue
    const newUrl = await migrateFile(path)
    if (newUrl) mapping[clip.thumbnail_url.split('?')[0]] = newUrl
    else failures.push({ type: 'thumbnail', clipId: clip.id, path })
  }

  // ── 5. Scrapbook covers ──────────────────────────────────────────────────
  console.log('\n── Scrapbook covers ─────────────────────────────────────────')
  for (const sb of scrapbooks) {
    if (!sb.cover_image_url) continue
    const cleanUrl = sb.cover_image_url.split('?')[0]
    const path = extractStoragePath(cleanUrl)
    if (!path) { console.warn(`  ⚠ can't extract path: ${sb.cover_image_url}`); continue }
    const newUrl = await migrateFile(path)
    if (newUrl) mapping[cleanUrl] = newUrl
    else failures.push({ type: 'cover', scrapbookId: sb.id, path })
  }

  // ── 6. Write mapping JSON ────────────────────────────────────────────────
  const mappingCount = Object.keys(mapping).length
  writeFileSync('migration-mapping.json', JSON.stringify(mapping, null, 2))
  console.log(`\n✅  migration-mapping.json written (${mappingCount} files)`)

  // ── 7. Generate SQL ──────────────────────────────────────────────────────
  const sql = buildSQL(clips, scrapbooks, mapping)
  writeFileSync('migration-update.sql', sql)
  console.log(`✅  migration-update.sql written`)

  // ── 8. Report failures ───────────────────────────────────────────────────
  if (failures.length) {
    writeFileSync('migration-failures.json', JSON.stringify(failures, null, 2))
    console.error(`\n⚠  ${failures.length} failure(s) — see migration-failures.json`)
    failures.forEach(f => console.error('   ', JSON.stringify(f)))
  } else if (!DRY_RUN) {
    console.log('\n🎉  All files migrated successfully!')
  }

  if (DRY_RUN) {
    console.log('\n(remove --dry-run to actually run the migration)')
  }

  console.log('\nNext step (Checkpoint 3):')
  console.log('  1. Verify migration-mapping.json looks correct')
  console.log('  2. Make a Supabase DB backup')
  console.log('  3. Run migration-update.sql in the Supabase SQL editor')
  console.log('  4. Test video playback and thumbnails in the app')
}

function buildSQL(clips, scrapbooks, mapping) {
  const lines = [
    '-- ═══════════════════════════════════════════════════════',
    '-- Cassette — R2 migration URL update',
    '-- Generated by migrate-to-r2.js',
    '--',
    '-- ⚠  Make a Supabase DB backup before running this.',
    '-- ⚠  Run ONLY after verifying migration-mapping.json.',
    '-- ═══════════════════════════════════════════════════════',
    '',
  ]

  // Clip video URLs
  const videoUpdates = clips.filter(c => c.video_url && mapping[c.video_url.split('?')[0]])
  if (videoUpdates.length) {
    lines.push('-- Clip video URLs')
    for (const clip of videoUpdates) {
      const newUrl = mapping[clip.video_url.split('?')[0]]
      lines.push(`UPDATE clips SET video_url = '${newUrl}' WHERE id = '${clip.id}';`)
    }
    lines.push('')
  }

  // Clip thumbnail URLs
  const thumbUpdates = clips.filter(c => c.thumbnail_url && mapping[c.thumbnail_url.split('?')[0]])
  if (thumbUpdates.length) {
    lines.push('-- Clip thumbnail URLs')
    for (const clip of thumbUpdates) {
      const newUrl = mapping[clip.thumbnail_url.split('?')[0]]
      lines.push(`UPDATE clips SET thumbnail_url = '${newUrl}' WHERE id = '${clip.id}';`)
    }
    lines.push('')
  }

  // Scrapbook cover URLs
  // Note: covers are stored with a ?v=timestamp cache-buster — the new R2 URL
  // does not need one since R2 serves fresh content by path, not by query param.
  const coverUpdates = scrapbooks.filter(sb => {
    const clean = sb.cover_image_url?.split('?')[0]
    return clean && mapping[clean]
  })
  if (coverUpdates.length) {
    lines.push('-- Scrapbook cover URLs (cache-buster query string removed)')
    for (const sb of coverUpdates) {
      const clean = sb.cover_image_url.split('?')[0]
      const newUrl = mapping[clean]
      lines.push(`UPDATE scrapbooks SET cover_image_url = '${newUrl}' WHERE id = '${sb.id}';`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
