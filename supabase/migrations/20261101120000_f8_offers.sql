-- F8: offer and confirm (plan sections 1.4 and 1.5, FR26 to FR28).
-- 1. The landlord side (the ad's poster or a manager of its building) makes
--    an offer on a shortlisted request: monthly rent, advance and move-in
--    date. The offer is valid for 48 hours. Open offers on one ad never ask
--    for more places than the ad has left (open_slots: 1 for a flat, room or
--    sublet, the seats on offer for a mess).
-- 2. The seeker accepts with their NID number, a current photo, their
--    permanent address and a consent tick. The app encrypts the NID number
--    on the server with a key the database never sees (NID_ENCRYPTION_KEY on
--    Vercel); only the last 4 digits are stored in plain text. The photo
--    goes to the private tenant-docs bucket. No NID card image is stored.
-- 3. In the same transaction: the tenancy is created, open_slots goes down,
--    and when nothing is left the ad becomes rented, the unit occupied, and
--    every other open request on the ad is declined with the "filled" reason.
-- 4. An offer that passes 48 hours without an answer counts as expired at
--    once (every read uses effective_request_status), and is written as
--    expired the next time anything touches that ad. F10's scheduled job can
--    call expire_offers() for all ads.
--
-- Staged disclosure (plan section 1.5): the NID details and photo are read
-- only by the tenant and the ad's landlord side (poster and building
-- managers), never by admins or anybody else. After confirming, the tenant
-- sees the exact address and the ad's contact number on the request's page.
--
-- Every new table has RLS in this migration (working rule). The whole file
-- is safe to run twice ("if not exists", "or replace", "drop ... if exists").

-- 1. New request columns -----------------------------------------------------------

alter table public.rental_requests
  add column if not exists offered_at timestamptz,
  add column if not exists offered_by uuid references public.profiles (id) on delete set null,
  add column if not exists offer_rent integer,
  add column if not exists offer_advance integer,
  add column if not exists offer_start_date date,
  add column if not exists offer_note text,
  add column if not exists confirmed_at timestamptz;

alter table public.rental_requests drop constraint if exists rental_requests_offer_terms_check;
alter table public.rental_requests add constraint rental_requests_offer_terms_check check (
  (offer_rent is null or offer_rent between 500 and 10000000)
  and (offer_advance is null or offer_advance between 0 and 120000000)
  and (offer_note is null or char_length(offer_note) <= 500)
  -- An offered or confirmed request always carries its offer.
  and (
    status not in ('offered', 'confirmed')
    or (offered_at is not null and offer_expires_at is not null and offer_rent is not null
        and offer_advance is not null and offer_start_date is not null)
  )
);

comment on column public.rental_requests.offered_at is 'F8: when the landlord side made the offer (valid until offer_expires_at, 48 hours).';
comment on column public.rental_requests.confirmed_at is 'F8: when the seeker accepted the offer and the tenancy was created.';

-- Live offers per ad, for the offer limit and for expiring them.
create index if not exists rental_requests_offers_idx
  on public.rental_requests (listing_id, offer_expires_at)
  where status = 'offered';

-- 2. open_slots can reach 0 once the ad is rented --------------------------------------
-- Only accept_offer takes the last place, and it marks the ad rented at the
-- same time. Every other ad (drafts included, which the poster edits
-- directly) keeps at least 1.

alter table public.listings drop constraint if exists listings_open_slots_check;
alter table public.listings add constraint listings_open_slots_check check (open_slots between 0 and 30);
alter table public.listings drop constraint if exists listings_open_slots_live_check;
alter table public.listings drop constraint if exists listings_open_slots_rented_check;
alter table public.listings add constraint listings_open_slots_rented_check
  check (open_slots > 0 or status = 'rented');

-- 3. Helpers ---------------------------------------------------------------------------

-- The status as it is right now: an offer past its 48 hours is expired, even
-- before expire_offers writes it.
create or replace function public.effective_request_status(
  p_status public.request_status,
  p_offer_expires_at timestamptz
)
returns public.request_status
language sql
stable
set search_path = ''
as $$
  select case
    when p_status = 'offered' and p_offer_expires_at <= now() then 'expired'::public.request_status
    else p_status
  end;
$$;

grant execute on function public.effective_request_status(public.request_status, timestamptz) to authenticated;

-- How many places a request takes: its people for a mess (one seat each),
-- otherwise the whole place (open_slots is always 1 for other ads).
create or replace function public.request_seats(p_listing_type public.listing_type, p_members_count smallint)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when p_listing_type = 'mess_seat' then p_members_count::integer else 1 end;
$$;

grant execute on function public.request_seats(public.listing_type, smallint) to authenticated;

-- Writes "expired" on offers past their 48 hours, on one ad or (null) on
-- every ad. Returns how many changed. Internal: called by make_offer and
-- accept_offer, and later by F10's scheduled job.
create or replace function public.expire_offers(p_listing_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.rental_requests
  set status = 'expired', closed_at = offer_expires_at
  where status = 'offered'
    and offer_expires_at <= now()
    and (p_listing_id is null or listing_id = p_listing_id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.expire_offers(uuid) from public, anon, authenticated;

-- 4. tenancies (shared with House Manage, plan section 1.9) --------------------------------

do $$
begin
  create type public.tenancy_status as enum ('active', 'ended', 'cancelled');
exception when duplicate_object then null;
end;
$$;

create table if not exists public.tenancies (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units (id) on delete restrict,
  listing_id uuid not null references public.listings (id) on delete restrict,
  request_id uuid not null unique references public.rental_requests (id) on delete restrict,
  -- The ad's poster: a subletting tenant is the landlord of their sub-tenant.
  landlord_id uuid not null references public.profiles (id) on delete restrict,
  tenant_id uuid not null references public.profiles (id) on delete restrict,
  -- People who live there (seats taken, for a mess).
  members_count smallint not null check (members_count between 1 and 20),
  start_date date not null,
  monthly_rent integer not null check (monthly_rent between 500 and 10000000),
  advance_amount integer not null default 0 check (advance_amount between 0 and 120000000),
  status public.tenancy_status not null default 'active',
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.tenancies is
  'A confirmed tenant in a unit (F8, plan section 1.9). Created only by accept_offer. House Manage starts here.';

create index if not exists tenancies_unit_status_idx on public.tenancies (unit_id, status);
create index if not exists tenancies_listing_idx on public.tenancies (listing_id);
create index if not exists tenancies_tenant_idx on public.tenancies (tenant_id, created_at desc);
create index if not exists tenancies_landlord_idx on public.tenancies (landlord_id, created_at desc);

drop trigger if exists tenancies_set_updated_at on public.tenancies;
create trigger tenancies_set_updated_at
  before update on public.tenancies
  for each row execute function public.set_updated_at();

alter table public.tenancies enable row level security;

-- The tenant, the ad's landlord side, and admins (as for requests).
drop policy if exists "tenants, landlords and admins read tenancies" on public.tenancies;
create policy "tenants, landlords and admins read tenancies"
  on public.tenancies for select to authenticated
  using (
    tenant_id = (select auth.uid())
    or listing_id in (select public.managed_listing_ids())
    or (select public.is_admin())
  );

revoke all on public.tenancies from anon;
revoke insert, update, delete on public.tenancies from authenticated;
grant select on public.tenancies to authenticated;

-- 5. tenant_verifications: what the seeker shares on accepting (plan section 1.5) -----------

create table if not exists public.tenant_verifications (
  request_id uuid primary key references public.rental_requests (id) on delete cascade,
  tenant_id uuid not null references public.profiles (id) on delete cascade,
  -- AES-256-GCM, written by the app server: v1:<iv>:<ciphertext>:<tag> in base64.
  nid_encrypted text not null
    check (char_length(nid_encrypted) <= 200
      and nid_encrypted ~ '^v1:[A-Za-z0-9+/]+={0,2}:[A-Za-z0-9+/]+={0,2}:[A-Za-z0-9+/]+={0,2}$'),
  nid_last4 text not null check (nid_last4 ~ '^[0-9]{4}$'),
  -- <tenant id>/<request id>/<file> in the private tenant-docs bucket.
  photo_path text not null check (char_length(photo_path) <= 300),
  permanent_address text not null check (char_length(permanent_address) between 10 and 300),
  consent_at timestamptz not null,
  created_at timestamptz not null default now()
);

comment on table public.tenant_verifications is
  'NID, photo and permanent address shared by a seeker who accepted an offer (F8). Read only by that tenant and the ad''s landlord side; never by admins. Written only by accept_offer.';

create index if not exists tenant_verifications_tenant_idx on public.tenant_verifications (tenant_id);

-- Confirmed requests on ads the caller manages (the landlord side).
create or replace function public.managed_confirmed_request_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.id
  from public.rental_requests r
  where r.status = 'confirmed'
    and r.listing_id in (select public.managed_listing_ids());
$$;

revoke execute on function public.managed_confirmed_request_ids() from public, anon;
grant execute on function public.managed_confirmed_request_ids() to authenticated;

alter table public.tenant_verifications enable row level security;

drop policy if exists "the tenant and the landlord side read verifications" on public.tenant_verifications;
create policy "the tenant and the landlord side read verifications"
  on public.tenant_verifications for select to authenticated
  using (
    tenant_id = (select auth.uid())
    or request_id in (select public.managed_confirmed_request_ids())
  );

revoke all on public.tenant_verifications from anon;
revoke insert, update, delete on public.tenant_verifications from authenticated;
grant select on public.tenant_verifications to authenticated;

-- 6. Private bucket for the tenant's photo ---------------------------------------------
-- Files at <tenant id>/<request id>/<name>. The seeker uploads only while
-- their offer is open; the tenant and the landlord side read a photo once it
-- belongs to a verification. Signed links only (the bucket is not public).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tenant-docs', 'tenant-docs', false, 2097152, array['image/webp', 'image/jpeg'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "seekers upload a photo for an open offer" on storage.objects;
create policy "seekers upload a photo for an open offer"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'tenant-docs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.rental_requests r
      where r.id::text = (storage.foldername(name))[2]
        and r.tenant_id = (select auth.uid())
        and r.status = 'offered'
        and r.offer_expires_at > now()
    )
  );

drop policy if exists "tenants and landlords read tenant photos" on storage.objects;
create policy "tenants and landlords read tenant photos"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'tenant-docs'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      -- RLS on tenant_verifications limits this to the caller's tenants.
      or name in (select v.photo_path from public.tenant_verifications v)
    )
  );

-- An upload that never became part of a verification (accepting failed).
drop policy if exists "seekers delete unused tenant photos" on storage.objects;
create policy "seekers delete unused tenant photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'tenant-docs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (select 1 from public.tenant_verifications v where v.photo_path = name)
  );

-- 7. make_offer: the landlord side offers the place (FR26) -----------------------------
-- shortlisted -> offered, for 48 hours. Only while the ad is live, never to a
-- suspended seeker, never by a suspended landlord. Returns when it expires.

create or replace function public.make_offer(
  p_request_id uuid,
  p_monthly_rent integer,
  p_advance integer,
  p_start_date date,
  p_note text default null
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_listing_id uuid;
  v_l public.listings%rowtype;
  v_r public.rental_requests%rowtype;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_today date := (now() at time zone 'Asia/Dhaka')::date;
  v_seats integer;
  v_offered integer;
  v_expires timestamptz := now() + interval '48 hours';
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles where id = v_uid and is_banned) then
    raise exception 'banned' using errcode = '42501';
  end if;

  select listing_id into v_listing_id from public.rental_requests where id = p_request_id;
  if not found or not public.can_manage_listing(v_listing_id) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  -- The ad first, then the request (the same order as accept_offer), so two
  -- offers on one ad at the same moment cannot both pass the limit.
  select * into v_l from public.listings where id = v_listing_id for update;
  perform public.expire_offers(v_listing_id);
  select * into v_r from public.rental_requests where id = p_request_id for update;

  if v_r.status <> 'shortlisted' then
    raise exception 'wrong_status' using errcode = 'P0001';
  end if;
  if v_l.status <> 'active' then
    raise exception 'listing_not_active' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.profiles where id = v_r.tenant_id and is_banned) then
    raise exception 'seeker_banned' using errcode = 'P0001';
  end if;

  if p_monthly_rent is null or p_monthly_rent not between 500 and 10000000 then
    raise exception 'offer_rent_invalid' using errcode = '22023';
  end if;
  if p_advance is null or p_advance < 0 or p_advance > least(p_monthly_rent::bigint * 12, 120000000) then
    raise exception 'offer_advance_invalid' using errcode = '22023';
  end if;
  if p_start_date is null or p_start_date < v_today or p_start_date > v_today + 365 then
    raise exception 'move_in_invalid' using errcode = '22023';
  end if;
  if char_length(coalesce(v_note, '')) > 500 then
    raise exception 'invalid_request' using errcode = '22023';
  end if;

  -- Open offers never ask for more places than the ad has left.
  v_seats := public.request_seats(v_l.listing_type, v_r.members_count);
  select coalesce(sum(public.request_seats(v_l.listing_type, r.members_count)), 0) into v_offered
  from public.rental_requests r
  where r.listing_id = v_l.id and r.status = 'offered' and r.offer_expires_at > now();
  if v_seats > v_l.open_slots then
    raise exception 'not_enough_seats' using errcode = 'P0001';
  end if;
  if v_offered + v_seats > v_l.open_slots then
    raise exception 'offer_limit' using errcode = 'P0001';
  end if;

  update public.rental_requests set
    status = 'offered',
    offered_at = now(),
    offered_by = v_uid,
    offer_expires_at = v_expires,
    offer_rent = p_monthly_rent,
    offer_advance = p_advance,
    offer_start_date = p_start_date,
    offer_note = v_note
  where id = p_request_id;

  return v_expires;
end;
$$;

revoke execute on function public.make_offer(uuid, integer, integer, date, text) from public, anon;
grant execute on function public.make_offer(uuid, integer, integer, date, text) to authenticated;

-- 8. accept_offer: the seeker accepts, and the tenancy is created (FR27, FR28) -----------------
-- offered (within 48 hours) -> confirmed, all in one transaction (plan
-- section 1.4). p_nid_encrypted comes from the app server, which encrypted
-- the number with its own key; the database never sees the number itself.
-- Returns the new tenancy's id.

create or replace function public.accept_offer(
  p_request_id uuid,
  p_nid_encrypted text,
  p_nid_last4 text,
  p_photo_path text,
  p_permanent_address text,
  p_consent boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_listing_id uuid;
  v_l public.listings%rowtype;
  v_r public.rental_requests%rowtype;
  v_address text := regexp_replace(coalesce(p_permanent_address, ''), '^\s+|\s+$', '', 'g');
  v_seats integer;
  v_left integer;
  v_tenancy_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles where id = v_uid and is_banned) then
    raise exception 'banned' using errcode = '42501';
  end if;

  select listing_id into v_listing_id from public.rental_requests where id = p_request_id and tenant_id = v_uid;
  if not found then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  -- The ad first, then the requests (the same order as make_offer).
  select * into v_l from public.listings where id = v_listing_id for update;
  perform public.expire_offers(v_listing_id);
  select * into v_r from public.rental_requests where id = p_request_id for update;

  if v_r.status = 'expired' and v_r.offered_at is not null then
    raise exception 'offer_expired' using errcode = 'P0001';
  end if;
  if v_r.status <> 'offered' then
    raise exception 'wrong_status' using errcode = 'P0001';
  end if;
  -- A hidden ad may be a scam, so no NID goes to it.
  if v_l.status <> 'active' then
    raise exception 'listing_not_active' using errcode = 'P0001';
  end if;

  if not coalesce(p_consent, false) then
    raise exception 'consent_required' using errcode = '22023';
  end if;
  if p_nid_encrypted is null or char_length(p_nid_encrypted) > 200
    or p_nid_encrypted !~ '^v1:[A-Za-z0-9+/]+={0,2}:[A-Za-z0-9+/]+={0,2}:[A-Za-z0-9+/]+={0,2}$'
    or p_nid_last4 is null or p_nid_last4 !~ '^[0-9]{4}$'
  then
    raise exception 'nid_invalid' using errcode = '22023';
  end if;
  if char_length(v_address) not between 10 and 300 then
    raise exception 'address_invalid' using errcode = '22023';
  end if;
  -- The photo must be the seeker's own upload for this request.
  if p_photo_path is null
    or p_photo_path not like v_uid::text || '/' || p_request_id::text || '/%'
    or p_photo_path like '%..%'
    or not exists (
      select 1 from storage.objects o where o.bucket_id = 'tenant-docs' and o.name = p_photo_path
    )
  then
    raise exception 'photo_missing' using errcode = 'P0001';
  end if;

  v_seats := public.request_seats(v_l.listing_type, v_r.members_count);
  if v_seats > v_l.open_slots then
    raise exception 'not_enough_seats' using errcode = 'P0001';
  end if;

  insert into public.tenant_verifications (
    request_id, tenant_id, nid_encrypted, nid_last4, photo_path, permanent_address, consent_at
  ) values (
    p_request_id, v_uid, p_nid_encrypted, p_nid_last4, p_photo_path, v_address, now()
  );

  insert into public.tenancies (
    unit_id, listing_id, request_id, landlord_id, tenant_id, members_count,
    start_date, monthly_rent, advance_amount
  ) values (
    v_l.unit_id, v_l.id, p_request_id, v_l.posted_by, v_uid, v_r.members_count,
    v_r.offer_start_date, v_r.offer_rent, v_r.offer_advance
  )
  returning id into v_tenancy_id;

  update public.rental_requests set status = 'confirmed', confirmed_at = now() where id = p_request_id;

  v_left := v_l.open_slots - v_seats;
  if v_left > 0 then
    -- A mess with seats left stays live.
    update public.listings set open_slots = v_left where id = v_l.id;
  else
    update public.listings set open_slots = 0, status = 'rented' where id = v_l.id;
    update public.units set status = 'occupied' where id = v_l.unit_id;
    -- Everybody else who is still waiting hears that the place is taken.
    update public.rental_requests
    set status = 'declined', decline_reason = 'filled', decline_note = null, closed_at = now()
    where listing_id = v_l.id
      and id <> p_request_id
      and status in ('pending', 'shortlisted', 'offered');
  end if;

  return v_tenancy_id;
end;
$$;

revoke execute on function public.accept_offer(uuid, text, text, text, text, boolean) from public, anon;
grant execute on function public.accept_offer(uuid, text, text, text, text, boolean) to authenticated;

-- 9. F6 functions that change with offers -----------------------------------------------------

-- send_request: an offer of this seeker on this ad that passed 48 hours is
-- written as expired first, so it no longer counts as open, and a member who
-- already rents through this ad (a mess with seats left) cannot ask again.
-- Otherwise the same as F6.
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

  -- F8: this seeker's own offer on this ad that ran out is closed now.
  update public.rental_requests
  set status = 'expired', closed_at = offer_expires_at
  where listing_id = p_listing_id and tenant_id = v_uid
    and status = 'offered' and offer_expires_at <= now();

  if exists (
    select 1 from public.rental_requests
    where listing_id = p_listing_id and tenant_id = v_uid
      and status in ('pending', 'shortlisted', 'offered')
  ) then
    raise exception 'already_requested' using errcode = 'P0001';
  end if;
  -- F8: already a tenant through this ad (a mess with seats left stays live).
  if exists (
    select 1 from public.rental_requests
    where listing_id = p_listing_id and tenant_id = v_uid and status = 'confirmed'
  ) then
    raise exception 'already_tenant' using errcode = 'P0001';
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
  where tenant_id = v_uid
    and status in ('pending', 'shortlisted', 'offered')
    and (status <> 'offered' or offer_expires_at > now());
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

-- decline_request: the landlord side can now also decline an offered
-- request (taking the offer back). An offer that ran out is already closed.
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
  if public.effective_request_status(v_r.status, v_r.offer_expires_at)
    not in ('pending', 'shortlisted', 'offered')
  then
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

-- withdraw_request: the seeker can withdraw an open offer (turning it
-- down), but not one that already ran out.
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
  if public.effective_request_status(v_r.status, v_r.offer_expires_at)
    not in ('pending', 'shortlisted', 'offered')
  then
    raise exception 'wrong_status' using errcode = 'P0001';
  end if;

  update public.rental_requests
  set status = 'withdrawn', closed_at = now()
  where id = p_request_id;
end;
$$;

-- The seeker's phone: shortlisted, a live offer, or confirmed. An offer that
-- ran out hides it again, like a withdrawal.
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
    and (r.status <> 'offered' or r.offer_expires_at > now())
    and r.listing_id in (select public.managed_listing_ids());
$$;

-- 10. F7 messages: an offer that ran out closes the thread -----------------------------------

create or replace function public.message_send_block(p_request_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_r public.rental_requests%rowtype;
  v_side text;
  v_listing_status public.listing_status;
begin
  if v_uid is null then
    return 'not_authenticated';
  end if;
  select * into v_r from public.rental_requests where id = p_request_id;
  if not found then
    return 'not_allowed';
  end if;
  if v_r.tenant_id = v_uid then
    v_side := 'seeker';
  elsif public.can_manage_listing(v_r.listing_id) then
    v_side := 'landlord';
  else
    return 'not_allowed';
  end if;

  if exists (select 1 from public.profiles where id = v_uid and is_banned) then
    return 'banned';
  end if;
  if public.effective_request_status(v_r.status, v_r.offer_expires_at)
    not in ('pending', 'shortlisted', 'offered', 'confirmed')
  then
    return 'thread_closed';
  end if;
  select status into v_listing_status from public.listings where id = v_r.listing_id;
  if v_listing_status in ('hidden', 'rejected') then
    return 'thread_paused';
  end if;
  if v_side = 'landlord'
    and exists (select 1 from public.profiles where id = v_r.tenant_id and is_banned)
  then
    return 'member_banned';
  end if;
  if v_side = 'seeker' and public.seeker_messages_left(p_request_id) = 0 then
    return 'wait_for_reply';
  end if;
  return null;
end;
$$;

-- 11. Read functions with the offer ----------------------------------------------------------
-- Every one shows the effective status, and closed_at for an offer that ran
-- out is its expiry time.

-- thread_info: the request's page. Adds the offer, the places left on the
-- ad, and (once confirmed) the tenancy, the unit and its exact address, and
-- for the seeker the ad's contact number.
drop function if exists public.thread_info(uuid);
create function public.thread_info(p_request_id uuid)
returns table (
  id uuid,
  listing_id uuid,
  tenant_id uuid,
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
  offered_at timestamptz,
  offer_expires_at timestamptz,
  offer_rent integer,
  offer_advance integer,
  offer_start_date date,
  offer_note text,
  confirmed_at timestamptz,
  my_side text,
  listing_title text,
  listing_type public.listing_type,
  listing_status public.listing_status,
  monthly_rent integer,
  advance_months smallint,
  open_slots smallint,
  seats_needed integer,
  seats_offered integer,
  area_id integer,
  cover_path text,
  poster_id uuid,
  poster_name text,
  poster_avatar text,
  posted_as public.posted_as,
  seeker_name text,
  seeker_avatar text,
  seeker_since timestamptz,
  seeker_banned boolean,
  seeker_phone text,
  send_block text,
  messages_left integer,
  tenancy_id uuid,
  unit_label text,
  road_address text,
  house_no text,
  landlord_phone text
)
language sql
stable
security definer
set search_path = ''
as $$
  with req as (
    select
      r.*,
      public.effective_request_status(r.status, r.offer_expires_at) as status_now,
      case
        when r.tenant_id = (select auth.uid()) then 'seeker'
        when r.listing_id in (select public.managed_listing_ids()) then 'landlord'
      end as side
    from public.rental_requests r
    where r.id = p_request_id
  )
  select
    r.id, r.listing_id, r.tenant_id, r.status_now, r.household_type, r.members_count, r.occupation,
    r.move_in_date, r.message, r.decline_reason, r.decline_note, r.shortlisted_at,
    coalesce(r.closed_at, case when r.status_now = 'expired' then r.offer_expires_at end),
    r.created_at,
    r.offered_at, r.offer_expires_at, r.offer_rent, r.offer_advance, r.offer_start_date, r.offer_note,
    r.confirmed_at,
    r.side,
    l.title, l.listing_type, l.status, l.monthly_rent, l.advance_months, l.open_slots,
    public.request_seats(l.listing_type, r.members_count),
    -- Places held by other live offers on this ad (the landlord side only).
    case when r.side = 'landlord' then (
      select coalesce(sum(public.request_seats(l.listing_type, o.members_count)), 0)::integer
      from public.rental_requests o
      where o.listing_id = l.id and o.id <> r.id and o.status = 'offered' and o.offer_expires_at > now()
    ) end,
    b.area_id,
    (select p.storage_path from public.listing_photos p
      where p.listing_id = l.id order by p.sort_order limit 1),
    l.posted_by, poster.full_name, poster.avatar_url, l.posted_as,
    seeker.full_name, seeker.avatar_url, seeker.created_at, seeker.is_banned,
    case
      when r.side = 'landlord' and r.status_now in ('shortlisted', 'offered', 'confirmed') then pp.phone
    end,
    public.message_send_block(r.id),
    case when r.side = 'seeker' then public.seeker_messages_left(r.id) end,
    t.id,
    case when r.status_now = 'confirmed' then u.label end,
    case when r.status_now = 'confirmed' then bp.road_address end,
    case when r.status_now = 'confirmed' then bp.house_no end,
    case when r.status_now = 'confirmed' and r.side = 'seeker' then lp.contact_phone end
  from req r
  join public.listings l on l.id = r.listing_id
  join public.units u on u.id = l.unit_id
  join public.buildings b on b.id = u.building_id
  join public.profiles seeker on seeker.id = r.tenant_id
  left join public.profiles poster on poster.id = l.posted_by
  left join public.profile_private pp on pp.user_id = r.tenant_id
  left join public.building_private bp on bp.building_id = b.id
  left join public.listing_private lp on lp.listing_id = l.id
  left join public.tenancies t on t.request_id = r.id
  where r.side is not null;
$$;

revoke execute on function public.thread_info(uuid) from public, anon;
grant execute on function public.thread_info(uuid) to authenticated;

-- my_requests: adds the offer.
drop function if exists public.my_requests();
create function public.my_requests()
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
  offered_at timestamptz,
  offer_expires_at timestamptz,
  offer_rent integer,
  offer_advance integer,
  offer_start_date date,
  confirmed_at timestamptz,
  listing_title text,
  listing_type public.listing_type,
  listing_status public.listing_status,
  monthly_rent integer,
  area_id integer,
  landmark text,
  cover_path text,
  poster_name text,
  posted_as public.posted_as,
  message_count integer,
  unread_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id, r.listing_id, public.effective_request_status(r.status, r.offer_expires_at),
    r.household_type, r.members_count, r.occupation,
    r.move_in_date, r.message, r.decline_reason, r.decline_note, r.shortlisted_at,
    coalesce(r.closed_at, case when r.status = 'offered' and r.offer_expires_at <= now() then r.offer_expires_at end),
    r.created_at,
    r.offered_at, r.offer_expires_at, r.offer_rent, r.offer_advance, r.offer_start_date, r.confirmed_at,
    l.title, l.listing_type, l.status, l.monthly_rent, b.area_id, b.landmark,
    (select p.storage_path from public.listing_photos p
      where p.listing_id = l.id order by p.sort_order limit 1),
    pr.full_name, l.posted_as,
    (select count(*)::integer from public.messages m where m.request_id = r.id),
    (select count(*)::integer from public.messages m
      where m.request_id = r.id and m.read_at is null and m.sender_id <> r.tenant_id)
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

-- request_inbox: live offers and confirmed tenants are counted on their own
-- (shortlisted_count still includes live offers, as in F6), and the ad's
-- places left are included.
drop function if exists public.request_inbox();
create function public.request_inbox()
returns table (
  listing_id uuid,
  listing_title text,
  listing_type public.listing_type,
  listing_status public.listing_status,
  monthly_rent integer,
  open_slots smallint,
  unit_label text,
  building_name text,
  area_id integer,
  cover_path text,
  pending_count integer,
  shortlisted_count integer,
  offered_count integer,
  confirmed_count integer,
  closed_count integer,
  last_request_at timestamptz,
  unread_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select l.id, l.title, l.listing_type, l.status, l.monthly_rent, l.open_slots, l.unit_id
    from public.listings l
    where l.id in (select public.managed_listing_ids())
  ),
  reqs as (
    select r.listing_id, r.created_at, public.effective_request_status(r.status, r.offer_expires_at) as status
    from public.rental_requests r
    where r.listing_id in (select id from mine)
  ),
  counts as (
    select
      listing_id,
      count(*) filter (where status = 'pending')::integer as pending_count,
      count(*) filter (where status in ('shortlisted', 'offered'))::integer as shortlisted_count,
      count(*) filter (where status = 'offered')::integer as offered_count,
      count(*) filter (where status = 'confirmed')::integer as confirmed_count,
      count(*) filter (where status in ('declined', 'withdrawn', 'expired'))::integer as closed_count,
      max(created_at) as last_request_at
    from reqs
    group by listing_id
  ),
  unread as (
    -- Messages from seekers that nobody on the landlord side has opened yet.
    select r.listing_id, count(*)::integer as unread_count
    from public.rental_requests r
    join public.messages m on m.request_id = r.id and m.read_at is null and m.sender_id = r.tenant_id
    where r.listing_id in (select id from mine)
    group by r.listing_id
  )
  select
    m.id, m.title, m.listing_type, m.status, m.monthly_rent, m.open_slots, u.label, b.name, b.area_id,
    (select p.storage_path from public.listing_photos p
      where p.listing_id = m.id order by p.sort_order limit 1),
    c.pending_count, c.shortlisted_count, c.offered_count, c.confirmed_count, c.closed_count,
    c.last_request_at,
    coalesce(un.unread_count, 0)
  from mine m
  join counts c on c.listing_id = m.id
  left join unread un on un.listing_id = m.id
  join public.units u on u.id = m.unit_id
  join public.buildings b on b.id = u.building_id
  order by c.pending_count > 0 desc, coalesce(un.unread_count, 0) > 0 desc, c.last_request_at desc;
$$;

revoke execute on function public.request_inbox() from public, anon;
grant execute on function public.request_inbox() to authenticated;

-- message_threads: the same as F7 with the effective status.
create or replace function public.message_threads()
returns table (
  request_id uuid,
  my_side text,
  request_status public.request_status,
  listing_id uuid,
  listing_title text,
  listing_type public.listing_type,
  listing_status public.listing_status,
  other_name text,
  other_avatar text,
  last_body text,
  last_from_me boolean,
  last_at timestamptz,
  unread_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with t as (
    select
      r.id, public.effective_request_status(r.status, r.offer_expires_at) as status,
      r.listing_id, r.tenant_id, r.tenant_id = (select auth.uid()) as as_seeker
    from public.rental_requests r
    where r.id in (select public.my_thread_ids())
  ),
  -- The 100 threads with the newest messages, before any other lookups.
  latest as (
    select t.*, lm.body, lm.sender_id, lm.created_at as last_at
    from t
    join lateral (
      select m.body, m.sender_id, m.created_at
      from public.messages m
      where m.request_id = t.id
      order by m.created_at desc
      limit 1
    ) lm on true
    order by lm.created_at desc
    limit 100
  )
  select
    x.id,
    case when x.as_seeker then 'seeker' else 'landlord' end,
    x.status,
    l.id, l.title, l.listing_type, l.status,
    case when x.as_seeker then poster.full_name else seeker.full_name end,
    case when x.as_seeker then poster.avatar_url else seeker.avatar_url end,
    left(x.body, 160),
    x.sender_id = (select auth.uid()),
    x.last_at,
    (
      select count(*)::integer
      from public.messages m
      where m.request_id = x.id and m.read_at is null
        and case when x.as_seeker then m.sender_id <> x.tenant_id else m.sender_id = x.tenant_id end
    )
  from latest x
  join public.listings l on l.id = x.listing_id
  join public.profiles seeker on seeker.id = x.tenant_id
  left join public.profiles poster on poster.id = l.posted_by
  order by x.last_at desc;
$$;

-- 12. Tenants read their building's exact address --------------------------------------------
-- Plan section 4: building_private is readable by the building's active
-- tenants (F2 left this for F8). Added next to the existing policies.

create or replace function public.my_tenancy_building_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct u.building_id
  from public.tenancies t
  join public.units u on u.id = t.unit_id
  where t.tenant_id = (select auth.uid()) and t.status = 'active';
$$;

revoke execute on function public.my_tenancy_building_ids() from public, anon;
grant execute on function public.my_tenancy_building_ids() to authenticated;

drop policy if exists "active tenants read their building's address" on public.building_private;
create policy "active tenants read their building's address"
  on public.building_private for select to authenticated
  using (building_id in (select public.my_tenancy_building_ids()));

-- 13. No new ad for a rented unit -------------------------------------------------------------
-- The unit is occupied until its tenancy ends (House Manage, or re-listing in
-- F10). The wizard already hides such units; this is the database check.
-- Otherwise the same as F2.

create or replace function public.create_listing_draft(p_unit_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_unit public.units%rowtype;
  v_building public.buildings%rowtype;
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

  select * into v_building from public.buildings where id = v_unit.building_id;
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
    -- A caretaker's previous ad in this building already named the owner.
    case when v_posted_as = 'caretaker' then (
      select l.owner_name from public.listings l
      join public.units u on u.id = l.unit_id
      where u.building_id = v_unit.building_id and l.owner_name is not null
      order by l.created_at desc limit 1
    ) end
  )
  returning id into v_id;

  insert into public.listing_private (listing_id, contact_phone)
  values (v_id, v_phone);

  return v_id;
end;
$$;

-- 14. Live updates for requests (Supabase Realtime) ----------------------------------------------
-- An offer, an acceptance, a decline or a withdrawal reaches the other side's
-- open page without reloading. Realtime checks the rental_requests read
-- policy for every listener, as for messages (F7).

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rental_requests'
    )
  then
    alter publication supabase_realtime add table public.rental_requests;
  end if;
end;
$$;
