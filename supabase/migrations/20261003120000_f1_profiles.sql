-- F1: profiles, private profile data, avatar storage
-- Every table gets RLS in the same migration (working rule).

-- 1. Types ------------------------------------------------------------------

create type public.app_locale as enum ('bn', 'en');
create type public.app_mode as enum ('seek', 'host');

-- 2. Shared helper: keep updated_at fresh ------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 3. profiles: public part of a person ---------------------------------------
-- default_mode is null until the person answers the sign-up question
-- ("Find a home" = seek, "Rent out my property" = host).

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default ''
    check (char_length(full_name) <= 80),
  avatar_url text
    check (avatar_url is null or char_length(avatar_url) <= 500),
  preferred_locale public.app_locale not null default 'bn',
  default_mode public.app_mode,
  is_admin boolean not null default false,
  trust_level smallint not null default 0 check (trust_level in (0, 1)),
  is_banned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Public profile, one row per auth user. Roles come from relationships, not from this table.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

-- Anyone may read profiles (name and photo appear on ads and requests).
create policy "profiles are readable by everyone"
  on public.profiles for select
  to anon, authenticated
  using (true);

-- A person may update only their own row ...
create policy "users update own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- ... and only these columns. is_admin, trust_level and is_banned
-- can only be changed by admins through the dashboard or later RPCs.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (full_name, avatar_url, preferred_locale, default_mode)
  on public.profiles to authenticated;

-- 4. profile_private: phone number ------------------------------------------
-- F6 adds a policy so a landlord can read the phone once a request is shortlisted.

create table public.profile_private (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  phone text
    check (phone is null or phone ~ '^\+8801[3-9][0-9]{8}$'),
  phone_verified boolean not null default false,
  updated_at timestamptz not null default now()
);

comment on table public.profile_private is
  'Private contact data. Phone stored in E.164 (+8801XXXXXXXXX). Shared in stages (plan section 1.5).';

create trigger profile_private_set_updated_at
  before update on public.profile_private
  for each row execute function public.set_updated_at();

alter table public.profile_private enable row level security;

create policy "users read own private profile"
  on public.profile_private for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "users update own private profile"
  on public.profile_private for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke insert, update, delete on public.profile_private from anon, authenticated;
revoke select on public.profile_private from anon;
-- phone_verified is set by the phone OTP flow later, never by the user.
grant update (phone) on public.profile_private to authenticated;

-- 5. Create both rows when a user signs up ----------------------------------
-- Email sign-up passes full_name, locale and default_mode in user metadata.
-- Google sign-in provides full_name or name, and avatar_url or picture.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_name text := left(trim(coalesce(meta ->> 'full_name', meta ->> 'name', '')), 80);
  v_avatar text := coalesce(meta ->> 'avatar_url', meta ->> 'picture');
  v_locale public.app_locale := case
    when meta ->> 'locale' in ('bn', 'en') then (meta ->> 'locale')::public.app_locale
    else 'bn'
  end;
  v_mode public.app_mode := case
    when meta ->> 'default_mode' in ('seek', 'host') then (meta ->> 'default_mode')::public.app_mode
    else null
  end;
begin
  if v_avatar is not null and char_length(v_avatar) > 500 then
    v_avatar := null;
  end if;

  insert into public.profiles (id, full_name, avatar_url, preferred_locale, default_mode)
  values (new.id, v_name, v_avatar, v_locale, v_mode);

  insert into public.profile_private (user_id)
  values (new.id);

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 6. Avatar storage ---------------------------------------------------------
-- Public bucket (photos show on ads and requests). Each user writes only
-- inside a folder named with their own user id: <uid>/avatar-<time>.webp

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy "users upload own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "users update own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "users delete own avatar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Listing files in a public bucket needs a select policy; limit it to the owner.
-- Public URLs work without it.
create policy "users list own avatars"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
