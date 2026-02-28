-- ═══════════════════════════════════════════════════════
-- Cassette v1 — Supabase Schema
-- Paste this into the Supabase SQL Editor and run it.
-- ═══════════════════════════════════════════════════════

-- ── Tables ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS scrapbooks (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  cover_image_url TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clips (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  scrapbook_id   UUID        NOT NULL REFERENCES scrapbooks(id) ON DELETE CASCADE,
  storage_path   TEXT        NOT NULL,
  video_url      TEXT        NOT NULL,
  "order"        INTEGER     NOT NULL DEFAULT 0,
  trim_in        NUMERIC     NOT NULL DEFAULT 0,
  trim_out       NUMERIC,
  caption_text   TEXT,
  caption_x      NUMERIC     NOT NULL DEFAULT 50,
  caption_y      NUMERIC     NOT NULL DEFAULT 85,
  caption_size   INTEGER     NOT NULL DEFAULT 24,
  duration       NUMERIC,
  recorded_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes ─────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS scrapbooks_user_id_idx    ON scrapbooks(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS clips_scrapbook_order_idx ON clips(scrapbook_id, "order");

-- ── Row Level Security ───────────────────────────────────

ALTER TABLE scrapbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE clips      ENABLE ROW LEVEL SECURITY;

-- Scrapbooks: each user owns their own rows
CREATE POLICY "scrapbooks_select" ON scrapbooks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "scrapbooks_insert" ON scrapbooks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "scrapbooks_update" ON scrapbooks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "scrapbooks_delete" ON scrapbooks FOR DELETE USING (auth.uid() = user_id);

-- Clips: accessible through scrapbook ownership
CREATE POLICY "clips_select" ON clips FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM scrapbooks
    WHERE scrapbooks.id = clips.scrapbook_id
      AND scrapbooks.user_id = auth.uid()
  ));

CREATE POLICY "clips_insert" ON clips FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM scrapbooks
    WHERE scrapbooks.id = clips.scrapbook_id
      AND scrapbooks.user_id = auth.uid()
  ));

CREATE POLICY "clips_update" ON clips FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM scrapbooks
    WHERE scrapbooks.id = clips.scrapbook_id
      AND scrapbooks.user_id = auth.uid()
  ));

CREATE POLICY "clips_delete" ON clips FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM scrapbooks
    WHERE scrapbooks.id = clips.scrapbook_id
      AND scrapbooks.user_id = auth.uid()
  ));

-- ═══════════════════════════════════════════════════════
-- STORAGE SETUP (do this in the Supabase Dashboard)
-- ═══════════════════════════════════════════════════════
--
-- 1. Go to Storage in the Supabase Dashboard
-- 2. Create a new bucket named: cassette-media
-- 3. Set it to PUBLIC
-- 4. Then run the storage policies below:
--
-- ═══════════════════════════════════════════════════════

-- Storage policies (run AFTER creating the cassette-media bucket)

CREATE POLICY "authenticated users can upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'cassette-media');

CREATE POLICY "authenticated users can update their files"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'cassette-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "authenticated users can delete their files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'cassette-media' AND auth.uid()::text = (storage.foldername(name))[1]);
