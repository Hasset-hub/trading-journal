-- ============================================================
--  Trading Journal — Supabase schema
--  Run this once in your project's SQL Editor (Supabase dashboard).
--  Safe to re-run: everything is idempotent.
--
--  Every table is protected by Row Level Security so Postgres itself
--  guarantees each account can only ever read or write its own rows.
-- ============================================================

-- ---------- TRADES (one row per trade) ----------
create table if not exists public.trades (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- ---------- PLAYBOOKS (one row per playbook) ----------
create table if not exists public.playbooks (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- ---------- JOURNAL (one row per calendar day) ----------
create table if not exists public.journal_entries (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  day        text        not null,          -- 'YYYY-MM-DD'
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

-- ---------- SETTINGS (one row per user) ----------
create table if not exists public.settings (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (user_id)
);

-- ============================================================
--  Row Level Security — the actual privacy boundary
-- ============================================================
alter table public.trades          enable row level security;
alter table public.playbooks       enable row level security;
alter table public.journal_entries enable row level security;
alter table public.settings        enable row level security;

-- Drop-then-create so re-running the file cleanly updates policies.
drop policy if exists "own trades"    on public.trades;
drop policy if exists "own playbooks" on public.playbooks;
drop policy if exists "own journal"   on public.journal_entries;
drop policy if exists "own settings"  on public.settings;

create policy "own trades" on public.trades
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own playbooks" on public.playbooks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own journal" on public.journal_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own settings" on public.settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Helpful index for the common "everything for this user" pull.
create index if not exists trades_user_idx    on public.trades (user_id);
create index if not exists playbooks_user_idx on public.playbooks (user_id);
create index if not exists journal_user_idx   on public.journal_entries (user_id);
