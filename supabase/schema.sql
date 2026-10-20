-- Dialog AI cloud call history.
-- Run in the Supabase SQL editor. Uses the signed-in user's JWT and RLS; never use a service-role key in the browser.

create extension if not exists pgcrypto;

create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  prospect text not null default '',
  company text not null default '',
  outcome text not null default 'Follow-up',
  stage integer not null default 1 check (stage between 1 and 8),
  duration text not null default '',
  transcript jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists calls_user_created_at_idx
  on public.calls (user_id, created_at desc);

alter table public.calls enable row level security;

drop policy if exists "Users can read their own calls" on public.calls;
create policy "Users can read their own calls"
  on public.calls for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own calls" on public.calls;
create policy "Users can insert their own calls"
  on public.calls for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own calls" on public.calls;
create policy "Users can delete their own calls"
  on public.calls for delete
  using (auth.uid() = user_id);
