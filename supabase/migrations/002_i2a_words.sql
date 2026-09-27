-- Room Repeater · migration 002 · I2a custom words (spec-i2a §Data)
-- Table: custom_words (per child; built-in on/off lives in children.settings.off, no schema change)
-- Run as the project owner in Supabase Dashboard → SQL Editor AFTER 001 (paste whole file, Run).
-- Re-runnable like 001: IF NOT EXISTS, CREATE OR REPLACE, drop-and-recreate triggers/policies,
-- revoke-then-grant. Changing a column or CHECK later needs 003_…, not an edit of this file.
--
-- Security / sync model:
--   * RLS on; policies scoped via children.user_id = auth.uid(), like turns (001).
--   * No DELETE for users: a word is removed by setting deleted = true (tombstone, final).
--     Rows go away only with the child (ON DELETE CASCADE) → I3 delete_my_account covers it.
--   * Client pushes with supabase-js upsert(rows, {onConflict:'id'}) = INSERT … ON CONFLICT (id)
--     DO UPDATE SET <every column in the payload>. PostgREST puts id and child_id into that SET list,
--     so both are GRANTed for UPDATE; the trigger rejects any real change of them.
--   * Last write wins by the client's changed_at (clamped to server now + 5 min). An older write is
--     skipped silently (0 rows, no error) — except a delete, which always wins (keeps the stored
--     texts and changed_at, sets deleted = true). A tombstone ignores every later write.
--   * Limit: at most 30 rows with deleted = false per child. Violation raises
--     SQLSTATE P0001 with message 'custom_words_limit' → the client maps it to {error:'limit'}.
--   * created_at / updated_at are server time (trigger) and not granted; updated_at is the pull cursor.

begin;

-- ---------------------------------------------------------------- helpers
-- Server-side subset of spec-i2a R8 (the client is stricter): trimmed, 1–30 code points,
-- no control characters, none of < > & " |.
create or replace function public.rr_word_text_ok(t text)
returns boolean language sql immutable set search_path = '' as $$
  select t is null
      or (char_length(t) between 1 and 30
          and t = btrim(t)
          and t !~ '[[:cntrl:]<>&"|]')
$$;

-- ---------------------------------------------------------------- custom_words
create table if not exists public.custom_words (
  id         uuid primary key,                                   -- client uuid(); game id is 'cw-'||id
  child_id   uuid not null references public.children(id) on delete cascade,
  emoji      text not null
               check (char_length(emoji) between 1 and 16          -- client restricts to CUSTOM_EMOJI (48)
                      and emoji !~ '[\x01-\x7F]'),                 -- no ASCII at all: no markup, spaces, controls
  en         text check (public.rr_word_text_ok(en)),
  de         text check (public.rr_word_text_ok(de)),
  es         text check (public.rr_word_text_ok(es)),
  enabled    boolean not null default true,
  deleted    boolean not null default false,
  changed_at timestamptz not null default now(),                 -- client clock, last-write-wins
  created_at timestamptz not null default now(),                 -- server clock
  updated_at timestamptz not null default now(),                 -- server clock, pull cursor
  constraint custom_words_has_text check (coalesce(en, de, es) is not null)
);
create index if not exists custom_words_child_updated_idx on public.custom_words (child_id, updated_at);
create index if not exists custom_words_child_live_idx on public.custom_words (child_id) where not deleted;

create or replace function public.rr_custom_words_before_write()
returns trigger language plpgsql set search_path = '' as $$
declare
  live int;
begin
  new.changed_at := least(coalesce(new.changed_at, now()), now() + interval '5 minutes');

  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
    -- BEFORE INSERT also fires for an upsert that will turn into an UPDATE (ON CONFLICT);
    -- only a genuinely new, live row counts against the limit.
    if not new.deleted
       and not exists (select 1 from public.custom_words w where w.id = new.id) then
      perform pg_advisory_xact_lock(hashtextextended('rr_custom_words:' || new.child_id::text, 0));
      select count(*) into live from public.custom_words w
        where w.child_id = new.child_id and not w.deleted;
      if live >= 30 then
        raise exception 'custom_words_limit' using errcode = 'P0001',
          detail = 'At most 30 non-deleted custom words per child.';
      end if;
    end if;
    return new;
  end if;

  -- UPDATE
  if new.id is distinct from old.id or new.child_id is distinct from old.child_id then
    raise exception 'custom_words_immutable' using errcode = '42501',
      detail = 'id and child_id cannot change.';
  end if;
  if old.deleted then
    return null;                                    -- tombstone is final: ignore silently
  end if;
  if new.changed_at < old.changed_at then
    if new.deleted then                             -- a late delete still wins, content stays
      new.emoji := old.emoji; new.en := old.en; new.de := old.de; new.es := old.es;
      new.enabled := old.enabled; new.changed_at := old.changed_at;
    else
      return null;                                  -- older write: skip this row
    end if;
  end if;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists rr_custom_words_before_write on public.custom_words;
create trigger rr_custom_words_before_write before insert or update on public.custom_words
  for each row execute function public.rr_custom_words_before_write();

-- ---------------------------------------------------------------- RLS
alter table public.custom_words enable row level security;

drop policy if exists custom_words_select_own on public.custom_words;
create policy custom_words_select_own on public.custom_words for select to authenticated
  using (child_id in (select c.id from public.children c where c.user_id = (select auth.uid())));
drop policy if exists custom_words_insert_own on public.custom_words;
create policy custom_words_insert_own on public.custom_words for insert to authenticated
  with check (child_id in (select c.id from public.children c where c.user_id = (select auth.uid())));
drop policy if exists custom_words_update_own on public.custom_words;
create policy custom_words_update_own on public.custom_words for update to authenticated
  using (child_id in (select c.id from public.children c where c.user_id = (select auth.uid())))
  with check (child_id in (select c.id from public.children c where c.user_id = (select auth.uid())));
-- no DELETE policy (and no DELETE grant): tombstones only

-- ---------------------------------------------------------------- privileges (column-level)
revoke all on public.custom_words from anon, authenticated;
grant select on public.custom_words to authenticated;
grant insert (id, child_id, emoji, en, de, es, enabled, deleted, changed_at) on public.custom_words to authenticated;
grant update (id, child_id, emoji, en, de, es, enabled, deleted, changed_at) on public.custom_words to authenticated;

commit;
