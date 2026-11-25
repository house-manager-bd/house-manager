-- F10: managing ads and properties (plan section 9, FR30, FR31, FR36, FR37).
-- 1. The poster edits a live ad (text, costs, tenants, contact and photos).
--    Changes go live at once, unless they set off an automatic check that an
--    admin has not seen yet; then the ad waits in the review queue again.
-- 2. Pause and resume: a paused ad keeps its link, requests and threads, but
--    leaves search and the map and takes no new requests or phone reveals.
-- 3. Ads expire 30 days after they go live, with a reminder 3 days before.
--    The poster renews an ad in its last 7 days, or up to 30 days after it
--    expired, for another 30 days.
-- 4. Mark as rented (a tenant found outside the site): the unit becomes
--    occupied and every open request is declined with the "filled" reason.
-- 5. Re-list: a rented or expired ad becomes a new draft with its details
--    filled in (the app copies the photos), once the place is free again.
-- 6. Caretakers: a building's owner invites a caretaker by email; the
--    caretaker accepts and becomes a building manager. The owner can remove
--    a caretaker and a caretaker can leave; their ads in that building pass
--    to the owner.
-- 7. Saved ads for members.
-- 8. A scheduled job (Supabase Cron, every 10 minutes, SETUP.md 8.9) writes
--    expired offers, closes requests with no step or message for 14 days,
--    reminds and expires ads, deletes old read notifications, and asks the
--    app to send waiting notification emails.
--
-- Every new table has RLS in this migration (working rule). The whole file
-- is safe to run twice ("if not exists", "or replace", "drop ... if exists").

-- 1. New listing columns -------------------------------------------------------------

do $$
begin
  -- First run only: give live ads that expire within 7 days (or have no
  -- expiry date) 7 more days, so their posters get the reminder first
  -- instead of the ad vanishing on the first run of the job.
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'listings' and column_name = 'expiry_reminded_at'
  ) then
    alter table public.listings add column expiry_reminded_at timestamptz;
    update public.listings
    set expires_at = now() + interval '7 days'
    where status = 'active' and (expires_at is null or expires_at < now() + interval '7 days');
  end if;
end;
$$;

alter table public.listings
  add column if not exists expiry_reminded_at timestamptz,
  -- Set while the poster has paused a live ad.
  add column if not exists paused_at timestamptz,
  -- The rented or expired ad this one was re-listed from.
  add column if not exists relisted_from uuid references public.listings (id) on delete set null;

comment on column public.listings.paused_at is
  'F10: the poster paused this live ad. It stays reachable by its link but is not in search and takes no new requests.';
comment on column public.listings.expiry_reminded_at is
  'F10: when the poster was told the ad expires in 3 days (cleared on renew).';

-- A pause only means something on a live ad, so it is cleared when an ad
-- stops being live (hidden, expired, rented, back to review), and a new
-- expiry date gets a new reminder. A trigger, so the F5 and F8 functions
-- that change the status or the expiry date need no change.
create or replace function public.listings_lifecycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'active' then
    new.paused_at := null;
  end if;
  if new.expires_at is distinct from old.expires_at then
    new.expiry_reminded_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists listings_clear_pause on public.listings;
drop trigger if exists listings_lifecycle on public.listings;
create trigger listings_lifecycle
  before update on public.listings
  for each row execute function public.listings_lifecycle();

alter table public.listings drop constraint if exists listings_paused_check;
alter table public.listings add constraint listings_paused_check
  check (paused_at is null or status = 'active');

-- The scheduled job's lookups.
create index if not exists listings_active_expiry_idx
  on public.listings (expires_at)
  where status = 'active';
create index if not exists rental_requests_open_updated_idx
  on public.rental_requests (updated_at)
  where status in ('pending', 'shortlisted');

-- 2. New notification types ----------------------------------------------------------
--   ad_expiring          the poster: the ad expires in 3 days
--   ad_expired           the poster: the ad expired
--   request_expired      both sides: no step or message for 14 days
--   caretaker_invited    the invited member
--   caretaker_joined     the owner who invited: the invitation was accepted
--   caretaker_declined   the owner who invited: the invitation was declined
--   caretaker_removed    the caretaker: the owner removed them
--   caretaker_left       the building's owners: a caretaker left

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (
  type in (
    'request_new', 'request_shortlisted', 'request_declined',
    'offer_received', 'offer_taken_back', 'offer_accepted', 'offer_turned_down', 'offer_expired',
    'ad_approved', 'ad_rejected', 'ad_hidden', 'ad_restored',
    'ad_expiring', 'ad_expired', 'request_expired',
    'caretaker_invited', 'caretaker_joined', 'caretaker_declined', 'caretaker_removed', 'caretaker_left'
  )
);

-- 3. Helpers ------------------------------------------------------------------------------

-- How long an ad stays live, and when it can be renewed.
create or replace function public.listing_constants()
returns table (live_days integer, renew_before_days integer, renew_after_days integer, remind_days integer)
language sql
immutable
set search_path = ''
as $$
  select 30, 7, 30, 3;
$$;

grant execute on function public.listing_constants() to anon, authenticated;

-- The caller's own ad, locked for a change. Internal.
create or replace function public.lock_posted_listing(p_listing_id uuid)
returns public.listings
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
  select * into v_l from public.listings where id = p_listing_id for update;
  if not found or v_l.posted_by is distinct from v_uid then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return v_l;
end;
$$;

revoke execute on function public.lock_posted_listing(uuid) from public, anon, authenticated;

create or replace function public.require_not_banned()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.profiles where id = auth.uid() and is_banned) then
    raise exception 'banned' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.require_not_banned() from public, anon, authenticated;

-- Another ad that holds the unit (the same statuses as listings_one_open_per_unit).
create or replace function public.unit_has_other_open_listing(p_unit_id uuid, p_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.listings
    where unit_id = p_unit_id and id is distinct from p_listing_id
      and status in ('draft', 'pending_review', 'active', 'hidden')
  );
$$;

revoke execute on function public.unit_has_other_open_listing(uuid, uuid) from public, anon, authenticated;

-- The owner's name for a caretaker's ad: the caretaker's previous ad in the
-- building, or the owner's name when the owner is on the site. Internal.
create or replace function public.default_owner_name(p_building_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select l.owner_name from public.listings l
      join public.units u on u.id = l.unit_id
      where u.building_id = p_building_id and l.owner_name is not null
      order by l.created_at desc limit 1
    ),
    (
      select left(nullif(trim(p.full_name), ''), 80)
      from public.building_managers m
      join public.profiles p on p.id = m.user_id
      where m.building_id = p_building_id and m.role = 'owner'
        and char_length(trim(p.full_name)) >= 2
      order by m.created_at limit 1
    )
  );
$$;

revoke execute on function public.default_owner_name(uuid) from public, anon, authenticated;

-- 4. Pause and resume ------------------------------------------------------------------

create or replace function public.pause_listing(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_l public.listings%rowtype;
begin
  v_l := public.lock_posted_listing(p_listing_id);
  perform public.require_not_banned();
  if v_l.status <> 'active' or v_l.paused_at is not null then
    raise exception 'wrong_status' using errcode = 'P0001';
  end if;
  update public.listings set paused_at = now() where id = p_listing_id;
end;
$$;

create or replace function public.resume_listing(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_l public.listings%rowtype;
begin
  v_l := public.lock_posted_listing(p_listing_id);
  perform public.require_not_banned();
  if v_l.status <> 'active' or v_l.paused_at is null then
    raise exception 'wrong_status' using errcode = 'P0001';
  end if;
  update public.listings set paused_at = null where id = p_listing_id;
end;
$$;

revoke execute on function public.pause_listing(uuid) from public, anon;
revoke execute on function public.resume_listing(uuid) from public, anon;
grant execute on function public.pause_listing(uuid) to authenticated;
grant execute on function public.resume_listing(uuid) to authenticated;

-- No new request for a paused ad. A trigger, so send_request (F6, F8) keeps
-- its own checks unchanged.
create or replace function public.rental_requests_block_paused()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.listings where id = new.listing_id and paused_at is not null) then
    raise exception 'listing_paused' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.rental_requests_block_paused() from public, anon, authenticated;

drop trigger if exists rental_requests_block_paused on public.rental_requests;
create trigger rental_requests_block_paused
  before insert on public.rental_requests
  for each row execute function public.rental_requests_block_paused();

-- reveal_contact (F3): a paused ad's numbers are only for members who
-- already have a request on it. Otherwise the same as F3.
create or replace function public.reveal_contact(p_listing_id uuid)
returns table (contact_phone text, whatsapp text, remaining integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_l record;
  v_used integer;
  v_limit constant integer := 20;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles where id = v_uid and is_banned) then
    raise exception 'banned' using errcode = '42501';
  end if;

  select l.posted_by, l.status, l.unit_id, l.paused_at into v_l from public.listings l where l.id = p_listing_id;
  if not found then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select count(distinct r.listing_id) into v_used
  from public.contact_reveals r
  where r.user_id = v_uid and r.created_at > now() - interval '24 hours';

  -- The poster and the building's managers see their own numbers freely.
  if v_l.posted_by <> v_uid and not public.can_manage_building(public.unit_building_id(v_l.unit_id)) then
    if v_l.status <> 'active' then
      raise exception 'not_allowed' using errcode = '42501';
    end if;
    if v_l.paused_at is not null and not exists (
      select 1 from public.rental_requests r
      where r.listing_id = p_listing_id and r.tenant_id = v_uid
        and r.status in ('pending', 'shortlisted', 'offered', 'confirmed')
    ) then
      raise exception 'listing_paused' using errcode = 'P0001';
    end if;

    if not exists (
      select 1 from public.contact_reveals r
      where r.user_id = v_uid and r.listing_id = p_listing_id and r.created_at > now() - interval '24 hours'
    ) then
      if v_used >= v_limit then
        raise exception 'reveal_limit' using errcode = 'P0001';
      end if;
      insert into public.contact_reveals (user_id, listing_id) values (v_uid, p_listing_id);
      v_used := v_used + 1;
    end if;
  end if;

  return query
    select p.contact_phone, p.whatsapp, greatest(v_limit - v_used, 0)
    from public.listing_private p
    where p.listing_id = p_listing_id;
end;
$$;

revoke execute on function public.reveal_contact(uuid) from public, anon;
grant execute on function public.reveal_contact(uuid) to authenticated;

-- search_listings (F4): the same, without paused ads.
create or replace function public.search_listings(
  p_q text default null,
  p_area_ids integer[] default null,
  p_types text[] default null,
  p_tenant_types text[] default null,
  p_rent_min integer default null,
  p_rent_max integer default null,
  p_bedrooms_min integer default null,
  p_amenities text[] default null,
  p_gas text default null,
  p_available_by date default null,
  p_bounds double precision[] default null,
  p_sort text default 'newest',
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  title text,
  listing_type public.listing_type,
  tenant_types text[],
  monthly_rent integer,
  rent_negotiable boolean,
  open_slots smallint,
  available_from date,
  published_at timestamptz,
  area_id integer,
  landmark text,
  approx_lat numeric,
  approx_lng numeric,
  gas public.gas_type,
  amenities text[],
  unit_kind public.unit_kind,
  bedrooms smallint,
  bathrooms smallint,
  size_sqft integer,
  furnishing public.furnishing,
  cover_path text,
  photo_count integer,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with words as (
    select d.word
    from (
      select distinct public.search_compact(w) as word
      from regexp_split_to_table(left(coalesce(p_q, ''), 100), '[[:space:],।]+') as w
    ) d
    where d.word <> ''
    limit 6
  ),
  -- Area and thana names in both languages, compacted once per search.
  area_texts as (
    select a.id as area_id,
           public.search_compact(concat_ws(' ', a.name_en, a.name_bn, t.name_en, t.name_bn)) as txt
    from public.areas a
    join public.thanas t on t.id = a.thana_id
    where exists (select 1 from words)
  ),
  -- Areas whose English name (or thana name) is close to a typed word.
  area_hits as (
    select w.word, a.id as area_id
    from words w
    cross join public.areas a
    join public.thanas t on t.id = a.thana_id
    where w.word ~ '^[a-z]{4,}$'
      and greatest(
        extensions.word_similarity(w.word, public.search_compact(a.name_en)),
        extensions.word_similarity(w.word, public.search_compact(t.name_en))
      ) >= 0.5
  ),
  matched as (
    select
      l.id, l.title, l.listing_type, l.tenant_types, l.monthly_rent, l.rent_negotiable,
      l.open_slots, l.available_from, l.published_at,
      b.area_id, b.landmark, b.approx_lat, b.approx_lng, b.gas, b.amenities,
      u.unit_kind, u.bedrooms, u.bathrooms, u.size_sqft, u.furnishing
    from public.listings l
    join public.units u on u.id = l.unit_id
    join public.buildings b on b.id = u.building_id
    where l.status = 'active'
      -- F10: a paused ad stays reachable by its link but leaves search and the map.
      and l.paused_at is null
      and (coalesce(cardinality(p_area_ids), 0) = 0 or b.area_id = any (p_area_ids))
      and (coalesce(cardinality(p_types), 0) = 0 or l.listing_type::text = any (p_types))
      and (coalesce(cardinality(p_tenant_types), 0) = 0 or l.tenant_types && p_tenant_types)
      and (p_rent_min is null or l.monthly_rent >= p_rent_min)
      and (p_rent_max is null or l.monthly_rent <= p_rent_max)
      and (p_bedrooms_min is null or u.bedrooms >= p_bedrooms_min)
      and (coalesce(cardinality(p_amenities), 0) = 0 or b.amenities @> p_amenities)
      and (p_gas is null or (p_gas = 'any' and b.gas <> 'none') or b.gas::text = p_gas)
      and (p_available_by is null or l.available_from <= p_available_by)
      and (
        cardinality(p_bounds) is distinct from 4
        or (
          b.approx_lat between p_bounds[1] and p_bounds[3]
          and b.approx_lng between p_bounds[2] and p_bounds[4]
        )
      )
      -- Keyword: no word may be missing. Never the building name or address.
      and not exists (
        select 1
        from words w
        where l.search_text not like '%' || w.word || '%'
          and public.search_compact(b.landmark) not like '%' || w.word || '%'
          and not exists (
            select 1 from area_texts x
            where x.area_id = b.area_id and x.txt like '%' || w.word || '%'
          )
          and not exists (select 1 from area_hits h where h.word = w.word and h.area_id = b.area_id)
      )
  ),
  page as (
    select
      m.*,
      count(*) over () as total_count,
      row_number() over (
        order by
          case when p_sort = 'rent_asc' then m.monthly_rent end asc nulls last,
          case when p_sort = 'rent_desc' then m.monthly_rent end desc nulls last,
          m.published_at desc nulls last,
          m.id
      ) as rn
    from matched m
    order by rn
    limit least(greatest(coalesce(p_limit, 20), 1), 300)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select
    p.id, p.title, p.listing_type, p.tenant_types, p.monthly_rent, p.rent_negotiable,
    p.open_slots, p.available_from, p.published_at,
    p.area_id, p.landmark, p.approx_lat, p.approx_lng, p.gas, p.amenities,
    p.unit_kind, p.bedrooms, p.bathrooms, p.size_sqft, p.furnishing,
    cover.storage_path,
    coalesce(photos.n, 0),
    p.total_count
  from page p
  left join lateral (
    select ph.storage_path
    from public.listing_photos ph
    where ph.listing_id = p.id
    order by ph.sort_order
    limit 1
  ) cover on true
  left join lateral (
    select count(*)::integer as n
    from public.listing_photos ph
    where ph.listing_id = p.id
  ) photos on true
  order by p.rn;
$$;

revoke execute on function public.search_listings(
  text, integer[], text[], text[], integer, integer, integer, text[], text, date, double precision[], text, integer, integer
) from public;
grant execute on function public.search_listings(
  text, integer[], text[], text[], integer, integer, integer, text[], text, date, double precision[], text, integer, integer
) to anon, authenticated;

-- 5. Renew ---------------------------------------------------------------------------
-- A live ad in its last 7 days, or an expired ad up to 30 days after it
-- expired, gets 30 more days from now. A renewed expired ad goes straight
-- back live (it was checked when it was first published), if its unit is
-- still free. Returns the new expiry time.

create or replace function public.renew_listing(p_listing_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_l public.listings%rowtype;
  v_c record;
  v_unit public.units%rowtype;
  v_expires timestamptz;
begin
  v_l := public.lock_posted_listing(p_listing_id);
  perform public.require_not_banned();
  select * into v_c from public.listing_constants();

  if v_l.status = 'active' then
    if v_l.expires_at > now() + make_interval(days => v_c.renew_before_days) then
      raise exception 'renew_too_early' using errcode = 'P0001';
    end if;
  elsif v_l.status = 'expired' then
    if v_l.expires_at < now() - make_interval(days => v_c.renew_after_days) then
      raise exception 'renew_too_late' using errcode = 'P0001';
    end if;
    select * into v_unit from public.units where id = v_l.unit_id for update;
    if public.unit_has_other_open_listing(v_l.unit_id, p_listing_id) then
      raise exception 'unit_has_open_listing' using errcode = 'P0001';
    end if;
    if v_unit.status = 'occupied' then
      raise exception 'unit_occupied' using errcode = 'P0001';
    end if;
  else
    raise exception 'wrong_status' using errcode = 'P0001';
  end if;

  v_expires := now() + make_interval(days => v_c.live_days);
  update public.listings set
    status = 'active',
    expires_at = v_expires,
    expiry_reminded_at = null
  where id = p_listing_id;
  update public.units set status = 'listed' where id = v_l.unit_id and status = 'vacant';
  return v_expires;
end;
$$;

revoke execute on function public.renew_listing(uuid) from public, anon;
grant execute on function public.renew_listing(uuid) to authenticated;

-- 6. Mark as rented --------------------------------------------------------------------
-- The poster found a tenant outside the site. Works on a live (or paused)
-- ad and on an expired one. The unit becomes occupied, and every open
-- request is declined with the "filled" reason (each member is told, F9).
-- No tenancy is created: there is no tenant on the site.

create or replace function public.mark_listing_rented(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_l public.listings%rowtype;
begin
  v_l := public.lock_posted_listing(p_listing_id);
  if v_l.status not in ('active', 'expired') then
    raise exception 'wrong_status' using errcode = 'P0001';
  end if;
  -- An expired ad no longer holds the unit; another ad may hold it now.
  if v_l.status = 'expired' and public.unit_has_other_open_listing(v_l.unit_id, p_listing_id) then
    raise exception 'unit_has_open_listing' using errcode = 'P0001';
  end if;

  -- Offers past 48 hours are expired, not declined.
  perform public.expire_offers(p_listing_id);
  update public.rental_requests
  set status = 'declined', decline_reason = 'filled', decline_note = null, closed_at = now()
  where listing_id = p_listing_id and status in ('pending', 'shortlisted', 'offered');

  update public.listings set status = 'rented', open_slots = 0 where id = p_listing_id;
  update public.units set status = 'occupied' where id = v_l.unit_id;
end;
$$;

revoke execute on function public.mark_listing_rented(uuid) from public, anon;
grant execute on function public.mark_listing_rented(uuid) to authenticated;

-- 7. A unit is free again, and re-listing ----------------------------------------------

-- An occupied unit without a tenancy on the site (rented outside it, or
-- marked rented) becomes vacant. Tenancies made on the site end in House
-- Manage, which is planned separately.
create or replace function public.mark_unit_vacant(p_unit_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit public.units%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  perform public.require_not_banned();
  select * into v_unit from public.units where id = p_unit_id for update;
  if not found or not public.can_manage_building(v_unit.building_id) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_unit.status <> 'occupied' then
    raise exception 'wrong_status' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.tenancies where unit_id = p_unit_id and status = 'active') then
    raise exception 'unit_has_tenancy' using errcode = 'P0001';
  end if;
  update public.units set status = 'vacant' where id = p_unit_id;
end;
$$;

revoke execute on function public.mark_unit_vacant(uuid) from public, anon;
grant execute on function public.mark_unit_vacant(uuid) to authenticated;

-- Re-list (FR37): a rented or expired ad becomes a new draft for the same
-- unit with its details filled in. A rented unit is marked vacant on the
-- way (re-listing says the place is free again), unless a tenancy on the
-- site is still active. The poster of the old ad, or a manager of the
-- building, can do it; the new draft is theirs. The app copies the photos
-- (storage files cannot be copied from SQL). Returns the draft's id; a
-- second click returns the same draft.
create or replace function public.relist_listing(p_listing_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_old public.listings%rowtype;
  v_unit public.units%rowtype;
  v_role public.manager_role;
  v_posted_as public.posted_as;
  v_type public.listing_type;
  v_allowed public.listing_type[];
  v_open record;
  v_today date := (now() at time zone 'Asia/Dhaka')::date;
  v_phone text;
  v_whatsapp text;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  perform public.require_not_banned();

  select * into v_old from public.listings where id = p_listing_id;
  if not found then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select * into v_unit from public.units where id = v_old.unit_id for update;
  if not (v_old.posted_by = v_uid or public.can_manage_building(v_unit.building_id)) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_old.status not in ('rented', 'expired') then
    raise exception 'wrong_status' using errcode = 'P0001';
  end if;

  select id, posted_by, status into v_open
  from public.listings
  where unit_id = v_unit.id and status in ('draft', 'pending_review', 'active', 'hidden');
  if found then
    if v_open.status = 'draft' and v_open.posted_by = v_uid then
      return v_open.id;
    end if;
    raise exception 'unit_has_open_listing' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.tenancies where unit_id = v_unit.id and status = 'active') then
    raise exception 'unit_has_tenancy' using errcode = 'P0001';
  end if;
  if v_unit.status = 'occupied' then
    update public.units set status = 'vacant' where id = v_unit.id;
  end if;

  -- Who is posting follows from the person's link to the building (as in
  -- create_listing_draft).
  select role into v_role from public.building_managers
  where building_id = v_unit.building_id and user_id = v_uid;
  v_posted_as := case
    when v_role = 'owner' then 'owner'
    when v_role = 'caretaker' then 'caretaker'
    else 'tenant_sublet'
  end;
  -- Keep the old ad type when it still fits the unit and the poster.
  v_allowed := case
    when v_unit.unit_kind = 'mess_room' then array['mess_seat']::public.listing_type[]
    when v_posted_as = 'tenant_sublet' then array['sublet', 'room']::public.listing_type[]
    when v_unit.unit_kind = 'room' then array['room', 'sublet']::public.listing_type[]
    else array['flat', 'room', 'sublet']::public.listing_type[]
  end;
  v_type := case when v_old.listing_type = any (v_allowed) then v_old.listing_type else v_allowed[1] end;

  insert into public.listings (
    unit_id, posted_by, posted_as, owner_name, sublet_consent, listing_type, tenant_types,
    title, description, open_slots, max_occupants, monthly_rent, rent_negotiable,
    advance_months, service_charge, electricity, water, gas_bill, other_charges,
    extra_rules, agreement_required, dmp_form_required, available_from, relisted_from
  ) values (
    v_unit.id, v_uid, v_posted_as,
    case when v_posted_as = 'caretaker' then coalesce(v_old.owner_name, public.default_owner_name(v_unit.building_id)) end,
    -- A subletting tenant confirms the owner's permission again.
    false,
    v_type, v_old.tenant_types, v_old.title, v_old.description,
    -- A rented ad has no places left; offer the whole unit again.
    case when v_type = 'mess_seat'
      then least(v_unit.capacity, case when v_old.open_slots > 0 then v_old.open_slots else v_unit.capacity end)
      else 1 end,
    v_old.max_occupants, v_old.monthly_rent, v_old.rent_negotiable,
    v_old.advance_months, v_old.service_charge, v_old.electricity, v_old.water, v_old.gas_bill,
    v_old.other_charges, v_old.extra_rules, v_old.agreement_required, v_old.dmp_form_required,
    case when v_old.available_from >= v_today then v_old.available_from end,
    v_old.id
  )
  returning id into v_id;

  -- The old numbers when the same person posts again, otherwise the new
  -- poster's own number.
  if v_old.posted_by = v_uid then
    select contact_phone, whatsapp into v_phone, v_whatsapp
    from public.listing_private where listing_id = v_old.id;
  end if;
  if v_phone is null then
    select phone into v_phone from public.profile_private where user_id = v_uid;
    v_whatsapp := null;
  end if;
  insert into public.listing_private (listing_id, contact_phone, whatsapp) values (v_id, v_phone, v_whatsapp);

  return v_id;
end;
$$;

revoke execute on function public.relist_listing(uuid) from public, anon;
grant execute on function public.relist_listing(uuid) to authenticated;

-- create_listing_draft (F8): a caretaker's draft now also takes the owner's
-- name from the owner's profile when the owner is on the site (they invited
-- the caretaker). Otherwise the same as F8.
create or replace function public.create_listing_draft(p_unit_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_unit public.units%rowtype;
  v_role public.manager_role;
  v_posted_as public.posted_as;
  v_type public.listing_type;
  v_open record;
  v_id uuid;
  v_phone text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles where id = v_uid and is_banned) then
    raise exception 'banned' using errcode = '42501';
  end if;

  select * into v_unit from public.units where id = p_unit_id;
  if not found or not public.can_manage_building(v_unit.building_id) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select id, posted_by, status into v_open
  from public.listings
  where unit_id = p_unit_id and status in ('draft', 'pending_review', 'active', 'hidden');

  if found then
    if v_open.status = 'draft' and v_open.posted_by = v_uid then
      return v_open.id;
    end if;
    raise exception 'unit_has_open_listing' using errcode = 'P0001';
  end if;

  if v_unit.status = 'occupied' then
    raise exception 'unit_occupied' using errcode = 'P0001';
  end if;

  select role into v_role from public.building_managers
  where building_id = v_unit.building_id and user_id = v_uid;

  -- Who is posting follows from the person's link to the building.
  v_posted_as := case
    when v_role = 'owner' then 'owner'
    when v_role = 'caretaker' then 'caretaker'
    else 'tenant_sublet'
  end;

  v_type := case
    when v_unit.unit_kind = 'mess_room' then 'mess_seat'
    when v_posted_as = 'tenant_sublet' then 'sublet'
    when v_unit.unit_kind = 'room' then 'room'
    else 'flat'
  end;

  select phone into v_phone from public.profile_private where user_id = v_uid;

  insert into public.listings (unit_id, posted_by, posted_as, listing_type, open_slots, owner_name)
  values (
    p_unit_id, v_uid, v_posted_as, v_type, 1,
    case when v_posted_as = 'caretaker' then public.default_owner_name(v_unit.building_id) end
  )
  returning id into v_id;

  insert into public.listing_private (listing_id, contact_phone)
  values (v_id, v_phone);

  return v_id;
end;
$$;

revoke execute on function public.create_listing_draft(uuid) from public, anon;
grant execute on function public.create_listing_draft(uuid) to authenticated;

-- 8. Editing a live ad ------------------------------------------------------------------
-- Drafts are still edited directly (RLS, F2). A live ad (paused or not) is
-- edited through this function. p_values has the wizard's columns (any of
-- them); the ad type, who is posting and the sublet permission stay as they
-- are. p_contact is { contact_phone, whatsapp } or null.
--
-- The change goes live at once. Then the automatic checks (F5) that the
-- change could set off run again: the words and numbers in the text when
-- the text changed, the rent check when the rent changed, the phone checks
-- when a number changed, and "new member" always. A flag an admin has not
-- seen on this ad before sends it back to the review queue. Returns the
-- ad's status: 'active' or 'pending_review'.

create or replace function public.edit_live_listing(p_listing_id uuid, p_values jsonb, p_contact jsonb default null)
returns public.listing_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_editable constant text[] := array[
    'title', 'description', 'available_from', 'owner_name', 'monthly_rent', 'rent_negotiable',
    'advance_months', 'service_charge', 'electricity', 'water', 'gas_bill', 'other_charges',
    'tenant_types', 'max_occupants', 'open_slots', 'extra_rules', 'agreement_required'
  ];
  v_old public.listings%rowtype;
  v_new public.listings%rowtype;
  v_values jsonb;
  v_unit public.units%rowtype;
  v_old_phones text[];
  v_new_phones text[];
  v_held integer;
  v_missing text[] := '{}';
  v_text_changed boolean;
  v_rent_changed boolean;
  v_phone_changed boolean := false;
  v_f record;
  v_flagged boolean := false;
begin
  v_old := public.lock_posted_listing(p_listing_id);
  perform public.require_not_banned();
  if v_old.status <> 'active' then
    raise exception 'wrong_status' using errcode = 'P0001';
  end if;
  if p_values is null or jsonb_typeof(p_values) <> 'object' then
    raise exception 'invalid_values' using errcode = '22023';
  end if;

  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_values
  from jsonb_each(p_values) e
  where e.key = any (v_editable);
  if v_old.posted_as <> 'caretaker' then
    v_values := v_values - 'owner_name';
  end if;
  v_new := jsonb_populate_record(v_old, v_values);

  -- A live ad keeps everything submit_listing asked for.
  select * into v_unit from public.units where id = v_old.unit_id;
  if v_new.title is null then v_missing := array_append(v_missing, 'title'); end if;
  if v_new.available_from is null then v_missing := array_append(v_missing, 'available_from'); end if;
  if v_new.monthly_rent is null then v_missing := array_append(v_missing, 'monthly_rent'); end if;
  if v_new.advance_months is null then v_missing := array_append(v_missing, 'advance_months'); end if;
  if v_new.electricity is null then v_missing := array_append(v_missing, 'electricity'); end if;
  if v_new.water is null then v_missing := array_append(v_missing, 'water'); end if;
  if coalesce(cardinality(v_new.tenant_types), 0) = 0 then v_missing := array_append(v_missing, 'tenant_types'); end if;
  if v_new.posted_as = 'caretaker' and v_new.owner_name is null then v_missing := array_append(v_missing, 'owner_name'); end if;
  if v_new.open_slots is null or v_new.open_slots < 1 or v_new.open_slots > v_unit.capacity then
    v_missing := array_append(v_missing, 'open_slots');
  end if;
  if p_contact is not null and nullif(p_contact ->> 'contact_phone', '') is null then
    v_missing := array_append(v_missing, 'contact_phone');
  end if;
  if cardinality(v_missing) > 0 then
    raise exception 'listing_incomplete' using errcode = 'P0001', detail = array_to_string(v_missing, ',');
  end if;

  -- Open offers keep their places (F8).
  select coalesce(sum(public.request_seats(v_old.listing_type, r.members_count)), 0) into v_held
  from public.rental_requests r
  where r.listing_id = p_listing_id and r.status = 'offered' and r.offer_expires_at > now();
  if v_new.open_slots < v_held then
    raise exception 'slots_below_offers' using errcode = 'P0001', detail = v_held::text;
  end if;

  update public.listings set
    title = v_new.title,
    description = v_new.description,
    available_from = v_new.available_from,
    owner_name = v_new.owner_name,
    monthly_rent = v_new.monthly_rent,
    rent_negotiable = v_new.rent_negotiable,
    advance_months = v_new.advance_months,
    service_charge = v_new.service_charge,
    electricity = v_new.electricity,
    water = v_new.water,
    gas_bill = v_new.gas_bill,
    other_charges = v_new.other_charges,
    tenant_types = v_new.tenant_types,
    max_occupants = v_new.max_occupants,
    open_slots = v_new.open_slots,
    extra_rules = v_new.extra_rules,
    agreement_required = v_new.agreement_required
  where id = p_listing_id;

  if p_contact is not null then
    select array_remove(array[contact_phone, whatsapp], null) into v_old_phones
    from public.listing_private where listing_id = p_listing_id;
    update public.listing_private set
      contact_phone = nullif(p_contact ->> 'contact_phone', ''),
      whatsapp = nullif(p_contact ->> 'whatsapp', '')
    where listing_id = p_listing_id
    returning array_remove(array[contact_phone, whatsapp], null) into v_new_phones;
    v_phone_changed := exists (
      select 1 from unnest(coalesce(v_new_phones, '{}')) x where x <> all (coalesce(v_old_phones, '{}'))
    );
  end if;

  v_text_changed := (v_new.title, v_new.description, v_new.extra_rules, v_new.other_charges)
    is distinct from (v_old.title, v_old.description, v_old.extra_rules, v_old.other_charges);
  v_rent_changed := v_new.monthly_rent is distinct from v_old.monthly_rent
    or v_new.listing_type is distinct from v_old.listing_type;

  for v_f in select * from public.compute_listing_flags(p_listing_id) loop
    if (
      v_f.flag = 'new_member'
      or (v_f.flag in ('banned_words', 'phone_in_text') and v_text_changed)
      or (v_f.flag = 'rent_outlier' and v_rent_changed)
      or (v_f.flag in ('phone_many_ads', 'phone_other_member') and v_phone_changed)
    ) and not exists (
      select 1 from public.listing_flags where listing_id = p_listing_id and flag = v_f.flag
    ) then
      insert into public.listing_flags (listing_id, flag, detail) values (p_listing_id, v_f.flag, v_f.detail);
      v_flagged := true;
    end if;
  end loop;

  if v_flagged then
    update public.listings set status = 'pending_review', submitted_at = now() where id = p_listing_id;
    return 'pending_review';
  end if;
  return 'active';
end;
$$;

revoke execute on function public.edit_live_listing(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.edit_live_listing(uuid, jsonb, jsonb) to authenticated;

-- A draft that has requests (a live ad sent back to review by an edit, or
-- rejected, and then taken back to a draft) cannot be deleted: the requests
-- and their messages would go with it.
create or replace function public.listing_has_requests(p_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.rental_requests where listing_id = p_listing_id);
$$;

revoke execute on function public.listing_has_requests(uuid) from public, anon;
grant execute on function public.listing_has_requests(uuid) to authenticated;

drop policy if exists "poster deletes own drafts" on public.listings;
create policy "poster deletes own drafts"
  on public.listings for delete to authenticated
  using (posted_by = (select auth.uid()) and status = 'draft' and not public.listing_has_requests(id));

-- Photos of a live ad (F3 allowed changes on drafts only). The same checks,
-- plus: a live ad keeps at least 4 photos, and a new photo that is also on
-- another member's ad (or in another building) sends the ad to review.

-- Like lock_own_draft (F3), for a draft or a live ad. Returns the status.
create or replace function public.lock_own_editable_listing(p_listing_id uuid)
returns public.listing_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_l record;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles where id = v_uid and is_banned) then
    raise exception 'banned' using errcode = '42501';
  end if;
  select posted_by, status into v_l from public.listings where id = p_listing_id for update;
  if not found or v_l.posted_by is distinct from v_uid then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_l.status not in ('draft', 'active') then
    raise exception 'not_a_draft' using errcode = 'P0001';
  end if;
  return v_l.status;
end;
$$;

revoke execute on function public.lock_own_editable_listing(uuid) from public, anon, authenticated;

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
  v_status public.listing_status;
  v_count integer;
  v_id uuid;
  v_f record;
begin
  v_status := public.lock_own_editable_listing(p_listing_id);

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

  if v_status = 'active' then
    for v_f in select * from public.compute_listing_flags(p_listing_id) f where f.flag = 'photo_reused' loop
      if not exists (select 1 from public.listing_flags where listing_id = p_listing_id and flag = 'photo_reused') then
        insert into public.listing_flags (listing_id, flag, detail) values (p_listing_id, v_f.flag, v_f.detail);
        update public.listings set status = 'pending_review', submitted_at = now() where id = p_listing_id;
      end if;
    end loop;
  end if;

  return v_id;
end;
$$;

create or replace function public.remove_listing_photo(p_photo_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_photo public.listing_photos%rowtype;
  v_status public.listing_status;
begin
  select * into v_photo from public.listing_photos where id = p_photo_id;
  if not found then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  v_status := public.lock_own_editable_listing(v_photo.listing_id);
  if v_status = 'active' and (select count(*) from public.listing_photos where listing_id = v_photo.listing_id) <= 4 then
    raise exception 'photo_minimum' using errcode = 'P0001';
  end if;

  delete from public.listing_photos where id = p_photo_id;

  update public.listing_photos set is_cover = false where listing_id = v_photo.listing_id and is_cover;
  update public.listing_photos p set
    sort_order = o.rn - 1,
    is_cover = o.rn = 1
  from (
    select id, row_number() over (order by sort_order, created_at) as rn
    from public.listing_photos where listing_id = v_photo.listing_id
  ) o
  where p.id = o.id;

  return v_photo.storage_path;
end;
$$;

create or replace function public.reorder_listing_photos(p_listing_id uuid, p_photo_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.lock_own_editable_listing(p_listing_id);

  if p_photo_ids is null
    or cardinality(p_photo_ids) <> (select count(*) from public.listing_photos where listing_id = p_listing_id)
    or cardinality(p_photo_ids) <> (select count(distinct x) from unnest(p_photo_ids) as x)
    or exists (
      select 1 from unnest(p_photo_ids) as x
      where not exists (select 1 from public.listing_photos p where p.id = x and p.listing_id = p_listing_id)
    )
  then
    raise exception 'invalid_order' using errcode = '22023';
  end if;

  -- Two statements, because the one-cover index is checked row by row.
  update public.listing_photos set is_cover = false where listing_id = p_listing_id and is_cover;
  update public.listing_photos p set
    sort_order = o.ord - 1,
    is_cover = o.ord = 1
  from unnest(p_photo_ids) with ordinality as o (id, ord)
  where p.id = o.id;
end;
$$;

revoke execute on function public.add_listing_photo(uuid, text, integer, integer, text) from public, anon;
revoke execute on function public.remove_listing_photo(uuid) from public, anon;
revoke execute on function public.reorder_listing_photos(uuid, uuid[]) from public, anon;
grant execute on function public.add_listing_photo(uuid, text, integer, integer, text) to authenticated;
grant execute on function public.remove_listing_photo(uuid) to authenticated;
grant execute on function public.reorder_listing_photos(uuid, uuid[]) to authenticated;

-- Uploads now also go into the poster's live ads (and re-listed drafts get
-- their copied photos the same way).
drop policy if exists "posters upload photos to own drafts" on storage.objects;
drop policy if exists "posters upload photos to own drafts and live ads" on storage.objects;
create policy "posters upload photos to own drafts and live ads"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.listings l
      where l.id::text = (storage.foldername(name))[2]
        and l.posted_by = (select auth.uid())
        and l.status in ('draft', 'active')
    )
  );

-- 9. Expiry, reminders and stale requests (the scheduled job's parts) ---------------------

-- Live ads past their 30 days. The unit is free again. Returns how many.
create or replace function public.expire_listings()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_units uuid[];
begin
  with gone as (
    update public.listings
    set status = 'expired'
    where status = 'active' and expires_at <= now()
    returning unit_id
  )
  select count(*), array_agg(unit_id) into v_count, v_units from gone;

  update public.units set status = 'vacant'
  where id = any (coalesce(v_units, '{}')) and status = 'listed';
  return v_count;
end;
$$;

revoke execute on function public.expire_listings() from public, anon, authenticated;

-- "Your ad expires in 3 days", once per ad and expiry date. Returns how many.
create or replace function public.remind_expiring_listings()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_l record;
  v_count integer := 0;
begin
  for v_l in
    select l.id, l.posted_by, l.title, l.listing_type, l.expires_at
    from public.listings l
    where l.status = 'active'
      and l.expiry_reminded_at is null
      and l.expires_at > now()
      and l.expires_at <= now() + make_interval(days => (select remind_days from public.listing_constants()))
    for update skip locked
  loop
    if not exists (select 1 from public.profiles where id = v_l.posted_by and is_banned) then
      perform public.add_notification(
        v_l.posted_by, 'ad_expiring', null, v_l.id,
        jsonb_build_object('title', v_l.title, 'listing_type', v_l.listing_type, 'expires_at', v_l.expires_at)
      );
    end if;
    update public.listings set expiry_reminded_at = now() where id = v_l.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.remind_expiring_listings() from public, anon, authenticated;

-- A new or shortlisted request with no step and no message for 14 days
-- (plan section 1.4). The member can send a new request afterwards.
-- Returns how many.
create or replace function public.expire_stale_requests()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.rental_requests r
  set status = 'expired', closed_at = now()
  where r.status in ('pending', 'shortlisted')
    and r.updated_at < now() - interval '14 days'
    and not exists (
      select 1 from public.messages m
      where m.request_id = r.id and m.created_at >= now() - interval '14 days'
    );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.expire_stale_requests() from public, anon, authenticated;

-- notify_request_change (F9): also "request_expired" for both sides.
-- Otherwise the same as F9.
create or replace function public.notify_request_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_type text;
  v_to_seeker boolean := false;
  v_to_landlord boolean := false;
  v_expiry boolean;
  v_title text;
  v_listing_type public.listing_type;
  v_member text;
  v_data jsonb;
  v_uid uuid;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' then
      return null;
    end if;
    v_type := 'request_new';
    v_to_landlord := true;
  elsif new.status is not distinct from old.status then
    return null;
  elsif old.status = 'pending' and new.status = 'shortlisted' then
    v_type := 'request_shortlisted';
    v_to_seeker := true;
  elsif new.status = 'offered' then
    v_type := 'offer_received';
    v_to_seeker := true;
  elsif old.status = 'offered' and new.status = 'confirmed' then
    v_type := 'offer_accepted';
    v_to_landlord := true;
  elsif new.status = 'declined' then
    -- A landlord's answer, or the automatic "filled" when the place is taken.
    v_type := case when old.status = 'offered' then 'offer_taken_back' else 'request_declined' end;
    v_to_seeker := true;
  elsif old.status = 'offered' and new.status = 'withdrawn' then
    v_type := 'offer_turned_down';
    v_to_landlord := true;
  elsif old.status = 'offered' and new.status = 'expired' then
    v_type := 'offer_expired';
    v_to_seeker := true;
    v_to_landlord := true;
  elsif old.status in ('pending', 'shortlisted') and new.status = 'expired' then
    -- F10: 14 days without a step or a message.
    v_type := 'request_expired';
    v_to_seeker := true;
    v_to_landlord := true;
  else
    -- Withdrawing a new or shortlisted request tells nobody: it simply
    -- leaves the landlord's inbox.
    return null;
  end if;
  v_expiry := v_type in ('offer_expired', 'request_expired');

  select l.title, l.listing_type into v_title, v_listing_type
  from public.listings l where l.id = new.listing_id;
  select p.full_name into v_member from public.profiles p where p.id = new.tenant_id;

  v_data := jsonb_build_object('title', v_title, 'listing_type', v_listing_type);
  if v_type = 'request_new' then
    v_data := v_data || jsonb_build_object(
      'member_name', v_member,
      'members_count', new.members_count,
      'household_type', new.household_type
    );
  elsif v_type = 'offer_received' then
    v_data := v_data || jsonb_build_object('rent', new.offer_rent, 'expires_at', new.offer_expires_at);
  elsif v_type in ('request_declined', 'offer_taken_back') then
    v_data := v_data || jsonb_build_object('reason', new.decline_reason);
  elsif v_type in ('offer_accepted', 'offer_turned_down', 'offer_expired', 'request_expired') then
    v_data := v_data || jsonb_build_object('member_name', v_member);
  end if;

  -- Expiry is nobody's action (the job, or whoever next touches the ad),
  -- so both sides hear about it, whoever that was.
  if v_to_seeker and (v_expiry or new.tenant_id is distinct from v_actor) then
    perform public.add_notification(
      new.tenant_id, v_type, new.id, new.listing_id,
      v_data || case when v_expiry then '{"side": "seeker"}'::jsonb else '{}'::jsonb end
    );
  end if;

  if v_to_landlord then
    for v_uid in select s from public.listing_side_member_ids(new.listing_id) s loop
      if v_uid <> new.tenant_id and (v_expiry or v_uid is distinct from v_actor) then
        perform public.add_notification(
          v_uid, v_type, new.id, new.listing_id,
          v_data || case when v_expiry then '{"side": "landlord"}'::jsonb else '{}'::jsonb end
        );
      end if;
    end loop;
  end if;

  return null;
end;
$$;

revoke execute on function public.notify_request_change() from public, anon, authenticated;

-- notify_listing_change (F9): also "ad_expired". Otherwise the same as F9.
create or replace function public.notify_listing_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text;
begin
  if new.status is not distinct from old.status then
    return null;
  end if;

  if old.status = 'pending_review' and new.status = 'active' then
    v_type := 'ad_approved';
  elsif old.status in ('pending_review', 'active', 'hidden') and new.status = 'rejected' then
    v_type := 'ad_rejected';
  elsif old.status = 'active' and new.status = 'hidden' then
    -- An admin, or three reports.
    v_type := 'ad_hidden';
  elsif old.status = 'hidden' and new.status = 'active' then
    v_type := 'ad_restored';
  elsif old.status = 'active' and new.status = 'expired' then
    -- F10: the 30 days are over (the scheduled job).
    v_type := 'ad_expired';
  else
    return null;
  end if;

  if new.posted_by is not distinct from auth.uid() then
    return null;
  end if;
  -- A ban hides and rejects every ad of the member at once; the member sees
  -- the suspension notice instead.
  if exists (select 1 from public.profiles where id = new.posted_by and is_banned) then
    return null;
  end if;

  perform public.add_notification(
    new.posted_by, v_type, null, new.id,
    jsonb_build_object('title', new.title, 'listing_type', new.listing_type)
  );
  return null;
end;
$$;

revoke execute on function public.notify_listing_change() from public, anon, authenticated;

-- 10. Caretakers (FR36) --------------------------------------------------------------------
-- The building's owner invites a member by email. The invitation waits until
-- that member (signed up with that email, now or later) accepts or declines
-- it. The owner is never told whether an email belongs to a member, and no
-- email goes to an address that is not a member. A caretaker sees the
-- building's units, ads and requests, answers requests and posts ads for its
-- units (as since F2 for building managers).

create or replace function public.is_building_owner(p_building_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.building_managers
    where building_id = p_building_id and user_id = (select auth.uid()) and role = 'owner'
  );
$$;

revoke execute on function public.is_building_owner(uuid) from public, anon;
grant execute on function public.is_building_owner(uuid) to authenticated;

create table if not exists public.building_invites (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings (id) on delete cascade,
  email text not null,
  invited_by uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending',
  -- The member who answered.
  invitee_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

alter table public.building_invites drop constraint if exists building_invites_check;
alter table public.building_invites add constraint building_invites_check check (
  status in ('pending', 'accepted', 'declined', 'cancelled')
  and email = lower(email)
  and char_length(email) between 3 and 254
  and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
);

comment on table public.building_invites is
  'F10: an owner''s invitation to a caretaker, by email. Changed only through invite_caretaker, cancel_building_invite and respond_building_invite.';

create unique index if not exists building_invites_one_pending
  on public.building_invites (building_id, email) where status = 'pending';
create index if not exists building_invites_email_idx
  on public.building_invites (email) where status = 'pending';
create index if not exists building_invites_inviter_time_idx
  on public.building_invites (invited_by, created_at desc);

alter table public.building_invites enable row level security;

-- Only the building's owners see the invitations (with the emails typed).
drop policy if exists "building managers read their building's invites" on public.building_invites;
drop policy if exists "building owners read their building's invites" on public.building_invites;
create policy "building owners read their building's invites"
  on public.building_invites for select to authenticated
  using (public.is_building_owner(building_id));

revoke all on public.building_invites from anon;
revoke insert, update, delete on public.building_invites from authenticated;
grant select on public.building_invites to authenticated;


-- The caller's confirmed email address. Internal.
create or replace function public.my_confirmed_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(u.email) from auth.users u
  where u.id = (select auth.uid()) and u.email is not null and u.email_confirmed_at is not null;
$$;

revoke execute on function public.my_confirmed_email() from public, anon, authenticated;

-- Invite a caretaker. Returns the invitation's id (the same one for an email
-- that already has a waiting invitation). At most 10 waiting invitations
-- per building and 20 new ones per owner in 24 hours.
create or replace function public.invite_caretaker(p_building_id uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(trim(coalesce(p_email, '')));
  v_id uuid;
  v_invitee uuid;
  v_inviter text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  perform public.require_not_banned();
  if not public.is_building_owner(p_building_id) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if char_length(v_email) not between 3 and 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'email_invalid' using errcode = '22023';
  end if;
  if v_email = public.my_confirmed_email() then
    raise exception 'invite_self' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.building_managers m
    join auth.users u on u.id = m.user_id
    where m.building_id = p_building_id and lower(u.email) = v_email
  ) then
    raise exception 'already_manager' using errcode = 'P0001';
  end if;

  -- One building at a time, so two invitations at once cannot pass the limits.
  perform 1 from public.buildings where id = p_building_id for update;

  select id into v_id from public.building_invites
  where building_id = p_building_id and email = v_email and status = 'pending';
  if found then
    return v_id;
  end if;
  if (select count(*) from public.building_invites where building_id = p_building_id and status = 'pending') >= 10
    or (select count(*) from public.building_invites where invited_by = v_uid and created_at > now() - interval '24 hours') >= 20
  then
    raise exception 'invite_limit' using errcode = 'P0001';
  end if;

  insert into public.building_invites (building_id, email, invited_by)
  values (p_building_id, v_email, v_uid)
  returning id into v_id;

  -- A member with this confirmed email is told now; someone who signs up
  -- with it later sees the invitation on My properties.
  select u.id into v_invitee from auth.users u
  where lower(u.email) = v_email and u.email_confirmed_at is not null
  limit 1;
  if v_invitee is not null then
    select full_name into v_inviter from public.profiles where id = v_uid;
    -- No building details: the email may have been typed wrong.
    perform public.add_notification(
      v_invitee, 'caretaker_invited', null, null,
      jsonb_build_object('member_name', v_inviter)
    );
  end if;
  return v_id;
end;
$$;

revoke execute on function public.invite_caretaker(uuid, text) from public, anon;
grant execute on function public.invite_caretaker(uuid, text) to authenticated;

create or replace function public.cancel_building_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_i public.building_invites%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select * into v_i from public.building_invites where id = p_invite_id for update;
  if not found or not public.is_building_owner(v_i.building_id) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_i.status <> 'pending' then
    raise exception 'wrong_status' using errcode = 'P0001';
  end if;
  update public.building_invites set status = 'cancelled', responded_at = now() where id = p_invite_id;
end;
$$;

revoke execute on function public.cancel_building_invite(uuid) from public, anon;
grant execute on function public.cancel_building_invite(uuid) to authenticated;

-- The invitee accepts or declines. Returns the building's id.
create or replace function public.respond_building_invite(p_invite_id uuid, p_accept boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_i public.building_invites%rowtype;
  v_name text;
  v_building text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select * into v_i from public.building_invites where id = p_invite_id for update;
  if not found or v_i.email is distinct from public.my_confirmed_email() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_i.status <> 'pending' then
    raise exception 'wrong_status' using errcode = 'P0001';
  end if;

  select full_name into v_name from public.profiles where id = v_uid;
  select name into v_building from public.buildings where id = v_i.building_id;

  if coalesce(p_accept, false) then
    perform public.require_not_banned();
    -- The owner who invited may have left the building meanwhile.
    if not exists (
      select 1 from public.building_managers
      where building_id = v_i.building_id and user_id = v_i.invited_by and role = 'owner'
    ) then
      raise exception 'invite_invalid' using errcode = 'P0001';
    end if;
    insert into public.building_managers (building_id, user_id, role, added_by)
    values (v_i.building_id, v_uid, 'caretaker', v_i.invited_by)
    on conflict (building_id, user_id) do nothing;
    update public.building_invites set status = 'accepted', invitee_id = v_uid, responded_at = now()
    where id = p_invite_id;
  else
    update public.building_invites set status = 'declined', invitee_id = v_uid, responded_at = now()
    where id = p_invite_id;
  end if;

  perform public.add_notification(
    v_i.invited_by,
    case when coalesce(p_accept, false) then 'caretaker_joined' else 'caretaker_declined' end,
    null, null,
    jsonb_build_object('member_name', v_name, 'title', v_building, 'building_id', v_i.building_id)
  );
  return v_i.building_id;
end;
$$;

revoke execute on function public.respond_building_invite(uuid, boolean) from public, anon;
grant execute on function public.respond_building_invite(uuid, boolean) to authenticated;

-- The owner removes a caretaker, or a caretaker leaves. The building's
-- creator and its owners stay. The caretaker's ads in the building (and the
-- tenancies made through them) pass to the owner, with the owner's number on
-- them when the owner has one, so the caretaker no longer sees the seekers'
-- or tenants' details.
create or replace function public.remove_building_manager(p_building_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_m public.building_managers%rowtype;
  v_b public.buildings%rowtype;
  v_self boolean := p_user_id = auth.uid();
  v_owner uuid;
  v_owner_phone text;
  v_name text;
  v_ids uuid[];
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select * into v_m from public.building_managers
  where building_id = p_building_id and user_id = p_user_id for update;
  if not found or (not v_self and not public.is_building_owner(p_building_id)) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select * into v_b from public.buildings where id = p_building_id;
  if v_m.role <> 'caretaker' or v_b.created_by = p_user_id then
    raise exception 'cannot_remove_manager' using errcode = 'P0001';
  end if;

  v_owner := case
    when not v_self then v_uid
    else (
      select user_id from public.building_managers
      where building_id = p_building_id and role = 'owner'
      order by created_at limit 1
    )
  end;

  if v_owner is not null then
    select array_agg(l.id) into v_ids
    from public.listings l
    join public.units u on u.id = l.unit_id
    where u.building_id = p_building_id and l.posted_by = p_user_id;

    if v_ids is not null then
      update public.listings set posted_by = v_owner, posted_as = 'owner', owner_name = null
      where id = any (v_ids);
      select phone into v_owner_phone from public.profile_private where user_id = v_owner;
      if v_owner_phone is not null then
        update public.listing_private set contact_phone = v_owner_phone, whatsapp = null
        where listing_id = any (v_ids);
      end if;
      update public.tenancies set landlord_id = v_owner
      where listing_id = any (v_ids) and landlord_id = p_user_id;
    end if;
  end if;

  delete from public.building_managers where building_id = p_building_id and user_id = p_user_id;

  if v_self then
    select full_name into v_name from public.profiles where id = p_user_id;
    for v_owner in
      select user_id from public.building_managers where building_id = p_building_id and role = 'owner'
    loop
      perform public.add_notification(
        v_owner, 'caretaker_left', null, null,
        jsonb_build_object('member_name', v_name, 'title', v_b.name, 'building_id', p_building_id)
      );
    end loop;
  else
    select full_name into v_name from public.profiles where id = v_uid;
    perform public.add_notification(
      p_user_id, 'caretaker_removed', null, null,
      jsonb_build_object('member_name', v_name, 'title', v_b.name)
    );
  end if;
end;
$$;

revoke execute on function public.remove_building_manager(uuid, uuid) from public, anon;
grant execute on function public.remove_building_manager(uuid, uuid) to authenticated;

-- Who manages a building, for its managers: the owner and caretakers, and
-- (for owners only) the waiting invitations with their emails.
create or replace function public.building_team(p_building_id uuid)
returns table (
  kind text,
  user_id uuid,
  invite_id uuid,
  full_name text,
  avatar_url text,
  role public.manager_role,
  email text,
  is_creator boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_building(p_building_id) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return query
    select 'member'::text, m.user_id, null::uuid, p.full_name, p.avatar_url, m.role, null::text,
           b.created_by = m.user_id, m.created_at
    from public.building_managers m
    join public.profiles p on p.id = m.user_id
    join public.buildings b on b.id = m.building_id
    where m.building_id = p_building_id
    union all
    select 'invite'::text, null::uuid, i.id, null::text, null::text, 'caretaker'::public.manager_role, i.email,
           false, i.created_at
    from public.building_invites i
    where i.building_id = p_building_id and i.status = 'pending'
      and public.is_building_owner(p_building_id)
    order by 1 desc, 6, 9;
end;
$$;

revoke execute on function public.building_team(uuid) from public, anon;
grant execute on function public.building_team(uuid) to authenticated;

-- Invitations waiting for the caller (matched by their confirmed email).
create or replace function public.my_building_invites()
returns table (
  id uuid,
  building_id uuid,
  building_name text,
  area_id integer,
  inviter_name text,
  inviter_avatar text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.building_id, b.name, b.area_id, p.full_name, p.avatar_url, i.created_at
  from public.building_invites i
  join public.buildings b on b.id = i.building_id
  join public.profiles p on p.id = i.invited_by
  where i.status = 'pending' and i.email = public.my_confirmed_email()
  order by i.created_at desc;
$$;

revoke execute on function public.my_building_invites() from public, anon;
grant execute on function public.my_building_invites() to authenticated;

-- 11. Saved ads (FR30) ---------------------------------------------------------------------

create table if not exists public.saved_listings (
  user_id uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

comment on table public.saved_listings is
  'F10: ads a member saved. Read by the member; changed only through set_listing_saved.';

create index if not exists saved_listings_user_time_idx on public.saved_listings (user_id, created_at desc);
create index if not exists saved_listings_listing_idx on public.saved_listings (listing_id);

alter table public.saved_listings enable row level security;

drop policy if exists "members read their saved ads" on public.saved_listings;
create policy "members read their saved ads"
  on public.saved_listings for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.saved_listings from anon;
revoke insert, update, delete on public.saved_listings from authenticated;
grant select on public.saved_listings to authenticated;

-- Save (a live ad, at most 200) or unsave. Returns whether it is saved now.
create or replace function public.set_listing_saved(p_listing_id uuid, p_saved boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if coalesce(p_saved, false) then
    if exists (select 1 from public.saved_listings where user_id = v_uid and listing_id = p_listing_id) then
      return true;
    end if;
    if not exists (select 1 from public.listings where id = p_listing_id and status = 'active') then
      raise exception 'listing_not_active' using errcode = 'P0001';
    end if;
    perform 1 from public.profiles where id = v_uid for update;
    if (select count(*) from public.saved_listings where user_id = v_uid) >= 200 then
      raise exception 'saved_limit' using errcode = 'P0001';
    end if;
    insert into public.saved_listings (user_id, listing_id) values (v_uid, p_listing_id)
    on conflict do nothing;
    return true;
  end if;
  delete from public.saved_listings where user_id = v_uid and listing_id = p_listing_id;
  return false;
end;
$$;

revoke execute on function public.set_listing_saved(uuid, boolean) from public, anon;
grant execute on function public.set_listing_saved(uuid, boolean) to authenticated;

-- The caller's saved ads, newest saved first. A live or paused ad comes with
-- what a visitor may see (the same columns as search_listings); a rented ad
-- with its title, type and area only; any other ad (expired, hidden,
-- rejected, back in review) with nothing but its state.
create or replace function public.my_saved_listings()
returns table (
  listing_id uuid,
  saved_at timestamptz,
  state text,
  title text,
  listing_type public.listing_type,
  tenant_types text[],
  monthly_rent integer,
  rent_negotiable boolean,
  open_slots smallint,
  available_from date,
  published_at timestamptz,
  area_id integer,
  landmark text,
  approx_lat numeric,
  approx_lng numeric,
  gas public.gas_type,
  amenities text[],
  unit_kind public.unit_kind,
  bedrooms smallint,
  bathrooms smallint,
  size_sqft integer,
  furnishing public.furnishing,
  cover_path text,
  photo_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select s.listing_id, s.created_at as saved_at, l.status, l.paused_at,
      case
        when l.status = 'active' and l.paused_at is null then 'active'
        when l.status = 'active' then 'paused'
        when l.status = 'rented' then 'rented'
        else 'closed'
      end as state
    from public.saved_listings s
    join public.listings l on l.id = s.listing_id
    where s.user_id = (select auth.uid())
    order by s.created_at desc
    limit 200
  )
  select
    m.listing_id, m.saved_at, m.state,
    case when m.state <> 'closed' then l.title end,
    case when m.state <> 'closed' then l.listing_type end,
    case when m.state in ('active', 'paused') then l.tenant_types end,
    case when m.state in ('active', 'paused') then l.monthly_rent end,
    case when m.state in ('active', 'paused') then l.rent_negotiable end,
    case when m.state in ('active', 'paused') then l.open_slots end,
    case when m.state in ('active', 'paused') then l.available_from end,
    case when m.state in ('active', 'paused') then l.published_at end,
    case when m.state <> 'closed' then b.area_id end,
    case when m.state in ('active', 'paused') then b.landmark end,
    case when m.state in ('active', 'paused') then b.approx_lat end,
    case when m.state in ('active', 'paused') then b.approx_lng end,
    case when m.state in ('active', 'paused') then b.gas end,
    case when m.state in ('active', 'paused') then b.amenities end,
    case when m.state in ('active', 'paused') then u.unit_kind end,
    case when m.state in ('active', 'paused') then u.bedrooms end,
    case when m.state in ('active', 'paused') then u.bathrooms end,
    case when m.state in ('active', 'paused') then u.size_sqft end,
    case when m.state in ('active', 'paused') then u.furnishing end,
    case when m.state in ('active', 'paused') then cover.storage_path end,
    case when m.state in ('active', 'paused') then coalesce(photos.n, 0) else 0 end
  from mine m
  join public.listings l on l.id = m.listing_id
  join public.units u on u.id = l.unit_id
  join public.buildings b on b.id = u.building_id
  left join lateral (
    select ph.storage_path from public.listing_photos ph
    where ph.listing_id = m.listing_id order by ph.sort_order limit 1
  ) cover on true
  left join lateral (
    select count(*)::integer as n from public.listing_photos ph where ph.listing_id = m.listing_id
  ) photos on true
  order by m.saved_at desc;
$$;

revoke execute on function public.my_saved_listings() from public, anon;
grant execute on function public.my_saved_listings() to authenticated;

-- 12. The scheduled job --------------------------------------------------------------------
-- Supabase Cron runs private.run_scheduled_jobs() every 10 minutes (set up
-- once in the SQL Editor, SETUP.md 8.9). Admins can also run it from the
-- admin overview (useful for tests and demos). Each part is safe to run at
-- any time and as often as needed.

-- Asks the app to send waiting notification emails (the database cannot
-- send email itself). Uses pg_net, with the site's address and the cron
-- secret kept in Supabase Vault (SETUP.md 8.9). Does nothing, without an
-- error, when those are missing (a local database, or before setup).
create or replace function private.request_email_delivery()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (
    select 1 from public.notification_emails
    where status = 'pending' or (status = 'failed' and attempts < 3)
  ) then
    return false;
  end if;
  if to_regnamespace('net') is null or to_regnamespace('vault') is null then
    return false;
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1'
    into v_url using 'house_manager_site_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1'
    into v_secret using 'house_manager_cron_secret';
  if v_url is null or v_secret is null then
    return false;
  end if;
  -- pg_net sends it after this transaction commits, so the app sees the
  -- new emails.
  execute 'select net.http_post(url := $1, body := ''{}''::jsonb, headers := $2, timeout_milliseconds := 10000)'
    using rtrim(v_url, '/') || '/api/cron/emails',
          jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret);
  return true;
exception when others then
  raise warning 'request_email_delivery failed: %', sqlerrm;
  return false;
end;
$$;

revoke execute on function private.request_email_delivery() from public, anon, authenticated;

-- Returns what each part did, for the Cron history and the admin button.
create or replace function private.run_scheduled_jobs(p_request_emails boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offers integer;
  v_requests integer;
  v_ads integer;
  v_reminded integer;
  v_notifications integer;
  v_emails integer;
  v_asked boolean := false;
begin
  v_offers := public.expire_offers(null);
  v_requests := public.expire_stale_requests();
  v_ads := public.expire_listings();
  v_reminded := public.remind_expiring_listings();

  -- Read notifications older than 90 days (their email rows go with them),
  -- and finished email rows older than 30 days (the notification stays).
  delete from public.notifications where read_at < now() - interval '90 days';
  get diagnostics v_notifications = row_count;
  delete from public.notification_emails
  where status in ('sent', 'skipped', 'failed') and created_at < now() - interval '30 days';
  get diagnostics v_emails = row_count;

  if p_request_emails then
    v_asked := private.request_email_delivery();
  end if;

  return jsonb_build_object(
    'offers_expired', v_offers,
    'requests_expired', v_requests,
    'ads_expired', v_ads,
    'ads_reminded', v_reminded,
    'notifications_deleted', v_notifications,
    'emails_deleted', v_emails,
    'email_delivery_requested', v_asked
  );
end;
$$;

revoke execute on function private.run_scheduled_jobs(boolean) from public, anon, authenticated;

-- The admin overview's "Run the scheduled jobs now". The admin's own server
-- sends the emails afterwards, with links to the site the admin is on.
create or replace function public.admin_run_scheduled_jobs()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return private.run_scheduled_jobs(false);
end;
$$;

revoke execute on function public.admin_run_scheduled_jobs() from public, anon;
grant execute on function public.admin_run_scheduled_jobs() to authenticated;
