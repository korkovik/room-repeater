-- Room Repeater · migration 001 · I1 Accounts core
-- Tables: profiles, children, turns, gifts, dropped  (child_words comes in I2, delete_my_account in I3)
-- Run as the project owner in Supabase Dashboard → SQL Editor (paste whole file, Run).
-- Re-runnable: tables use IF NOT EXISTS, functions CREATE OR REPLACE, triggers/policies are dropped
-- and recreated, grants are revoked and re-granted. Changing a column or CHECK on an existing table
-- needs a new migration (002_…), not an edit of this file.
--
-- Security model (security-notes.md S1, S2):
--   * RLS enabled on every table; every policy is scoped to auth.uid(), directly (profiles, children)
--     or via children.user_id (turns, gifts, dropped).
--   * The anon role gets nothing. The authenticated role gets only the columns and verbs the app needs
--     (column-level GRANTs), so asr_allowed, accepted_at, created_at and updated_at are server-owned.
--   * turns / gifts / dropped are append-only for users (no UPDATE, no DELETE) → the client pushes with
--     INSERT … ON CONFLICT DO NOTHING (supabase-js: upsert(rows, {onConflict, ignoreDuplicates:true})),
--     which is idempotent on the client-generated uuid.
--   * Profiles are created by a trigger when Tom invites a user; users can only set
--     accepted_terms_version (accepted_at is stamped by the server).

begin;

create extension if not exists pgcrypto;  -- gen_random_uuid() (built into PG13+, kept for safety)

-- ---------------------------------------------------------------- helpers
create or replace function public.rr_touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then new.created_at := now(); else new.created_at := old.created_at; end if;
  return new;
end $$;

create or replace function public.rr_stamp_created_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.created_at := now();  -- server time only: the pull cursor must not trust client clocks
  return new;
end $$;

-- ---------------------------------------------------------------- profiles
create table if not exists public.profiles (
  user_id                uuid primary key references auth.users(id) on delete cascade,
  accepted_terms_version text check (accepted_terms_version is null or char_length(accepted_terms_version) between 1 and 40),
  accepted_at            timestamptz,
  asr_allowed            boolean not null default false,   -- admin-only (Tom, Table Editor); M10
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create or replace function public.rr_profiles_before_write()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.accepted_at := case when new.accepted_terms_version is null then null else now() end;
  else
    new.created_at := old.created_at;
    if new.accepted_terms_version is distinct from old.accepted_terms_version then
      new.accepted_at := case when new.accepted_terms_version is null then null else now() end;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists rr_profiles_before_write on public.profiles;
create trigger rr_profiles_before_write before insert or update on public.profiles
  for each row execute function public.rr_profiles_before_write();

-- One profile row per auth user, created when Tom invites the user (auth.users insert).
create or replace function public.rr_handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end $$;
revoke all on function public.rr_handle_new_user() from public, anon, authenticated;

drop trigger if exists rr_on_auth_user_created on auth.users;
create trigger rr_on_auth_user_created after insert on auth.users
  for each row execute function public.rr_handle_new_user();

-- Backfill users invited before this migration ran.
insert into public.profiles (user_id) select id from auth.users on conflict (user_id) do nothing;

-- ---------------------------------------------------------------- children
create table if not exists public.children (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nickname            text not null
                        check (char_length(nickname) between 1 and 20      -- code points, = [...s].length
                               and nickname = btrim(nickname)
                               and nickname !~ '[[:cntrl:]]'),
  languages           text[] not null default array['en','de','es']
                        check (cardinality(languages) between 1 and 3 and languages <@ array['en','de','es']),
  settings            jsonb not null default '{}'::jsonb
                        check (jsonb_typeof(settings) = 'object' and pg_column_size(settings) <= 4096),
  settings_updated_at timestamptz not null default now(),  -- client clock, for last-write-wins
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(), -- server clock, for pull cursor
  constraint children_one_per_user unique (user_id)
);

-- Last write wins on settings by the client's settings_updated_at (clamped to server now + 5 min);
-- an older offline write arriving late does not overwrite a newer one.
create or replace function public.rr_children_before_write()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.settings_updated_at := least(coalesce(new.settings_updated_at, now()), now() + interval '5 minutes');
  if tg_op = 'UPDATE' and new.settings_updated_at < old.settings_updated_at then
    new.settings := old.settings;
    new.languages := old.languages;
    new.settings_updated_at := old.settings_updated_at;
  end if;
  return new;
end $$;

drop trigger if exists rr_children_before_write on public.children;
create trigger rr_children_before_write before insert or update on public.children
  for each row execute function public.rr_children_before_write();
drop trigger if exists rr_children_touch on public.children;
create trigger rr_children_touch before insert or update on public.children
  for each row execute function public.rr_touch_updated_at();

-- ---------------------------------------------------------------- turns (append-only)
create table if not exists public.turns (
  id         uuid primary key,                       -- client crypto.randomUUID() / import uuidFromHash
  child_id   uuid not null references public.children(id) on delete cascade,
  day        text not null check (day ~ '^\d{4}-\d{2}-\d{2}$'),
  ts         text not null check (ts ~ '^\d{2}:\d{2}:\d{2}$'),
  obj        text not null check (char_length(obj) between 1 and 64),
  lang       text not null check (lang in ('en','de','es')),
  result     text not null check (result in ('said','missed')),
  judge      text not null check (judge in ('asr','parent')),
  created_at timestamptz not null default now()
);
create index if not exists turns_child_created_idx on public.turns (child_id, created_at);

drop trigger if exists rr_turns_stamp on public.turns;
create trigger rr_turns_stamp before insert on public.turns
  for each row execute function public.rr_stamp_created_at();

-- ---------------------------------------------------------------- gifts (earned animals, append-only)
create table if not exists public.gifts (
  id         uuid primary key,                       -- client uuid (S.earned[i].id after A7 rename)
  child_id   uuid not null references public.children(id) on delete cascade,
  day        text not null check (day ~ '^\d{4}-\d{2}-\d{2}$'),
  animal     text not null check (char_length(animal) between 1 and 32),
  created_at timestamptz not null default now()
);
create index if not exists gifts_child_created_idx on public.gifts (child_id, created_at);

drop trigger if exists rr_gifts_stamp on public.gifts;
create trigger rr_gifts_stamp before insert on public.gifts
  for each row execute function public.rr_stamp_created_at();

-- ---------------------------------------------------------------- dropped (obj|lang pairs, set)
create table if not exists public.dropped (
  child_id   uuid not null references public.children(id) on delete cascade,
  pair_key   text not null check (char_length(pair_key) between 3 and 80 and pair_key ~ '^[^|]+\|(en|de|es)$'),
  created_at timestamptz not null default now(),
  primary key (child_id, pair_key)
);
create index if not exists dropped_child_created_idx on public.dropped (child_id, created_at);

drop trigger if exists rr_dropped_stamp on public.dropped;
create trigger rr_dropped_stamp before insert on public.dropped
  for each row execute function public.rr_stamp_created_at();

-- ---------------------------------------------------------------- RLS
alter table public.profiles enable row level security;
alter table public.children enable row level security;
alter table public.turns    enable row level security;
alter table public.gifts    enable row level security;
alter table public.dropped  enable row level security;

-- profiles: read + update own row (insert is done by the trigger, delete in I3)
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- children: read, create, update own (one per user via unique constraint)
drop policy if exists children_select_own on public.children;
create policy children_select_own on public.children for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists children_insert_own on public.children;
create policy children_insert_own on public.children for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists children_update_own on public.children;
create policy children_update_own on public.children for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- turns / gifts / dropped: read + insert rows of own child
drop policy if exists turns_select_own on public.turns;
create policy turns_select_own on public.turns for select to authenticated
  using (child_id in (select c.id from public.children c where c.user_id = (select auth.uid())));
drop policy if exists turns_insert_own on public.turns;
create policy turns_insert_own on public.turns for insert to authenticated
  with check (child_id in (select c.id from public.children c where c.user_id = (select auth.uid())));

drop policy if exists gifts_select_own on public.gifts;
create policy gifts_select_own on public.gifts for select to authenticated
  using (child_id in (select c.id from public.children c where c.user_id = (select auth.uid())));
drop policy if exists gifts_insert_own on public.gifts;
create policy gifts_insert_own on public.gifts for insert to authenticated
  with check (child_id in (select c.id from public.children c where c.user_id = (select auth.uid())));

drop policy if exists dropped_select_own on public.dropped;
create policy dropped_select_own on public.dropped for select to authenticated
  using (child_id in (select c.id from public.children c where c.user_id = (select auth.uid())));
drop policy if exists dropped_insert_own on public.dropped;
create policy dropped_insert_own on public.dropped for insert to authenticated
  with check (child_id in (select c.id from public.children c where c.user_id = (select auth.uid())));

-- ---------------------------------------------------------------- privileges (column-level)
-- Supabase grants ALL on new public tables to anon/authenticated by default; take it back.
revoke all on public.profiles, public.children, public.turns, public.gifts, public.dropped from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (accepted_terms_version) on public.profiles to authenticated;   -- NOT asr_allowed

grant select on public.children to authenticated;
grant insert (id, user_id, nickname, languages, settings, settings_updated_at) on public.children to authenticated;
grant update (languages, settings, settings_updated_at) on public.children to authenticated;  -- nickname fixed in I1

grant select on public.turns to authenticated;
grant insert (id, child_id, day, ts, obj, lang, result, judge) on public.turns to authenticated;
grant select on public.gifts to authenticated;
grant insert (id, child_id, day, animal) on public.gifts to authenticated;
grant select on public.dropped to authenticated;
grant insert (child_id, pair_key) on public.dropped to authenticated;

commit;
