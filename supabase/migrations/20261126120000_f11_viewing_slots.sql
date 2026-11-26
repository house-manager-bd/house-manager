-- F11: viewing slots (plan section 9, FR32).
-- 1. The ad's landlord side (the poster and the building's managers) adds
--    visit times to a live ad (paused or not): a day in the next 14 days,
--    between 7 am and 10 pm Dhaka time, cut into visits of 15 to 60
--    minutes, at most 12 at a time and 40 coming up per ad. One time takes
--    one visit.
-- 2. A member whose request is shortlisted (or has a live offer) books one
--    free time on the request's page, up to 1 hour before it starts. One
--    upcoming visit per request: booking another time moves the visit. The
--    member can cancel until the visit starts; the landlord side can remove
--    a time until it starts (the member is told).
-- 3. When a request closes (declined, withdrawn, expired), its upcoming
--    visit is freed. A confirmed tenant keeps theirs.
-- 4. Notifications (in the app and by email):
--      viewing_booked        the landlord side: a member booked (or moved) a visit
--      viewing_cancelled     the landlord side when the member cancels (or
--                            withdraws a shortlisted request with a visit),
--                            the member when the landlord side removes the time
--      viewing_reminder      both sides, 3 hours before the visit (the scheduled job)
--      viewing_slots_added   shortlisted members without a visit: new times to book
-- 5. The scheduled job also sends the reminders, deletes old times, and
--    keeps a request with a recent or coming visit from closing as stale.
--
-- Every new table has RLS in this migration (working rule). The whole file
-- is safe to run twice ("if not exists", "or replace", "drop ... if exists").

-- 1. viewing_slots ----------------------------------------------------------------------

create table if not exists public.viewing_slots (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_by uuid references public.profiles (id) on delete set null,
  -- The request whose member booked this time (empty while it is free).
  booked_request_id uuid references public.rental_requests (id) on delete set null,
  booked_at timestamptz,
  -- When the 3 hour reminder went out (or was skipped for a late booking).
  reminded_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.viewing_slots drop constraint if exists viewing_slots_time_check;
alter table public.viewing_slots add constraint viewing_slots_time_check
  check (ends_at > starts_at and ends_at - starts_at <= interval '2 hours');

comment on table public.viewing_slots is
  'Visit times of an ad (F11). Written only by add_viewing_slots, remove_viewing_slot, book_viewing, cancel_viewing and the request trigger; read by the landlord side and by the member who booked.';

create index if not exists viewing_slots_listing_time_idx on public.viewing_slots (listing_id, starts_at);
create index if not exists viewing_slots_booked_idx
  on public.viewing_slots (booked_request_id)
  where booked_request_id is not null;
create index if not exists viewing_slots_reminder_idx
  on public.viewing_slots (starts_at)
  where booked_request_id is not null and reminded_at is null;

alter table public.viewing_slots enable row level security;

-- The landlord side sees every time of its ads; a member sees the times
-- they booked. Free times reach members only through request_viewings.
drop policy if exists "the landlord side reads its ads' visit times" on public.viewing_slots;
create policy "the landlord side reads its ads' visit times"
  on public.viewing_slots for select to authenticated
  using (listing_id in (select public.managed_listing_ids()));

drop policy if exists "members read the visits they booked" on public.viewing_slots;
create policy "members read the visits they booked"
  on public.viewing_slots for select to authenticated
  using (booked_request_id in (select public.my_thread_ids()));

revoke all on public.viewing_slots from anon;
revoke insert, update, delete on public.viewing_slots from authenticated;
grant select on public.viewing_slots to authenticated;

-- 2. New notification types ----------------------------------------------------------

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (
  type in (
    'request_new', 'request_shortlisted', 'request_declined',
    'offer_received', 'offer_taken_back', 'offer_accepted', 'offer_turned_down', 'offer_expired',
    'ad_approved', 'ad_rejected', 'ad_hidden', 'ad_restored',
    'ad_expiring', 'ad_expired', 'request_expired',
    'caretaker_invited', 'caretaker_joined', 'caretaker_declined', 'caretaker_removed', 'caretaker_left',
    'viewing_booked', 'viewing_cancelled', 'viewing_reminder', 'viewing_slots_added'
  )
);

-- 3. Helpers ------------------------------------------------------------------------------

-- The rules, in one place (the app has the same numbers in
-- src/lib/validation/viewing.ts).
create or replace function public.viewing_constants()
returns table (
  days_ahead integer,
  max_per_add integer,
  max_upcoming integer,
  book_before_minutes integer,
  remind_hours integer,
  day_start time,
  day_end time,
  daily_bookings integer
)
language sql
immutable
set search_path = ''
as $$
  select 14, 12, 40, 60, 3, time '07:00', time '22:00', 5;
$$;

grant execute on function public.viewing_constants() to anon, authenticated;

-- What a viewing notification says: the ad, the member and the time.
-- Internal.
create or replace function public.viewing_notice_data(
  p_listing_id uuid,
  p_tenant_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'title', l.title,
    'listing_type', l.listing_type,
    'member_name', (select p.full_name from public.profiles p where p.id = p_tenant_id),
    'starts_at', p_starts_at,
    'ends_at', p_ends_at
  )
  from public.listings l
  where l.id = p_listing_id;
$$;

revoke execute on function public.viewing_notice_data(uuid, uuid, timestamptz, timestamptz)
  from public, anon, authenticated;

-- One notification for every member of the ad's landlord side (not the
-- member themselves). Internal.
create or replace function public.notify_listing_side(
  p_listing_id uuid,
  p_tenant_id uuid,
  p_type text,
  p_request_id uuid,
  p_data jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
begin
  for v_uid in select s from public.listing_side_member_ids(p_listing_id) s loop
    if v_uid is distinct from p_tenant_id then
      perform public.add_notification(v_uid, p_type, p_request_id, p_listing_id, p_data);
    end if;
  end loop;
end;
$$;

revoke execute on function public.notify_listing_side(uuid, uuid, text, uuid, jsonb)
  from public, anon, authenticated;

-- 4. The landlord side adds and removes times -------------------------------------------

-- Cuts p_from to p_to on p_date (Dhaka time) into visits of p_minutes and
-- adds them. Returns how many were added. Shortlisted members (and members
-- with a live offer) who have no visit coming up are told, at most one
-- unread notice per member and ad.
create or replace function public.add_viewing_slots(
  p_listing_id uuid,
  p_date date,
  p_from time,
  p_to time,
  p_minutes integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_c record;
  v_l public.listings%rowtype;
  v_today date := (now() at time zone 'Asia/Dhaka')::date;
  v_count integer;
  v_first timestamptz;
  v_last_end timestamptz;
  v_upcoming integer;
  v_r record;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select * into v_c from public.viewing_constants();

  -- Two additions at the same moment cannot both pass the overlap check.
  select * into v_l from public.listings where id = p_listing_id for update;
  if not found or not public.can_manage_listing(p_listing_id) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  perform public.require_not_banned();
  if v_l.status <> 'active' then
    raise exception 'listing_not_active' using errcode = 'P0001';
  end if;

  if p_date is null or p_from is null or p_to is null or p_minutes is null
    or p_minutes not in (15, 20, 30, 45, 60)
    or extract(second from p_from) <> 0 or extract(second from p_to) <> 0
  then
    raise exception 'invalid_request' using errcode = '22023';
  end if;
  if p_date < v_today or p_date > v_today + v_c.days_ahead then
    raise exception 'viewing_date_invalid' using errcode = '22023';
  end if;
  if p_from < v_c.day_start or p_to > v_c.day_end or p_from >= p_to then
    raise exception 'viewing_time_invalid' using errcode = '22023';
  end if;

  v_count := floor(extract(epoch from (p_to - p_from)) / 60 / p_minutes)::integer;
  if v_count < 1 then
    raise exception 'viewing_time_invalid' using errcode = '22023';
  end if;
  if v_count > v_c.max_per_add then
    raise exception 'viewing_too_many' using errcode = 'P0001';
  end if;

  v_first := (p_date + p_from) at time zone 'Asia/Dhaka';
  v_last_end := v_first + make_interval(mins => v_count * p_minutes);
  -- Members need time to see the time and get there.
  if v_first < now() + make_interval(mins => v_c.book_before_minutes) then
    raise exception 'viewing_too_soon' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.viewing_slots s
    where s.listing_id = p_listing_id
      and s.starts_at < v_last_end and s.ends_at > v_first
  ) then
    raise exception 'viewing_overlap' using errcode = 'P0001';
  end if;
  select count(*) into v_upcoming
  from public.viewing_slots
  where listing_id = p_listing_id and starts_at > now();
  if v_upcoming + v_count > v_c.max_upcoming then
    raise exception 'viewing_limit' using errcode = 'P0001';
  end if;

  insert into public.viewing_slots (listing_id, starts_at, ends_at, created_by)
  select p_listing_id,
         v_first + make_interval(mins => i * p_minutes),
         v_first + make_interval(mins => (i + 1) * p_minutes),
         v_uid
  from generate_series(0, v_count - 1) as i;

  for v_r in
    select r.id, r.tenant_id
    from public.rental_requests r
    join public.profiles p on p.id = r.tenant_id and not p.is_banned
    where r.listing_id = p_listing_id
      and public.effective_request_status(r.status, r.offer_expires_at) in ('shortlisted', 'offered')
      and not exists (
        select 1 from public.viewing_slots s
        where s.booked_request_id = r.id and s.starts_at > now()
      )
      and not exists (
        select 1 from public.notifications n
        where n.user_id = r.tenant_id and n.listing_id = p_listing_id
          and n.type = 'viewing_slots_added' and n.read_at is null
      )
  loop
    perform public.add_notification(
      v_r.tenant_id, 'viewing_slots_added', v_r.id, p_listing_id,
      jsonb_build_object('title', v_l.title, 'listing_type', v_l.listing_type)
    );
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.add_viewing_slots(uuid, date, time, time, integer) from public, anon;
grant execute on function public.add_viewing_slots(uuid, date, time, time, integer) to authenticated;

-- Removes a time that has not started. A booked time tells its member,
-- who can book another. Works for a suspended landlord too (it shares
-- nothing) and on an ad that is no longer live.
create or replace function public.remove_viewing_slot(p_slot_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_s public.viewing_slots%rowtype;
  v_booked uuid;
  v_r public.rental_requests%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select * into v_s from public.viewing_slots where id = p_slot_id;
  if not found or not public.can_manage_listing(v_s.listing_id) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  -- The request first, then the time (the order book_viewing uses), so the
  -- two never wait for each other.
  v_booked := v_s.booked_request_id;
  if v_booked is not null then
    select * into v_r from public.rental_requests where id = v_booked for update;
  end if;
  select * into v_s from public.viewing_slots where id = p_slot_id for update;
  if not found then
    raise exception 'viewing_gone' using errcode = 'P0001';
  end if;
  if v_s.booked_request_id is distinct from v_booked then
    raise exception 'viewing_changed' using errcode = 'P0001';
  end if;
  if v_s.starts_at <= now() then
    raise exception 'viewing_started' using errcode = 'P0001';
  end if;

  delete from public.viewing_slots where id = p_slot_id;

  if v_booked is not null then
    -- Open request pages of both sides refresh (Realtime on rental_requests).
    update public.rental_requests set updated_at = now() where id = v_booked;
    if v_r.tenant_id is distinct from v_uid then
      perform public.add_notification(
        v_r.tenant_id, 'viewing_cancelled', v_booked, v_s.listing_id,
        public.viewing_notice_data(v_s.listing_id, v_r.tenant_id, v_s.starts_at, v_s.ends_at)
          || '{"by": "landlord"}'::jsonb
      );
    end if;
  end if;
end;
$$;

revoke execute on function public.remove_viewing_slot(uuid) from public, anon;
grant execute on function public.remove_viewing_slot(uuid) to authenticated;

-- 5. The member books and cancels -------------------------------------------------------

-- Books a free time for the member's shortlisted request (or one with a live
-- offer). A visit already coming up for this request moves to the new time.
-- At most 5 bookings per request in 24 hours, so moving back and forth
-- cannot flood the landlord. Returns the time's start.
create or replace function public.book_viewing(p_request_id uuid, p_slot_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_c record;
  v_r public.rental_requests%rowtype;
  v_listing_status public.listing_status;
  v_s public.viewing_slots%rowtype;
  v_old public.viewing_slots%rowtype;
  v_changed boolean := false;
  v_recent integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select * into v_c from public.viewing_constants();

  select * into v_r from public.rental_requests where id = p_request_id for update;
  if not found or v_r.tenant_id <> v_uid then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  perform public.require_not_banned();
  if public.effective_request_status(v_r.status, v_r.offer_expires_at) not in ('shortlisted', 'offered') then
    raise exception 'wrong_status' using errcode = 'P0001';
  end if;
  -- A paused ad keeps its shortlists and offers (F10), so visits too.
  select status into v_listing_status from public.listings where id = v_r.listing_id;
  if v_listing_status is distinct from 'active' then
    raise exception 'listing_not_active' using errcode = 'P0001';
  end if;

  select * into v_s from public.viewing_slots where id = p_slot_id for update;
  if not found or v_s.listing_id <> v_r.listing_id then
    raise exception 'viewing_gone' using errcode = 'P0001';
  end if;
  if v_s.booked_request_id = p_request_id then
    return v_s.starts_at;
  end if;
  if v_s.booked_request_id is not null then
    raise exception 'viewing_taken' using errcode = 'P0001';
  end if;
  if v_s.starts_at < now() + make_interval(mins => v_c.book_before_minutes) then
    raise exception 'viewing_too_soon' using errcode = 'P0001';
  end if;

  -- Each booking writes one notification per landlord-side member at the
  -- same moment, so distinct moments count bookings.
  select count(distinct n.created_at) into v_recent
  from public.notifications n
  where n.request_id = p_request_id and n.type = 'viewing_booked'
    and n.created_at > now() - interval '24 hours';
  if v_recent >= v_c.daily_bookings then
    raise exception 'viewing_change_limit' using errcode = 'P0001';
  end if;

  select * into v_old
  from public.viewing_slots
  where booked_request_id = p_request_id and starts_at > now()
  for update;
  if found then
    update public.viewing_slots
    set booked_request_id = null, booked_at = null, reminded_at = null
    where id = v_old.id;
    v_changed := true;
  end if;

  update public.viewing_slots
  set booked_request_id = p_request_id, booked_at = now(), reminded_at = null
  where id = p_slot_id;
  -- A booking is a step on the request (F10's 14 day rule), and the open
  -- request pages refresh through Realtime.
  update public.rental_requests set updated_at = now() where id = p_request_id;

  perform public.notify_listing_side(
    v_r.listing_id, v_r.tenant_id, 'viewing_booked', p_request_id,
    public.viewing_notice_data(v_r.listing_id, v_r.tenant_id, v_s.starts_at, v_s.ends_at)
      || jsonb_build_object('changed', v_changed)
  );
  return v_s.starts_at;
end;
$$;

revoke execute on function public.book_viewing(uuid, uuid) from public, anon;
grant execute on function public.book_viewing(uuid, uuid) to authenticated;

-- The member cancels their coming visit (also when suspended: it shares
-- nothing). The landlord side is told.
create or replace function public.cancel_viewing(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_r public.rental_requests%rowtype;
  v_s public.viewing_slots%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select * into v_r from public.rental_requests where id = p_request_id for update;
  if not found or v_r.tenant_id <> v_uid then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select * into v_s
  from public.viewing_slots
  where booked_request_id = p_request_id and starts_at > now()
  for update;
  if not found then
    raise exception 'viewing_gone' using errcode = 'P0001';
  end if;

  update public.viewing_slots
  set booked_request_id = null, booked_at = null, reminded_at = null
  where id = v_s.id;
  update public.rental_requests set updated_at = now() where id = p_request_id;

  perform public.notify_listing_side(
    v_r.listing_id, v_r.tenant_id, 'viewing_cancelled', p_request_id,
    public.viewing_notice_data(v_r.listing_id, v_r.tenant_id, v_s.starts_at, v_s.ends_at)
      || '{"by": "member"}'::jsonb
  );
end;
$$;

revoke execute on function public.cancel_viewing(uuid) from public, anon;
grant execute on function public.cancel_viewing(uuid) to authenticated;

-- 6. A closed request frees its visit ----------------------------------------------------
-- Declined (by the landlord side, or automatically when the place is
-- taken), withdrawn, or expired. The member already hears about the
-- decline or the expiry, and the landlord side about a turned down offer;
-- withdrawing a shortlisted request tells nobody (F9), so a visit coming
-- up is the one thing the landlord side still needs to hear about.
create or replace function public.release_request_viewings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s record;
begin
  if new.status not in ('declined', 'withdrawn', 'expired')
    or old.status not in ('pending', 'shortlisted', 'offered')
  then
    return null;
  end if;

  for v_s in
    update public.viewing_slots
    set booked_request_id = null, booked_at = null, reminded_at = null
    where booked_request_id = new.id and starts_at > now()
    returning starts_at, ends_at
  loop
    if new.status = 'withdrawn' and old.status = 'shortlisted' then
      perform public.notify_listing_side(
        new.listing_id, new.tenant_id, 'viewing_cancelled', new.id,
        public.viewing_notice_data(new.listing_id, new.tenant_id, v_s.starts_at, v_s.ends_at)
          || '{"by": "member"}'::jsonb
      );
    end if;
  end loop;
  return null;
end;
$$;

revoke execute on function public.release_request_viewings() from public, anon, authenticated;

drop trigger if exists rental_requests_release_viewings on public.rental_requests;
create trigger rental_requests_release_viewings
  after update of status on public.rental_requests
  for each row execute function public.release_request_viewings();

-- 7. Reading -----------------------------------------------------------------------------

-- Everything the request's page shows about visits, for both sides:
--   booking     the coming visit ({id, starts_at, ends_at}) or null
--   last_visit  the latest visit that has started, in the last 30 days, or null
--   free        free times the member can book now (only while they can book)
--   free_count  how many there are
--   can_book    whether the member can book now (false for the landlord side)
--   block       why booking is not possible: pending, closed, not_live, banned
--   address     the building's address and exact pin, for the member with a
--               visit coming up while the ad is live (members already see it
--               on the ad page then), and for the landlord side
-- Null when the caller is neither side of the request (admins included).
create or replace function public.request_viewings(p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_c record;
  v_r public.rental_requests%rowtype;
  v_l public.listings%rowtype;
  v_seeker boolean;
  v_status public.request_status;
  v_block text;
  v_open boolean;
  v_booking jsonb;
  v_last jsonb;
  v_free jsonb;
  v_address jsonb;
begin
  if v_uid is null then
    return null;
  end if;
  select * into v_c from public.viewing_constants();
  select * into v_r from public.rental_requests where id = p_request_id;
  if not found then
    return null;
  end if;
  v_seeker := v_r.tenant_id = v_uid;
  if not v_seeker and not public.can_manage_listing(v_r.listing_id) then
    return null;
  end if;
  select * into v_l from public.listings where id = v_r.listing_id;

  v_status := public.effective_request_status(v_r.status, v_r.offer_expires_at);
  v_open := v_status in ('shortlisted', 'offered');
  v_block := case
    when v_status = 'pending' then 'pending'
    when not v_open then 'closed'
    when v_l.status <> 'active' then 'not_live'
    when exists (select 1 from public.profiles where id = v_r.tenant_id and is_banned) then 'banned'
    else null
  end;

  select jsonb_build_object('id', s.id, 'starts_at', s.starts_at, 'ends_at', s.ends_at)
  into v_booking
  from public.viewing_slots s
  where s.booked_request_id = p_request_id and s.starts_at > now()
  order by s.starts_at
  limit 1;

  select jsonb_build_object('starts_at', s.starts_at, 'ends_at', s.ends_at)
  into v_last
  from public.viewing_slots s
  where s.booked_request_id = p_request_id
    and s.starts_at <= now() and s.starts_at > now() - interval '30 days'
  order by s.starts_at desc
  limit 1;

  if v_block is null then
    select coalesce(jsonb_agg(
             jsonb_build_object('id', s.id, 'starts_at', s.starts_at, 'ends_at', s.ends_at)
             order by s.starts_at
           ), '[]'::jsonb)
    into v_free
    from public.viewing_slots s
    where s.listing_id = v_r.listing_id
      and s.booked_request_id is null
      and s.starts_at >= now() + make_interval(mins => v_c.book_before_minutes);
  else
    v_free := '[]'::jsonb;
  end if;

  if not v_seeker or (v_booking is not null and v_l.status = 'active') then
    select jsonb_build_object(
             'road_address', bp.road_address,
             'house_no', bp.house_no,
             'exact_lat', bp.exact_lat,
             'exact_lng', bp.exact_lng
           )
    into v_address
    from public.units u
    join public.building_private bp on bp.building_id = u.building_id
    where u.id = v_l.unit_id;
  end if;

  return jsonb_build_object(
    'booking', v_booking,
    'last_visit', v_last,
    'free', v_free,
    'free_count', jsonb_array_length(v_free),
    'can_book', v_seeker and v_block is null,
    'block', v_block,
    'address', v_address
  );
end;
$$;

revoke execute on function public.request_viewings(uuid) from public, anon;
grant execute on function public.request_viewings(uuid) to authenticated;

-- One ad's times for its landlord side: every time that has not ended, and
-- booked times of the last 30 days, with the member who booked.
create or replace function public.listing_viewing_slots(p_listing_id uuid)
returns table (
  id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  booked_request_id uuid,
  booked_at timestamptz,
  member_id uuid,
  member_name text,
  member_avatar text,
  request_status public.request_status
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.can_manage_listing(p_listing_id) then
    return;
  end if;
  return query
  select s.id, s.starts_at, s.ends_at, s.booked_request_id, s.booked_at,
         r.tenant_id, p.full_name, p.avatar_url,
         public.effective_request_status(r.status, r.offer_expires_at)
  from public.viewing_slots s
  left join public.rental_requests r on r.id = s.booked_request_id
  left join public.profiles p on p.id = r.tenant_id
  where s.listing_id = p_listing_id
    and (s.ends_at > now() or (s.booked_request_id is not null and s.starts_at > now() - interval '30 days'))
  order by s.starts_at;
end;
$$;

revoke execute on function public.listing_viewing_slots(uuid) from public, anon;
grant execute on function public.listing_viewing_slots(uuid) to authenticated;

-- The caller's coming visits, on both sides, soonest first (the dashboard).
create or replace function public.my_upcoming_viewings(p_limit integer default 5)
returns table (
  slot_id uuid,
  request_id uuid,
  listing_id uuid,
  listing_title text,
  listing_type public.listing_type,
  starts_at timestamptz,
  ends_at timestamptz,
  side text,
  member_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, r.id, l.id, l.title, l.listing_type, s.starts_at, s.ends_at,
         case when r.tenant_id = (select auth.uid()) then 'seeker' else 'landlord' end,
         p.full_name
  from public.viewing_slots s
  join public.rental_requests r on r.id = s.booked_request_id
  join public.listings l on l.id = r.listing_id
  join public.profiles p on p.id = r.tenant_id
  where s.ends_at > now()
    and (
      r.tenant_id = (select auth.uid())
      or r.listing_id in (select public.managed_listing_ids())
    )
  order by s.starts_at
  limit least(greatest(coalesce(p_limit, 5), 1), 20);
$$;

revoke execute on function public.my_upcoming_viewings(integer) from public, anon;
grant execute on function public.my_upcoming_viewings(integer) to authenticated;

-- 8. The scheduled job ----------------------------------------------------------------------

-- "Your visit is in 3 hours", to both sides, once per booking. A visit
-- booked less than 3 hours ahead gets no reminder (the booking itself was
-- the news). Returns how many visits were reminded.
create or replace function public.remind_viewings()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c record;
  v_s record;
  v_data jsonb;
  v_count integer := 0;
begin
  select * into v_c from public.viewing_constants();
  for v_s in
    select s.id, s.starts_at, s.ends_at, s.booked_at, r.id as request_id, r.listing_id, r.tenant_id
    from public.viewing_slots s
    join public.rental_requests r on r.id = s.booked_request_id
    where s.reminded_at is null
      and s.starts_at > now()
      and s.starts_at <= now() + make_interval(hours => v_c.remind_hours)
    for update of s skip locked
  loop
    if v_s.booked_at <= v_s.starts_at - make_interval(hours => v_c.remind_hours) then
      v_data := public.viewing_notice_data(v_s.listing_id, v_s.tenant_id, v_s.starts_at, v_s.ends_at);
      perform public.add_notification(
        v_s.tenant_id, 'viewing_reminder', v_s.request_id, v_s.listing_id,
        v_data || '{"side": "seeker"}'::jsonb
      );
      perform public.notify_listing_side(
        v_s.listing_id, v_s.tenant_id, 'viewing_reminder', v_s.request_id,
        v_data || '{"side": "landlord"}'::jsonb
      );
      v_count := v_count + 1;
    end if;
    update public.viewing_slots set reminded_at = now() where id = v_s.id;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.remind_viewings() from public, anon, authenticated;

-- A new or shortlisted request with no step, no message and no visit for 14
-- days (plan section 1.4). F11: a visit coming up, or one in the last 14
-- days, keeps the request open. Otherwise the same as F10.
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
    )
    and not exists (
      select 1 from public.viewing_slots s
      where s.booked_request_id = r.id and s.ends_at >= now() - interval '14 days'
    );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.expire_stale_requests() from public, anon, authenticated;

-- F11 adds the visit reminders and deletes old times: free times a day
-- after they ended, booked ones after 90 days. Otherwise the same as F10.
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
  v_visits integer;
  v_notifications integer;
  v_emails integer;
  v_slots integer;
  v_asked boolean := false;
begin
  v_offers := public.expire_offers(null);
  v_requests := public.expire_stale_requests();
  v_ads := public.expire_listings();
  v_reminded := public.remind_expiring_listings();
  v_visits := public.remind_viewings();

  -- Read notifications older than 90 days (their email rows go with them),
  -- and finished email rows older than 30 days (the notification stays).
  delete from public.notifications where read_at < now() - interval '90 days';
  get diagnostics v_notifications = row_count;
  delete from public.notification_emails
  where status in ('sent', 'skipped', 'failed') and created_at < now() - interval '30 days';
  get diagnostics v_emails = row_count;
  delete from public.viewing_slots
  where (booked_request_id is null and ends_at < now() - interval '1 day')
     or ends_at < now() - interval '90 days';
  get diagnostics v_slots = row_count;

  if p_request_emails then
    v_asked := private.request_email_delivery();
  end if;

  return jsonb_build_object(
    'offers_expired', v_offers,
    'requests_expired', v_requests,
    'ads_expired', v_ads,
    'ads_reminded', v_reminded,
    'viewings_reminded', v_visits,
    'notifications_deleted', v_notifications,
    'emails_deleted', v_emails,
    'viewing_slots_deleted', v_slots,
    'email_delivery_requested', v_asked
  );
end;
$$;

revoke execute on function private.run_scheduled_jobs(boolean) from public, anon, authenticated;
