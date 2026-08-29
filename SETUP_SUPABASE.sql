-- Run this entire file once in Supabase -> SQL Editor.
-- It creates the database tables, admin role system and Row Level Security.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.levels (
  id uuid primary key default gen_random_uuid(),
  position integer not null default 1 check (position >= 1),
  name text not null,
  creators text not null default '',
  publisher text not null default '',
  verifier text not null default '',
  verification_video text not null default '',
  points integer not null default 0 check (points >= 0),
  enjoyability numeric(3,1) not null default 0 check (enjoyability >= 0 and enjoyability <= 10),
  gd_id text not null default 'N/A',
  ldm_id text not null default 'N/A',
  created_at timestamptz not null default now()
);

create table if not exists public.victors (
  id uuid primary key default gen_random_uuid(),
  level_id uuid not null references public.levels(id) on delete cascade,
  name text not null,
  video text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists levels_position_idx on public.levels(position);
create index if not exists victors_level_id_idx on public.victors(level_id);

-- Automatically create a normal profile for each Auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, role)
  values (new.id, 'user')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Backfill profiles for Auth users that already exist.
insert into public.profiles (id, role)
select id, 'user' from auth.users
on conflict (id) do nothing;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

alter table public.profiles enable row level security;
alter table public.levels enable row level security;
alter table public.victors enable row level security;

-- Remove older policies with the same names if you rerun this file.
drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Public can read levels" on public.levels;
drop policy if exists "Admins can insert levels" on public.levels;
drop policy if exists "Admins can update levels" on public.levels;
drop policy if exists "Admins can delete levels" on public.levels;
drop policy if exists "Public can read victors" on public.victors;
drop policy if exists "Admins can insert victors" on public.victors;
drop policy if exists "Admins can update victors" on public.victors;
drop policy if exists "Admins can delete victors" on public.victors;

create policy "Users can read own profile"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

create policy "Public can read levels"
on public.levels
for select
to anon, authenticated
using (true);

create policy "Admins can insert levels"
on public.levels
for insert
to authenticated
with check ((select public.is_admin()));

create policy "Admins can update levels"
on public.levels
for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "Admins can delete levels"
on public.levels
for delete
to authenticated
using ((select public.is_admin()));

create policy "Public can read victors"
on public.victors
for select
to anon, authenticated
using (true);

create policy "Admins can insert victors"
on public.victors
for insert
to authenticated
with check ((select public.is_admin()));

create policy "Admins can update victors"
on public.victors
for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "Admins can delete victors"
on public.victors
for delete
to authenticated
using ((select public.is_admin()));

-- Table grants used together with RLS.
grant usage on schema public to anon, authenticated;
grant select on public.levels, public.victors to anon, authenticated;
grant select on public.profiles to authenticated;
grant insert, update, delete on public.levels, public.victors to authenticated;

-- ADMIN SETUP
-- The website login is:
--   username: admin
--   password: the password you choose in Supabase
--
-- Supabase Auth itself has no native username/password provider,
-- so create one Auth user with this internal email:
--   admin@gdlist.local
--
-- Then run:
--
-- update public.profiles
-- set role = 'admin'
-- where id = (
--   select id
--   from auth.users
--   where lower(email) = 'admin@gdlist.local'
-- );
