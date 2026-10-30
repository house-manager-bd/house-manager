-- F6: rental requests (plan sections 1.4 and 1.5, FR21 to FR24).
-- 1. A member sends a request for a live ad with household details.
-- 2. The landlord (the poster or the building's managers) shortlists or
--    declines it with a reason. The seeker withdraws it.
-- 3. Staged disclosure: the landlord sees the seeker's name, photo and the
--    request details at once, and the seeker's phone only after shortlisting.
-- 4. Limits: one open request per seeker per ad, 10 open requests per
--    seeker, 20 new requests per seeker per 24 hours, and no new request to
--    an ad whose landlord already declined this seeker.
-- F8 adds offers (offered, confirmed). Expiry after 14 days without an
-- answer comes with the scheduled job in F10.
--
-- Every new table has RLS in this migration (working rule). The whole file
-- is safe to run twice ("if not exists", "or replace", "drop ... if exists").

-- 1. Types --------------------------------------------------------------------------

do $$
begin
  create type public.request_status as enum
    ('pending', 'shortlisted', 'offered', 'confirmed', 'declined', 'withdrawn', 'expired');
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.household_type as enum ('family', 'bachelor_male', 'bachelor_female');
exception when duplicate_object then null;
end;
$$;

-- filled is also what F8 uses when the place is taken by someone else.
do $$
begin
  create type public.decline_reason as enum ('filled', 'household', 'move_in', 'other');
exception when duplicate_object then null;
end;
$$;

-- 2. can_manage_listing: the ad's poster or a manager of its building -------------------
-- They answer the ad's requests. Admins are not included: they can read
-- requests (RLS below) but never act for a landlord.

create or replace function public.can_manage_listing(p_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.listings l
    where l.id = p_listing_id
      and (
        l.posted_by = (select auth.uid())
        or public.can_manage_building(public.unit_building_id(l.unit_id))
      )
  );
$$;

revoke execute on function public.can_manage_listing(uuid) from public, anon;
grant execute on function public.can_manage_listing(uuid) to authenticated;

-- Every ad the caller manages, as one list. The policies below use it as
-- "listing_id in (select ...)", which Postgres works out once per query
-- instead of once per row (a per-row check took over a second with 20,000
-- requests).
create index if not exists listings_unit_id_idx on public.listings (unit_id);

create or replace function public.managed_listing_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select l.id from public.listings l where l.posted_by = (select auth.uid())
  union
  select l.id
  from public.listings l
  join public.units u on u.id = l.unit_id
  where u.building_id in (
    select m.building_id from public.building_managers m where m.user_id = (select auth.uid())
    union
    select b.id from public.buildings b where b.created_by = (select auth.uid())
  );
$$;

revoke execute on function public.managed_listing_ids() from public, anon;
grant execute on function public.managed_listing_ids() to authenticated;

-- 3. rental_requests ------------------------------------------------------------------
-- Written only by the functions below. The seeker, the ad's landlord and
-- admins can read a request.

create table if not exists public.rental_requests (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  tenant_id uuid not null references public.profiles (id) on delete cascade,
  status public.request_status not null default 'pending',
  household_type public.household_type not null,
  members_count smallint not null check (members_count between 1 and 20),
  occupation text not null check (char_length(occupation) between 2 and 80),
  move_in_date date not null,
  message text check (message is null or char_length(message) <= 1000),
  -- F8: an offer is valid for 48 hours.
  offer_expires_at timestamptz,
  -- Shown to the seeker in their language; the note is shown as typed.
  decline_reason public.decline_reason,
  decline_note text check (decline_note is null or char_length(decline_note) <= 300),
  shortlisted_at timestamptz,
  -- When it was declined, withdrawn or expired.
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rental_requests_decline_reason_check
    check ((status = 'declined') = (decline_reason is not null))
);

comment on table public.rental_requests is
  'A seeker''s request for one ad (plan section 1.4). Changed only through send_request, shortlist_request, decline_request and withdraw_request.';

-- One open request per seeker per ad. Also stops two sends at the same moment.
create unique index if not exists rental_requests_one_open_per_ad
  on public.rental_requests (listing_id, tenant_id)
  where status in ('pending', 'shortlisted', 'offered');

create index if not exists rental_requests_listing_status_idx
  on public.rental_requests (listing_id, status, created_at desc);
create index if not exists rental_requests_tenant_time_idx
  on public.rental_requests (tenant_id, created_at desc);

drop trigger if exists rental_requests_set_updated_at on public.rental_requests;
create trigger rental_requests_set_updated_at
  before update on public.rental_requests
  for each row execute function public.set_updated_at();

alter table public.rental_requests enable row level security;

drop policy if exists "seekers, landlords and admins read requests" on public.rental_requests;
create policy "seekers, landlords and admins read requests"
  on public.rental_requests for select to authenticated
  using (
    tenant_id = (select auth.uid())
    or listing_id in (select public.managed_listing_ids())
    or (select public.is_admin())
  );

revoke all on public.rental_requests from anon;
revoke insert, update, delete on public.rental_requests from authenticated;

-- 4. The seeker's phone after shortlisting (plan section 1.5) -----------------------------
-- profile_private stays readable by its owner (F1). The landlord of an ad
-- can also read the phone of a seeker whose request on that ad is
-- shortlisted or further along. Withdrawing or declining hides it again.

-- Seekers the caller has shortlisted (or further) on any ad they manage.
create or replace function public.shortlisted_member_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct r.tenant_id
  from public.rental_requests r
  where r.status in ('shortlisted', 'offered', 'confirmed')
    and r.listing_id in (select public.managed_listing_ids());
$$;

revoke execute on function public.shortlisted_member_ids() from public, anon;
grant execute on function public.shortlisted_member_ids() to authenticated;

drop policy if exists "landlords read a shortlisted seeker's phone" on public.profile_private;
create policy "landlords read a shortlisted seeker's phone"
  on public.profile_private for select to authenticated
  using (user_id in (select public.shortlisted_member_ids()));

-- 5. send_request: a member asks for a live ad (FR21, FR24) --------------------------------
-- Returns the new request's id.

create or replace function public.send_request(
  p_listing_id uuid,
  p_household_type public.household_type,
  p_members_count integer,
  p_occupation text,
  p_move_in_date date,
  p_message text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_p public.profiles%rowtype;
  v_phone text;
  v_l public.listings%rowtype;
  v_occupation text := trim(coalesce(p_occupation, ''));
  v_message text := nullif(trim(coalesce(p_message, '')), '');
  -- Dates are Dhaka dates, the same as the form's date picker.
  v_today date := (now() at time zone 'Asia/Dhaka')::date;
  v_count integer;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  -- Locked, so two requests sent at the same moment cannot both pass the limits.
  select * into v_p from public.profiles where id = v_uid for update;
  if not found then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_p.is_banned then
    raise exception 'banned' using errcode = '42501';
  end if;

  select * into v_l from public.listings where id = p_listing_id;
  if not found then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_l.status <> 'active' then
    raise exception 'listing_not_active' using errcode = 'P0001';
  end if;
  if v_l.posted_by = v_uid or public.can_manage_building(public.unit_building_id(v_l.unit_id)) then
    raise exception 'own_listing' using errcode = 'P0001';
  end if;

  -- The landlord sees the name now and calls the phone after shortlisting,
  -- so both must be on the profile.
  select phone into v_phone from public.profile_private where user_id = v_uid;
  if trim(v_p.full_name) = '' or v_phone is null then
    raise exception 'profile_incomplete' using errcode = 'P0001';
  end if;

  if p_household_type is null
    or p_members_count is null or p_members_count not between 1 and 20
    or char_length(v_occupation) not between 2 and 80
    or char_length(coalesce(v_message, '')) > 1000
  then
    raise exception 'invalid_request' using errcode = '22023';
  end if;
  if p_move_in_date is null or p_move_in_date < v_today or p_move_in_date > v_today + 365 then
    raise exception 'move_in_invalid' using errcode = '22023';
  end if;
  -- The ad's own limits: most people allowed, and seats on offer for a mess.
  if (v_l.max_occupants is not null and p_members_count > v_l.max_occupants)
    or (v_l.listing_type = 'mess_seat' and p_members_count > v_l.open_slots)
  then
    raise exception 'too_many_members' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.rental_requests
    where listing_id = p_listing_id and tenant_id = v_uid
      and status in ('pending', 'shortlisted', 'offered')
  ) then
    raise exception 'already_requested' using errcode = 'P0001';
  end if;
  -- The landlord said no once; asking again would only be noise for them.
  if exists (
    select 1 from public.rental_requests
    where listing_id = p_listing_id and tenant_id = v_uid and status = 'declined'
  ) then
    raise exception 'request_declined' using errcode = 'P0001';
  end if;

  select count(*) into v_count
  from public.rental_requests
  where tenant_id = v_uid and status in ('pending', 'shortlisted', 'offered');
  if v_count >= 10 then
    raise exception 'request_limit' using errcode = 'P0001';
  end if;

  -- Stops a withdraw and send again loop from flooding landlords.
  select count(*) into v_count
  from public.rental_requests
  where tenant_id = v_uid and created_at > now() - interval '24 hours';
  if v_count >= 20 then
    raise exception 'request_daily_limit' using errcode = 'P0001';
  end if;

  insert into public.rental_requests (
    listing_id, tenant_id, household_type, members_count, occupation, move_in_date, message
  ) values (
    p_listing_id, v_uid, p_household_type, p_members_count, v_occupation, p_move_in_date, v_message
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.send_request(uuid, public.household_type, integer, text, date, text) from public, anon;
grant execute on function public.send_request(uuid, public.household_type, integer, text, date, text) to authenticated;

-- 6. shortlist_request: the landlord is interested (FR22, FR23) ----------------------------
-- pending -> shortlisted. From now on the landlord can read the seeker's
-- phone. Only while the ad is live (a hidden ad may belong to a broker), and
-- never for a suspended seeker or by a suspended landlord.

create or replace function public.shortlist_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_r public.rental_requests%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles where id = v_uid and is_banned) then
    raise exception 'banned' using errcode = '42501';
  end if;

  select * into v_r from public.rental_requests where id = p_request_id for update;
  if not found or not public.can_manage_listing(v_r.listing_id) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_r.status <> 'pending' then
    raise exception 'wrong_status' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.listings where id = v_r.listing_id and status = 'active') then
    raise exception 'listing_not_active' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.profiles where id = v_r.tenant_id and is_banned) then
    raise exception 'seeker_banned' using errcode = 'P0001';
  end if;

  update public.rental_requests
  set status = 'shortlisted', shortlisted_at = now()
  where id = p_request_id;
end;
$$;

revoke execute on function public.shortlist_request(uuid) from public, anon;
grant execute on function public.shortlist_request(uuid) to authenticated;

-- 7. decline_request: the landlord says no, with a reason (FR22) ---------------------------
-- pending or shortlisted -> declined. "other" needs a note. A suspended
-- landlord can still decline: closing a request shares nothing.

create or replace function public.decline_request(
  p_request_id uuid,
  p_reason public.decline_reason,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_r public.rental_requests%rowtype;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_r from public.rental_requests where id = p_request_id for update;
  if not found or not public.can_manage_listing(v_r.listing_id) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_r.status not in ('pending', 'shortlisted') then
    raise exception 'wrong_status' using errcode = 'P0001';
  end if;
  if p_reason is null then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  if p_reason = 'other' and v_note is null then
    raise exception 'details_required' using errcode = '22023';
  end if;
  if char_length(coalesce(v_note, '')) > 300 then
    raise exception 'invalid_request' using errcode = '22023';
  end if;

  update public.rental_requests
  set status = 'declined', decline_reason = p_reason, decline_note = v_note, closed_at = now()
  where id = p_request_id;
end;
$$;

revoke execute on function public.decline_request(uuid, public.decline_reason, text) from public, anon;
grant execute on function public.decline_request(uuid, public.decline_reason, text) to authenticated;

-- 8. withdraw_request: the seeker cancels (FR24) -------------------------------------------
-- pending, shortlisted or offered -> withdrawn. The landlord can no longer
-- read the seeker's phone. A suspended seeker can still withdraw.

create or replace function public.withdraw_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_r public.rental_requests%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_r from public.rental_requests where id = p_request_id for update;
  if not found or v_r.tenant_id <> v_uid then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_r.status not in ('pending', 'shortlisted', 'offered') then
    raise exception 'wrong_status' using errcode = 'P0001';
  end if;

  update public.rental_requests
  set status = 'withdrawn', closed_at = now()
  where id = p_request_id;
end;
$$;

revoke execute on function public.withdraw_request(uuid) from public, anon;
grant execute on function public.withdraw_request(uuid) to authenticated;

-- 9. my_requests: the seeker's "My requests" page --------------------------------------------
-- Each request with a short summary of its ad. The ad may no longer be live
-- (hidden, rejected, rented), so the summary comes from here and not from
-- the listings policy. The building name and address are not included.

create or replace function public.my_requests()
returns table (
  id uuid,
  listing_id uuid,
  status public.request_status,
  household_type public.household_type,
  members_count smallint,
  occupation text,
  move_in_date date,
  message text,
  decline_reason public.decline_reason,
  decline_note text,
  shortlisted_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz,
  listing_title text,
  listing_type public.listing_type,
  listing_status public.listing_status,
  monthly_rent integer,
  area_id integer,
  landmark text,
  cover_path text,
  poster_name text,
  posted_as public.posted_as
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id, r.listing_id, r.status, r.household_type, r.members_count, r.occupation,
    r.move_in_date, r.message, r.decline_reason, r.decline_note, r.shortlisted_at,
    r.closed_at, r.created_at,
    l.title, l.listing_type, l.status, l.monthly_rent, b.area_id, b.landmark,
    (select p.storage_path from public.listing_photos p
      where p.listing_id = l.id order by p.sort_order limit 1),
    pr.full_name, l.posted_as
  from public.rental_requests r
  join public.listings l on l.id = r.listing_id
  join public.units u on u.id = l.unit_id
  join public.buildings b on b.id = u.building_id
  left join public.profiles pr on pr.id = l.posted_by
  where r.tenant_id = (select auth.uid())
  order by r.created_at desc
  limit 200;
$$;

revoke execute on function public.my_requests() from public, anon;
grant execute on function public.my_requests() to authenticated;

-- 10. request_inbox: the landlord's "Requests inbox" --------------------------------------------
-- One row per ad the caller manages that has received requests, with
-- counts. Admins get only their own ads here, like everyone else.

create or replace function public.request_inbox()
returns table (
  listing_id uuid,
  listing_title text,
  listing_type public.listing_type,
  listing_status public.listing_status,
  monthly_rent integer,
  unit_label text,
  building_name text,
  area_id integer,
  cover_path text,
  pending_count integer,
  shortlisted_count integer,
  closed_count integer,
  last_request_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select l.id, l.title, l.listing_type, l.status, l.monthly_rent, l.unit_id
    from public.listings l
    where l.id in (select public.managed_listing_ids())
  ),
  counts as (
    select
      r.listing_id,
      count(*) filter (where r.status = 'pending')::integer as pending_count,
      count(*) filter (where r.status in ('shortlisted', 'offered'))::integer as shortlisted_count,
      count(*) filter (where r.status not in ('pending', 'shortlisted', 'offered'))::integer as closed_count,
      max(r.created_at) as last_request_at
    from public.rental_requests r
    where r.listing_id in (select id from mine)
    group by r.listing_id
  )
  select
    m.id, m.title, m.listing_type, m.status, m.monthly_rent, u.label, b.name, b.area_id,
    (select p.storage_path from public.listing_photos p
      where p.listing_id = m.id order by p.sort_order limit 1),
    c.pending_count, c.shortlisted_count, c.closed_count, c.last_request_at
  from mine m
  join counts c on c.listing_id = m.id
  join public.units u on u.id = m.unit_id
  join public.buildings b on b.id = u.building_id
  order by c.pending_count > 0 desc, c.last_request_at desc;
$$;

revoke execute on function public.request_inbox() from public, anon;
grant execute on function public.request_inbox() to authenticated;
