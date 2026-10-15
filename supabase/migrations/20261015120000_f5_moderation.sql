-- F5: moderation (plan section 1.6, FR17 to FR20).
-- 1. Automatic checks when an ad is submitted.
-- 2. Trust levels: a member's first ad, and every flagged ad, waits in the
--    review queue. After one approved ad with no upheld reports a member is
--    level 1 and their clean ads go live straight away.
-- 3. Member reports: three reports from different members hide an ad until
--    an admin checks it.
-- 4. Admin functions: approve, reject with a reason, hide, restore, ban.
-- Also: a minimum photo size (open question from F3).
--
-- Every new table has RLS in this migration (working rule). The whole file
-- is safe to run twice ("if not exists", "or replace", "drop ... if exists").

-- 1. Types --------------------------------------------------------------------------

do $$
begin
  create type public.report_reason as enum
    ('broker', 'fake', 'already_rented', 'wrong_info', 'discriminatory', 'offensive', 'other');
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.report_status as enum ('open', 'upheld', 'dismissed');
exception when duplicate_object then null;
end;
$$;

-- restore also covers "keep the ad": it dismisses open reports and puts a
-- hidden ad back. auto_hide is done by the system (admin_id is empty).
do $$
begin
  create type public.moderation_action as enum
    ('approve', 'reject', 'hide', 'restore', 'auto_hide', 'ban', 'unban');
exception when duplicate_object then null;
end;
$$;

-- 2. Admin helpers -------------------------------------------------------------------
-- Admins are team members with profiles.is_admin = true, set in the SQL
-- Editor (SETUP.md 8.5). A banned admin is not an admin.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and is_admin and not is_banned
  );
$$;

revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

create or replace function public.require_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.require_admin() from public, anon, authenticated;

-- 3. When an ad was last sent in (orders the review queue) ----------------------------

alter table public.listings add column if not exists submitted_at timestamptz;

update public.listings
set submitted_at = coalesce(published_at, updated_at)
where status <> 'draft' and submitted_at is null;

create index if not exists listings_review_queue_idx
  on public.listings (submitted_at)
  where status in ('pending_review', 'hidden');

-- Lookups for the automatic checks.
create index if not exists listing_private_phone_idx on public.listing_private (contact_phone);
create index if not exists listing_private_whatsapp_idx on public.listing_private (whatsapp);
create index if not exists profile_private_phone_idx on public.profile_private (phone);

-- 4. Words that send an ad to review -------------------------------------------------
-- Compared in compact form (search_compact from F4), so spaces, punctuation
-- and Bangla or English digits do not matter. Admins add or remove words in
-- the SQL Editor; nothing in the app writes this table.

create table if not exists public.moderation_words (
  word text primary key check (char_length(word) between 2 and 40),
  created_at timestamptz not null default now()
);

alter table public.moderation_words enable row level security;

drop policy if exists "admins read moderation words" on public.moderation_words;
create policy "admins read moderation words"
  on public.moderation_words for select to authenticated
  using ((select public.is_admin()));

revoke all on public.moderation_words from anon;
revoke insert, update, delete on public.moderation_words from authenticated;

-- "broker" also covers "brokerage", and "ব্রোকার" covers "ব্রোকারেজ".
insert into public.moderation_words (word) values
  ('commission'),
  ('কমিশন'),
  ('broker'),
  ('ব্রোকার'),
  ('দালাল'),
  ('dalal')
on conflict (word) do nothing;

-- 5. listing_flags: why an ad went to the review queue -------------------------------
-- Worked out by submit_listing() each time an ad is sent in. Only admins
-- read them, so a broker cannot see which check stopped the ad.

create table if not exists public.listing_flags (
  listing_id uuid not null references public.listings (id) on delete cascade,
  flag text not null check (flag in (
    'new_member',         -- the poster is level 0 (first ad)
    'was_rejected',       -- the ad was rejected before and sent in again
    'photo_reused',       -- a photo is also on another member's ad, or in another building
    'phone_many_ads',     -- the number is on live ads in 4 or more buildings
    'phone_other_member', -- the number belongs to another member's ad or profile
    'banned_words',       -- commission, broker and similar words
    'phone_in_text',      -- a mobile number written in the title or description
    'rent_outlier'        -- rent far from the usual rent in the area
  )),
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  created_at timestamptz not null default now(),
  primary key (listing_id, flag)
);

alter table public.listing_flags enable row level security;

drop policy if exists "admins read listing flags" on public.listing_flags;
create policy "admins read listing flags"
  on public.listing_flags for select to authenticated
  using ((select public.is_admin()));

revoke all on public.listing_flags from anon;
revoke insert, update, delete on public.listing_flags from authenticated;

-- 6. reports --------------------------------------------------------------------------
-- One report per member per ad. Written only by report_listing().
-- A reporter sees their own reports; admins see all. The poster never sees
-- who reported them.

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reason public.report_reason not null,
  details text check (details is null or char_length(details) <= 500),
  status public.report_status not null default 'open',
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (listing_id, reporter_id)
);

create index if not exists reports_open_idx on public.reports (listing_id) where status = 'open';
create index if not exists reports_reporter_time_idx on public.reports (reporter_id, created_at desc);

alter table public.reports enable row level security;

drop policy if exists "reporters and admins read reports" on public.reports;
create policy "reporters and admins read reports"
  on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()) or (select public.is_admin()));

revoke all on public.reports from anon;
revoke insert, update, delete on public.reports from authenticated;

-- 7. moderation_actions: the log of every admin decision -----------------------------

create table if not exists public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  -- Empty when the system acted (auto_hide at 3 reports).
  admin_id uuid references public.profiles (id) on delete set null,
  listing_id uuid references public.listings (id) on delete set null,
  user_id uuid references public.profiles (id) on delete set null,
  action public.moderation_action not null,
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists moderation_actions_time_idx on public.moderation_actions (created_at desc);
create index if not exists moderation_actions_listing_idx on public.moderation_actions (listing_id, created_at desc);
create index if not exists moderation_actions_user_idx on public.moderation_actions (user_id, created_at desc);

alter table public.moderation_actions enable row level security;

drop policy if exists "admins read moderation actions" on public.moderation_actions;
create policy "admins read moderation actions"
  on public.moderation_actions for select to authenticated
  using ((select public.is_admin()));

revoke all on public.moderation_actions from anon;
revoke insert, update, delete on public.moderation_actions from authenticated;

-- 8. Admins can open every ad and its building ------------------------------------------
-- An ad waiting for review or hidden is not public, so the queue needs these.
-- Each policy is the F2 or F3 one plus is_admin().

drop policy if exists "listings visible to poster, managers, or when live" on public.listings;
drop policy if exists "listings visible to poster, managers, admins, or when live" on public.listings;
create policy "listings visible to poster, managers, admins, or when live"
  on public.listings for select to anon, authenticated
  using (
    status = 'active'
    or posted_by = (select auth.uid())
    or public.can_manage_building(public.unit_building_id(unit_id))
    or (select public.is_admin())
  );

drop policy if exists "units visible to managers or with a live ad" on public.units;
drop policy if exists "units visible to managers, admins, or with a live ad" on public.units;
create policy "units visible to managers, admins, or with a live ad"
  on public.units for select to anon, authenticated
  using (
    public.can_manage_building(building_id)
    or exists (select 1 from public.listings l where l.unit_id = units.id and l.status = 'active')
    or (select public.is_admin())
  );

drop policy if exists "buildings visible to managers or with a live ad" on public.buildings;
drop policy if exists "buildings visible to managers, admins, or with a live ad" on public.buildings;
create policy "buildings visible to managers, admins, or with a live ad"
  on public.buildings for select to anon, authenticated
  using (
    public.can_manage_building(id)
    or public.building_has_active_listing(id)
    or (select public.is_admin())
  );

drop policy if exists "nearby places follow building visibility" on public.nearby_places;
create policy "nearby places follow building visibility"
  on public.nearby_places for select to anon, authenticated
  using (
    public.can_manage_building(building_id)
    or public.building_has_active_listing(building_id)
    or (select public.is_admin())
  );

drop policy if exists "exact address for managers or members with a live ad" on public.building_private;
drop policy if exists "exact address for managers, admins, or members with a live ad" on public.building_private;
create policy "exact address for managers, admins, or members with a live ad"
  on public.building_private for select to authenticated
  using (
    public.can_manage_building(building_id)
    or public.building_has_active_listing(building_id)
    or (select public.is_admin())
  );

-- Admins see an ad's numbers, to judge the phone checks.
drop policy if exists "contact visible to poster or building managers" on public.listing_private;
drop policy if exists "contact visible to poster, building managers or admins" on public.listing_private;
create policy "contact visible to poster, building managers or admins"
  on public.listing_private for select to authenticated
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_id
        and (
          l.posted_by = (select auth.uid())
          or public.can_manage_building(public.unit_building_id(l.unit_id))
        )
    )
    or (select public.is_admin())
  );

-- 9. Minimum photo size ------------------------------------------------------------------
-- Photos whose shorter side is under 600 px look blurry on the ad page and
-- on search cards. A photo that was big enough to be shrunk to 1600 px is
-- always fine (a wide panorama, for example). The browser checks the same
-- rule before uploading (src/lib/photos.ts).

create or replace function public.add_listing_photo(
  p_listing_id uuid,
  p_path text,
  p_width integer,
  p_height integer,
  p_hash text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
  v_id uuid;
begin
  perform public.lock_own_draft(p_listing_id);

  -- The file must sit in the caller's folder for this listing, and exist.
  if p_path is null
    or p_path !~ ('^' || v_uid::text || '/' || p_listing_id::text || '/[0-9a-f-]{36}\.(webp|jpg)$')
    or not exists (select 1 from storage.objects o where o.bucket_id = 'listing-photos' and o.name = p_path)
  then
    raise exception 'invalid_photo' using errcode = '22023';
  end if;

  if p_width is null or p_height is null
    or (least(p_width, p_height) < 600 and greatest(p_width, p_height) < 1600)
  then
    raise exception 'photo_too_small' using errcode = 'P0001';
  end if;

  select count(*) into v_count from public.listing_photos where listing_id = p_listing_id;
  if v_count >= 8 then
    raise exception 'too_many_photos' using errcode = 'P0001';
  end if;

  if p_hash is not null and exists (
    select 1 from public.listing_photos where listing_id = p_listing_id and content_hash = lower(p_hash)
  ) then
    raise exception 'duplicate_photo' using errcode = 'P0001';
  end if;

  insert into public.listing_photos (listing_id, storage_path, sort_order, is_cover, width, height, content_hash)
  values (p_listing_id, p_path, v_count, v_count = 0, p_width, p_height, lower(p_hash))
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.add_listing_photo(uuid, text, integer, integer, text) from public, anon;
grant execute on function public.add_listing_photo(uuid, text, integer, integer, text) to authenticated;

-- 10. compute_listing_flags: the automatic checks (FR17) --------------------------------
-- Returns one row per reason to send the ad to review. Called by
-- submit_listing() only. Required fields and the 4 photo minimum are not
-- flags: submit_listing() refuses an incomplete ad outright.

create or replace function public.compute_listing_flags(p_listing_id uuid)
returns table (flag text, detail jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_l public.listings%rowtype;
  v_building_id uuid;
  v_area_id integer;
  v_thana_id integer;
  v_phones text[];
  v_text text;
  v_digits text;
  v_words text[];
  v_ids uuid[];
  v_count integer;
  v_median numeric;
  v_n integer;
  v_scope text := 'area';
  v_low integer;
  v_high integer;
begin
  select * into v_l from public.listings where id = p_listing_id;
  if not found then
    return;
  end if;

  select u.building_id, b.area_id, a.thana_id
  into v_building_id, v_area_id, v_thana_id
  from public.units u
  join public.buildings b on b.id = u.building_id
  join public.areas a on a.id = b.area_id
  where u.id = v_l.unit_id;

  -- New member: the first ad always waits for an admin.
  if exists (select 1 from public.profiles where id = v_l.posted_by and trust_level = 0) then
    return query select 'new_member'::text, '{}'::jsonb;
  end if;

  -- Rejected before: an admin looks again after the poster's changes.
  if v_l.rejection_reason is not null then
    return query select 'was_rejected'::text, jsonb_build_object('reason', v_l.rejection_reason);
  end if;

  -- Same photo file on another ad (not a draft) in another building or by
  -- another member. The same owner using one photo of the gate for two flats
  -- in one building is normal; a copied photo is a sign of a fake ad.
  select array_agg(distinct o.listing_id) into v_ids
  from public.listing_photos p
  join public.listing_photos o on o.content_hash = p.content_hash and o.listing_id <> p.listing_id
  join public.listings ol on ol.id = o.listing_id
  join public.units ou on ou.id = ol.unit_id
  where p.listing_id = p_listing_id
    and p.content_hash is not null
    and ol.status <> 'draft'
    and (ou.building_id <> v_building_id or ol.posted_by <> v_l.posted_by);
  if v_ids is not null then
    return query select 'photo_reused'::text, jsonb_build_object('listing_ids', to_jsonb(v_ids));
  end if;

  -- Phone numbers (broker signals). Counted per building, so an owner with
  -- many flats in one building is not flagged for that.
  select array_remove(array[c.contact_phone, c.whatsapp], null) into v_phones
  from public.listing_private c
  where c.listing_id = p_listing_id;

  if coalesce(cardinality(v_phones), 0) > 0 then
    select count(distinct u.building_id) into v_count
    from public.listing_private c
    join public.listings l on l.id = c.listing_id
    join public.units u on u.id = l.unit_id
    where (c.contact_phone = any (v_phones) or c.whatsapp = any (v_phones))
      and l.id <> p_listing_id
      and l.status in ('pending_review', 'active', 'hidden')
      and u.building_id <> v_building_id;
    if v_count >= 3 then
      return query select 'phone_many_ads'::text, jsonb_build_object('buildings', v_count + 1);
    end if;

    select count(*) into v_count
    from (
      select l.posted_by as member
      from public.listing_private c
      join public.listings l on l.id = c.listing_id
      where (c.contact_phone = any (v_phones) or c.whatsapp = any (v_phones))
        and l.posted_by <> v_l.posted_by
        and l.status in ('pending_review', 'active', 'hidden')
      union
      select pp.user_id
      from public.profile_private pp
      where pp.phone = any (v_phones) and pp.user_id <> v_l.posted_by
    ) others;
    if v_count > 0 then
      return query select 'phone_other_member'::text, jsonb_build_object('members', v_count);
    end if;
  end if;

  -- Words such as commission or broker in the ad's text.
  v_text := public.search_compact(concat_ws(' ', v_l.title, v_l.description, v_l.extra_rules, v_l.other_charges));
  select array_agg(w.word order by w.word) into v_words
  from public.moderation_words w
  where public.search_compact(w.word) <> ''
    and position(public.search_compact(w.word) in v_text) > 0;
  if v_words is not null then
    return query select 'banned_words'::text, jsonb_build_object('words', to_jsonb(v_words));
  end if;

  -- A mobile number in the text skips the 20 a day reveal limit. Bangla
  -- digits count, and spaces, dots, dashes and brackets between digits are
  -- ignored ("01712-345 678").
  v_digits := regexp_replace(
    translate(concat_ws(' ', v_l.title, v_l.description, v_l.extra_rules, v_l.other_charges), '০১২৩৪৫৬৭৮৯', '0123456789'),
    '[[:space:].()-]+', '', 'g'
  );
  if v_digits ~ '(^|[^0-9])(\+?88)?01[3-9][0-9]{8}([^0-9]|$)' then
    return query select 'phone_in_text'::text, '{}'::jsonb;
  end if;

  -- Rent far from the usual rent: below 40% or above 3 times the median of
  -- live ads of the same type in the area (or the thana when the area has
  -- fewer than 5). With too few ads to compare, only amounts that are very
  -- unlikely in Dhaka are flagged. Bait ads with a very low rent are a
  -- common scam.
  if v_l.monthly_rent is not null then
    select percentile_cont(0.5) within group (order by l.monthly_rent), count(*)
    into v_median, v_n
    from public.listings l
    join public.units u on u.id = l.unit_id
    join public.buildings b on b.id = u.building_id
    where l.status = 'active' and l.id <> p_listing_id
      and l.listing_type = v_l.listing_type
      and b.area_id = v_area_id;

    if v_n < 5 then
      v_scope := 'thana';
      select percentile_cont(0.5) within group (order by l.monthly_rent), count(*)
      into v_median, v_n
      from public.listings l
      join public.units u on u.id = l.unit_id
      join public.buildings b on b.id = u.building_id
      join public.areas a on a.id = b.area_id
      where l.status = 'active' and l.id <> p_listing_id
        and l.listing_type = v_l.listing_type
        and a.thana_id = v_thana_id;
    end if;

    if v_n >= 5 then
      if v_l.monthly_rent < v_median * 0.4 or v_l.monthly_rent > v_median * 3 then
        return query select 'rent_outlier'::text, jsonb_build_object(
          'rent', v_l.monthly_rent, 'median', round(v_median), 'scope', v_scope, 'ads', v_n
        );
      end if;
    else
      v_low := case v_l.listing_type when 'flat' then 4000 when 'mess_seat' then 1000 else 2000 end;
      v_high := case v_l.listing_type when 'flat' then 300000 when 'mess_seat' then 15000 else 60000 end;
      if v_l.monthly_rent < v_low or v_l.monthly_rent > v_high then
        return query select 'rent_outlier'::text, jsonb_build_object(
          'rent', v_l.monthly_rent, 'low', v_low, 'high', v_high, 'scope', 'fixed'
        );
      end if;
    end if;
  end if;
end;
$$;

revoke execute on function public.compute_listing_flags(uuid) from public, anon, authenticated;

-- 11. submit_listing: checks, then live or the review queue (FR17, FR18) ------------------
-- Same required fields and photo minimum as F3. Then the automatic checks
-- run; any flag (including "new member") sends the ad to the queue.
-- Returns the new status: 'active' or 'pending_review'.
-- The return type changed (it was void), so the old function is dropped first.

drop function if exists public.submit_listing(uuid);

create function public.submit_listing(p_listing_id uuid)
returns public.listing_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_l public.listings%rowtype;
  v_unit public.units%rowtype;
  v_phone text;
  v_photos integer;
  v_missing text[] := '{}';
begin
  select * into v_l from public.listings where id = p_listing_id for update;
  if not found or v_l.posted_by is distinct from v_uid then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_l.status <> 'draft' then
    raise exception 'not_a_draft' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.profiles where id = v_uid and is_banned) then
    raise exception 'banned' using errcode = '42501';
  end if;

  select * into v_unit from public.units where id = v_l.unit_id;
  select contact_phone into v_phone from public.listing_private where listing_id = p_listing_id;
  select count(*) into v_photos from public.listing_photos where listing_id = p_listing_id;

  if v_l.title is null then v_missing := array_append(v_missing, 'title'); end if;
  if v_l.available_from is null then v_missing := array_append(v_missing, 'available_from'); end if;
  if v_l.monthly_rent is null then v_missing := array_append(v_missing, 'monthly_rent'); end if;
  if v_l.advance_months is null then v_missing := array_append(v_missing, 'advance_months'); end if;
  if v_l.electricity is null then v_missing := array_append(v_missing, 'electricity'); end if;
  if v_l.water is null then v_missing := array_append(v_missing, 'water'); end if;
  if cardinality(v_l.tenant_types) = 0 then v_missing := array_append(v_missing, 'tenant_types'); end if;
  if v_phone is null then v_missing := array_append(v_missing, 'contact_phone'); end if;
  if v_l.posted_as = 'caretaker' and v_l.owner_name is null then v_missing := array_append(v_missing, 'owner_name'); end if;
  if v_l.posted_as = 'tenant_sublet' and not v_l.sublet_consent then v_missing := array_append(v_missing, 'sublet_consent'); end if;
  if v_l.listing_type = 'mess_seat' and v_unit.unit_kind <> 'mess_room' then v_missing := array_append(v_missing, 'listing_type'); end if;
  if v_l.open_slots > v_unit.capacity then v_missing := array_append(v_missing, 'open_slots'); end if;
  if v_photos < 4 then v_missing := array_append(v_missing, 'photos'); end if;

  if cardinality(v_missing) > 0 then
    raise exception 'listing_incomplete' using errcode = 'P0001', detail = array_to_string(v_missing, ',');
  end if;

  delete from public.listing_flags where listing_id = p_listing_id;
  insert into public.listing_flags (listing_id, flag, detail)
  select p_listing_id, f.flag, f.detail
  from public.compute_listing_flags(p_listing_id) f;

  if exists (select 1 from public.listing_flags where listing_id = p_listing_id) then
    update public.listings set
      status = 'pending_review',
      submitted_at = now()
    where id = p_listing_id;
    return 'pending_review';
  end if;

  update public.listings set
    status = 'active',
    submitted_at = now(),
    published_at = now(),
    expires_at = now() + interval '30 days'
  where id = p_listing_id;

  update public.units set status = 'listed' where id = v_l.unit_id and status = 'vacant';
  return 'active';
end;
$$;

revoke execute on function public.submit_listing(uuid) from public, anon;
grant execute on function public.submit_listing(uuid) to authenticated;

-- 12. reopen_listing: the poster takes an ad back to edit it ---------------------------
-- Works for an ad waiting for review (to fix something before an admin
-- looks) and for a rejected ad (to fix it and send it in again; it then
-- goes to review once more, flag was_rejected). A hidden ad cannot be
-- reopened: an admin decides about it first.

create or replace function public.reopen_listing(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_l public.listings%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles where id = v_uid and is_banned) then
    raise exception 'banned' using errcode = '42501';
  end if;

  select * into v_l from public.listings where id = p_listing_id for update;
  if not found or v_l.posted_by <> v_uid
    or not public.can_manage_building(public.unit_building_id(v_l.unit_id))
  then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_l.status not in ('pending_review', 'rejected') then
    raise exception 'wrong_status' using errcode = 'P0001';
  end if;
  -- A rejected ad no longer holds its unit, so someone may have started a
  -- new ad for it meanwhile.
  if exists (
    select 1 from public.listings
    where unit_id = v_l.unit_id and id <> p_listing_id
      and status in ('draft', 'pending_review', 'active', 'hidden')
  ) then
    raise exception 'unit_has_open_listing' using errcode = 'P0001';
  end if;

  update public.listings set status = 'draft', submitted_at = null where id = p_listing_id;
  delete from public.listing_flags where listing_id = p_listing_id;
end;
$$;

revoke execute on function public.reopen_listing(uuid) from public, anon;
grant execute on function public.reopen_listing(uuid) to authenticated;

-- 13. report_listing: a member reports a live ad (FR19) --------------------------------
-- One report per member per ad, at most 10 reports per member per 24 hours.
-- The poster and the building's managers cannot report their own ad.
-- When 3 different members have open reports on an ad, it is hidden until
-- an admin checks it.

create or replace function public.report_listing(
  p_listing_id uuid,
  p_reason public.report_reason,
  p_details text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_l record;
  v_details text := nullif(left(trim(coalesce(p_details, '')), 500), '');
  v_today integer;
  v_open integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles where id = v_uid and is_banned) then
    raise exception 'banned' using errcode = '42501';
  end if;
  if p_reason is null then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;
  if p_reason = 'other' and v_details is null then
    raise exception 'details_required' using errcode = '22023';
  end if;

  -- Locked, so two reports at the same moment cannot both miss the third.
  select id, posted_by, unit_id, status into v_l from public.listings where id = p_listing_id for update;
  if not found or v_l.status <> 'active' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_l.posted_by = v_uid or public.can_manage_building(public.unit_building_id(v_l.unit_id)) then
    raise exception 'own_listing' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.reports where listing_id = p_listing_id and reporter_id = v_uid) then
    raise exception 'already_reported' using errcode = 'P0001';
  end if;

  select count(*) into v_today
  from public.reports
  where reporter_id = v_uid and created_at > now() - interval '24 hours';
  if v_today >= 10 then
    raise exception 'report_limit' using errcode = 'P0001';
  end if;

  insert into public.reports (listing_id, reporter_id, reason, details)
  values (p_listing_id, v_uid, p_reason, v_details);

  select count(distinct reporter_id) into v_open
  from public.reports
  where listing_id = p_listing_id and status = 'open';

  if v_open >= 3 then
    update public.listings set status = 'hidden' where id = p_listing_id;
    insert into public.moderation_actions (admin_id, listing_id, user_id, action)
    values (null, p_listing_id, v_l.posted_by, 'auto_hide');
  end if;
end;
$$;

revoke execute on function public.report_listing(uuid, public.report_reason, text) from public, anon;
grant execute on function public.report_listing(uuid, public.report_reason, text) to authenticated;

-- 14. moderate_listing: admin decisions on one ad (FR18, FR20) ---------------------------
--   approve   pending_review -> active. A level 0 poster with no upheld
--             reports becomes level 1.
--   reject    pending_review, active or hidden -> rejected, with a reason the
--             poster sees. Open reports become upheld and the poster goes back
--             to level 0.
--   hide      active -> hidden.
--   restore   hidden -> active, or keep an active ad: open reports are
--             dismissed either way.
-- Admins cannot approve or restore their own ads. Returns the new status.

create or replace function public.moderate_listing(
  p_listing_id uuid,
  p_action public.moderation_action,
  p_note text default null
)
returns public.listing_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_l public.listings%rowtype;
  v_note text := nullif(left(trim(coalesce(p_note, '')), 500), '');
  v_has_reports boolean;
  v_new public.listing_status;
begin
  perform public.require_admin();

  select * into v_l from public.listings where id = p_listing_id for update;
  if not found then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  v_has_reports := exists (select 1 from public.reports where listing_id = p_listing_id and status = 'open');

  if p_action in ('approve', 'restore') then
    if v_l.posted_by = v_uid then
      raise exception 'own_listing' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.profiles where id = v_l.posted_by and is_banned) then
      raise exception 'poster_banned' using errcode = 'P0001';
    end if;
  end if;

  case p_action
    when 'approve' then
      if v_l.status <> 'pending_review' then
        raise exception 'wrong_status' using errcode = 'P0001';
      end if;
      update public.listings set
        status = 'active',
        published_at = now(),
        expires_at = now() + interval '30 days',
        rejection_reason = null
      where id = p_listing_id;
      update public.units set status = 'listed' where id = v_l.unit_id and status = 'vacant';
      update public.profiles p set trust_level = 1
      where p.id = v_l.posted_by
        and p.trust_level = 0
        and not exists (
          select 1 from public.reports r
          join public.listings l on l.id = r.listing_id
          where l.posted_by = p.id and r.status = 'upheld'
        );
      v_new := 'active';

    when 'reject' then
      if v_l.status not in ('pending_review', 'active', 'hidden') then
        raise exception 'wrong_status' using errcode = 'P0001';
      end if;
      if v_note is null then
        raise exception 'reason_required' using errcode = '22023';
      end if;
      update public.listings set status = 'rejected', rejection_reason = v_note where id = p_listing_id;
      update public.units set status = 'vacant' where id = v_l.unit_id and status = 'listed';
      if v_has_reports then
        update public.reports set status = 'upheld', resolved_by = v_uid, resolved_at = now()
        where listing_id = p_listing_id and status = 'open';
        update public.profiles set trust_level = 0 where id = v_l.posted_by;
      end if;
      v_new := 'rejected';

    when 'hide' then
      if v_l.status <> 'active' then
        raise exception 'wrong_status' using errcode = 'P0001';
      end if;
      update public.listings set status = 'hidden' where id = p_listing_id;
      v_new := 'hidden';

    when 'restore' then
      if not (v_l.status = 'hidden' or (v_l.status = 'active' and v_has_reports)) then
        raise exception 'wrong_status' using errcode = 'P0001';
      end if;
      update public.listings set status = 'active' where id = p_listing_id;
      update public.reports set status = 'dismissed', resolved_by = v_uid, resolved_at = now()
      where listing_id = p_listing_id and status = 'open';
      v_new := 'active';

    else
      raise exception 'invalid_action' using errcode = '22023';
  end case;

  insert into public.moderation_actions (admin_id, listing_id, user_id, action, note)
  values (v_uid, p_listing_id, v_l.posted_by, p_action, v_note);

  return v_new;
end;
$$;

revoke execute on function public.moderate_listing(uuid, public.moderation_action, text) from public, anon;
grant execute on function public.moderate_listing(uuid, public.moderation_action, text) to authenticated;

-- 15. set_user_ban: ban or unban a member (FR20) ------------------------------------------
-- A ban needs a reason. The member drops to level 0, their live ads are
-- hidden (an admin can restore them after an unban) and their ads waiting
-- for review are rejected with the ban reason. Banned members cannot post,
-- report or open phone numbers (every write function checks is_banned).
-- Admins cannot ban themselves or another admin.

create or replace function public.set_user_ban(p_user_id uuid, p_banned boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_p public.profiles%rowtype;
  v_note text := nullif(left(trim(coalesce(p_note, '')), 500), '');
  v_l record;
begin
  perform public.require_admin();

  select * into v_p from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_user_id = v_uid then
    raise exception 'cannot_ban_self' using errcode = 'P0001';
  end if;

  if p_banned then
    if v_p.is_admin then
      raise exception 'cannot_ban_admin' using errcode = 'P0001';
    end if;
    if v_p.is_banned then
      return;
    end if;
    if v_note is null then
      raise exception 'reason_required' using errcode = '22023';
    end if;

    update public.profiles set is_banned = true, trust_level = 0 where id = p_user_id;

    for v_l in
      select id, unit_id, status from public.listings
      where posted_by = p_user_id and status in ('active', 'pending_review')
      for update
    loop
      if v_l.status = 'active' then
        update public.listings set status = 'hidden' where id = v_l.id;
        insert into public.moderation_actions (admin_id, listing_id, user_id, action, note)
        values (v_uid, v_l.id, p_user_id, 'hide', v_note);
      else
        update public.listings set status = 'rejected', rejection_reason = v_note where id = v_l.id;
        insert into public.moderation_actions (admin_id, listing_id, user_id, action, note)
        values (v_uid, v_l.id, p_user_id, 'reject', v_note);
      end if;
    end loop;

    insert into public.moderation_actions (admin_id, user_id, action, note)
    values (v_uid, p_user_id, 'ban', v_note);
  else
    if not v_p.is_banned then
      return;
    end if;
    update public.profiles set is_banned = false where id = p_user_id;
    insert into public.moderation_actions (admin_id, user_id, action, note)
    values (v_uid, p_user_id, 'unban', v_note);
  end if;
end;
$$;

revoke execute on function public.set_user_ban(uuid, boolean, text) from public, anon;
grant execute on function public.set_user_ban(uuid, boolean, text) to authenticated;

-- 16. admin_list_users: the admin Users page ---------------------------------------------
-- Emails live in auth.users, which the app cannot read, so admins get them
-- through this function. p_q matches part of the name or email.
-- p_filter: null (everyone), 'banned', 'admins' or 'new' (level 0).

create or replace function public.admin_list_users(
  p_q text default null,
  p_filter text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  full_name text,
  email text,
  avatar_url text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  trust_level smallint,
  is_admin boolean,
  is_banned boolean,
  live_ads integer,
  total_ads integer,
  upheld_reports integer,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := lower(trim(coalesce(p_q, '')));
begin
  perform public.require_admin();

  return query
    with matched as (
      select p.id, p.full_name, u.email::text as email, p.avatar_url, p.created_at,
             u.last_sign_in_at, p.trust_level, p.is_admin, p.is_banned
      from public.profiles p
      join auth.users u on u.id = p.id
      where (v_q = '' or strpos(lower(p.full_name), v_q) > 0 or strpos(lower(coalesce(u.email, '')), v_q) > 0)
        and (
          p_filter is null
          or (p_filter = 'banned' and p.is_banned)
          or (p_filter = 'admins' and p.is_admin)
          or (p_filter = 'new' and p.trust_level = 0)
        )
    ),
    page as (
      select m.*, count(*) over () as total_count
      from matched m
      order by m.created_at desc, m.id
      limit least(greatest(coalesce(p_limit, 50), 1), 100)
      offset greatest(coalesce(p_offset, 0), 0)
    )
    select
      pg.id, pg.full_name, pg.email, pg.avatar_url, pg.created_at, pg.last_sign_in_at,
      pg.trust_level, pg.is_admin, pg.is_banned,
      (select count(*)::integer from public.listings l where l.posted_by = pg.id and l.status = 'active'),
      (select count(*)::integer from public.listings l where l.posted_by = pg.id and l.status <> 'draft'),
      (select count(*)::integer from public.reports r join public.listings l on l.id = r.listing_id
        where l.posted_by = pg.id and r.status = 'upheld'),
      pg.total_count
    from page pg
    order by pg.created_at desc, pg.id;
end;
$$;

revoke execute on function public.admin_list_users(text, text, integer, integer) from public, anon;
grant execute on function public.admin_list_users(text, text, integer, integer) to authenticated;
