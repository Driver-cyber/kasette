import { supabase } from './supabase'
import { deleteFromR2 } from './r2'

/**
 * Safely delete R2 files for the given clip rows.
 *
 * Before deleting anything from R2, this function queries the database to see
 * if any *other* clips (not in the set being deleted) still reference those
 * same video_url or thumbnail_url values. This happens when "Save as Scrapbook"
 * (Film Fest combine) copies clip DB rows that point to the same R2 files as
 * the source scrapbook — the original file must NOT be deleted just because the
 * source scrapbook was removed.
 *
 * Always call this instead of deleteFromR2 directly when removing clips.
 *
 * @param {Array<{id?: string, video_url?: string, thumbnail_url?: string}>} clips
 */
export async function safeDeleteClipFiles(clips) {
  if (!clips || !clips.length) return

  const deletingIds = clips.map(c => c.id).filter(Boolean)
  const videoUrls = [...new Set(clips.map(c => c.video_url).filter(Boolean))]
  // Extra thumbnail URLs that aren't already covered by videoUrls (photos have video_url === thumbnail_url)
  const extraThumbUrls = [...new Set(
    clips.map(c => c.thumbnail_url).filter(u => u && !videoUrls.includes(u))
  )]
  const allUrls = [...videoUrls, ...extraThumbUrls]
  if (allUrls.length === 0) return

  // PostgREST "not in" filter — parenthesised comma-separated UUID list
  const idFilter = deletingIds.length > 0 ? `(${deletingIds.join(',')})` : null

  // Which of these URLs are still referenced in video_url by other clips?
  let vq = supabase.from('clips').select('video_url').in('video_url', allUrls)
  if (idFilter) vq = vq.not('id', 'in', idFilter)
  const { data: refV } = await vq

  // Which of these URLs are still referenced in thumbnail_url by other clips?
  let tq = supabase.from('clips').select('thumbnail_url').in('thumbnail_url', allUrls)
  if (idFilter) tq = tq.not('id', 'in', idFilter)
  const { data: refT } = await tq

  const stillReferenced = new Set([
    ...(refV || []).map(r => r.video_url),
    ...(refT || []).map(r => r.thumbnail_url),
  ].filter(Boolean))

  const toDelete = allUrls.filter(url => !stillReferenced.has(url))
  if (toDelete.length > 0) await deleteFromR2(toDelete)
}
