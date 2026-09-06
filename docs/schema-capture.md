# Capturing the real Supabase schema

> **Why this exists:** `app/supabase-schema.sql` is a March-2026 snapshot. It
> creates 2 tables. The apps query 6 tables and 4 stored functions. Everything
> added after mid-March was typed into the Supabase SQL editor by hand and never
> written back to the repo. This doc is the procedure for fixing that.
>
> Nothing here modifies the database. Every step is read-only.

---

## What a schema dump is

The database holds two separate things:

| | What it is | Example |
|---|---|---|
| **Contents** | The actual rows | *Summer 2024*, 43 clips, this one trimmed 0.5s–8.2s |
| **Blueprint** | The structure | Which tables exist, their columns and types, and the rules for who may read what |

A **schema dump copies only the blueprint**. It asks the live database
"describe yourself" and writes the answer out as SQL — the exact commands that
would recreate an empty, identical copy.

That is what `app/supabase-schema.sql` is meant to be. It is just wrong now.

**A dump changes nothing.** It reads. It does not touch clips, does not modify
the database, does not affect the running apps. If it fails, nothing happened.

---

## What's actually missing today

Confirmed by reading call sites across `kasette/app/src` and `kasette-native/`:

**Tables absent from the file, live in the database:**
- `profiles` — username login, display names, `surprise_me_include_shared`
- `scrapbook_shares` — the entire sharing feature
- `sharing_defaults` — auto-share rules in Settings
- `film_fest_saves` — saved Film Fest filters

**Stored functions absent from the file:**
- `get_email_by_username(p_username)` — every sign-in that isn't an email
- `check_username_available(p_username)` — signup, both apps
- `get_user_id_by_username(p_username)` — Share screen, both apps
- `get_scrapbook_shares(p_scrapbook_id)` — Share screen, both apps

**Columns absent from the file:**
- `scrapbooks.year`, `scrapbooks.month` — Home's year/month grouping, Film Fest filters
- `clips.thumbnail_url` — poster frames
- `clips.cut_in`, `clips.cut_out` — the Split tool
- `clips.media_type` — photo support

**The important one — the security rules.** The file's only SELECT policy on
`clips` (line 50) permits the owner and nobody else:

```sql
CREATE POLICY "clips_select" ON clips FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM scrapbooks
    WHERE scrapbooks.id = clips.scrapbook_id
      AND scrapbooks.user_id = auth.uid()   -- owner only
  ));
```

Under that rule a shared scrapbook would return zero clips to the person it was
shared with. Sharing demonstrably works, so the live policy must also permit
reads via `scrapbook_shares` — and that policy, the rule deciding which family
member can see whose memories, exists **only inside the hosted database**. It
has never been in a commit and has never been reviewed in a diff.

**Stale content to delete while you're in there:** the three
`storage.objects` policies at the bottom of the file are dead. They govern the
`cassette-media` Supabase Storage bucket, which R2 replaced on 2026-04-15.

**One contradiction to settle:** `CLAUDE.md` records a "known gotcha" that
`clips` has a *unique* constraint on `(scrapbook_id, "order")` — the reason the
Split tool must shift orders before inserting. The schema file creates only a
plain, non-unique index. One of the two is wrong. The dump will say which.

---

## Option A — `supabase db pull` (recommended)

Uses Supabase's own CLI. One command once it's linked, and it sets up real
migration tracking so this drift can't silently recur.

```bash
# one-time setup
brew install supabase/tap/supabase
cd /path/to/kasette
supabase link --project-ref ybjbsylocgqcgghmgxeh   # prompts for the DB password

# the actual capture — read-only
supabase db pull
```

This writes `supabase/migrations/<timestamp>_remote_schema.sql` containing the
true current structure.

**Where the DB password lives:** Supabase Dashboard → Project Settings →
Database → Database password. If it was never saved anywhere, reset it there —
resetting the *database* password does not affect anyone's *app* login.

**Hand back:** the generated migration file, or just say it worked and I'll read
it from the repo.

---

## Option B — browser only, no CLI

Nothing to install, works from a phone. Paste each query into
**Supabase Dashboard → SQL Editor**, then paste the results back.

All four are read-only catalog queries — they read Postgres's own description of
itself and touch no application data.

**1 — every column in every table**

```sql
select table_name, ordinal_position, column_name, data_type,
       is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;
```

**2 — the row-level security policies (the important one)**

```sql
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

**3 — constraints and indexes** (settles the unique-constraint question)

```sql
select conrelid::regclass as table_name, conname, contype,
       pg_get_constraintdef(oid) as definition
from pg_constraint
where connamespace = 'public'::regnamespace
order by conrelid::regclass::text, conname;

select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
order by tablename, indexname;
```

**4 — the stored functions**

```sql
select p.proname, pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname;
```

**Hand back:** the output of all four. I'll assemble `app/supabase-schema.sql`
from them.

---

## After the capture

1. Replace `app/supabase-schema.sql` with the true structure.
2. Delete the dead `storage.objects` policies.
3. Reconcile the unique-constraint gotcha in `CLAUDE.md` with what the dump says.
4. Commit. The file stops being a decoy and becomes the source of truth again.

---

## Separately: a contents backup

Different job, also worth doing. This copies the *rows* — scrapbook names, trim
points, captions, share records. **Not** the videos; those live in R2.

```bash
pg_dump --data-only "$SUPABASE_DB_URL" | gzip > cassette-data-YYYY-MM-DD.sql.gz
```

The connection string is at Dashboard → Project Settings → Database → Connection
string (URI). Keep the resulting file out of git — it contains real family data.

If this runs on a schedule (the existing Cloudflare Worker could do it to R2 on a
cron), it removes the main remaining argument for staying on the Supabase Pro
plan, whose daily backups are the feature the free tier drops.
