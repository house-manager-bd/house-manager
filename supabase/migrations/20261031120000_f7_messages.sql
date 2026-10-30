-- F7: a message thread per rental request (plan FR25, section 1.4).
-- 1. The seeker and the ad's landlord side (the poster and the building's
--    managers) write to each other on one request. Nobody else reads the
--    thread: not other members, and not admins (plan section 3).
-- 2. Messages are written only by send_message, which checks who may write
--    and when. Reading marks the other side's messages as read
--    (mark_thread_read), which gives the unread counts.
-- 3. Live updates: the table is added to the supabase_realtime publication.
--    Supabase Realtime checks the read policy below for every subscriber, so
--    a member only receives messages from their own threads.
--
-- Who can write, and when:
-- - pending, shortlisted, offered (F8) and confirmed (F8) requests are open
--   for messages; declined, withdrawn and expired requests are read-only.
-- - Not while the ad is hidden or rejected by moderation (it may be a scam).
-- - Not by a suspended member, and the landlord side cannot write to a
--   suspended seeker.
-- - Until the landlord side answers (writes a message or shortlists), the
--   seeker can add at most 3 messages, so a new request cannot turn into a
--   stream of reminders.
-- - 30 messages per member per 10 minutes, against scripts and floods.
--
-- Every new table has RLS in this migration (working rule). The whole file
-- is safe to run twice ("if not exists", "or replace", "drop ... if exists").

-- 1. Which requests the caller is on ----------------------------------------------------
-- As the seeker, or on the landlord side of the ad. Admins are not included.
-- Used as "request_id in (select ...)", which Postgres works out once per
-- query (the F6 pattern).

create or replace function public.my_thread_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.id from public.rental_requests r where r.tenant_id = (select auth.uid())
  union
  select r.id from public.rental_requests r where r.listing_id in (select public.managed_listing_ids());
$$;

revoke execute on function public.my_thread_ids() from public, anon;
grant execute on function public.my_thread_ids() to authenticated;

-- 2. messages ----------------------------------------------------------------------------

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.rental_requests (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  -- When the other side first opened the thread after this message.
  read_at timestamptz
);

comment on table public.messages is
  'Messages on one rental request (F7). Read by the seeker and the ad''s landlord side only. Written only through send_message and mark_thread_read.';

create index if not exists messages_request_time_idx on public.messages (request_id, created_at desc);
-- Unread counts look only at unread messages.
create index if not exists messages_unread_idx on public.messages (request_id) where read_at is null;
-- The per-member rate limit.
create index if not exists messages_sender_time_idx on public.messages (sender_id, created_at desc);

alter table public.messages enable row level security;

drop policy if exists "the two sides of a request read its messages" on public.messages;
create policy "the two sides of a request read its messages"
  on public.messages for select to authenticated
  using (request_id in (select public.my_thread_ids()));

revoke all on public.messages from anon;
revoke insert, update, delete on public.messages from authenticated;
grant select on public.messages to authenticated;

-- 3. The rules for writing ----------------------------------------------------------------

-- How many more messages the seeker may add before the landlord side answers,
-- or null when there is no such limit (the landlord side wrote, or the
-- request is no longer new).
create or replace function public.seeker_messages_left(p_request_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when r.status <> 'pending' then null
    when exists (
      select 1 from public.messages m where m.request_id = r.id and m.sender_id <> r.tenant_id
    ) then null
    else greatest(
      0,
      3 - (select count(*) from public.messages m where m.request_id = r.id and m.sender_id = r.tenant_id)
    )::integer
  end
  from public.rental_requests r
  where r.id = p_request_id;
$$;

-- Internal: called by the functions below, which check the caller first.
revoke execute on function public.seeker_messages_left(uuid) from public, anon, authenticated;

-- Why the caller cannot write in this thread right now, or null when they can.
-- The codes are shown as translated text in the app.
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
  if v_r.status not in ('pending', 'shortlisted', 'offered', 'confirmed') then
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

revoke execute on function public.message_send_block(uuid) from public, anon, authenticated;

-- 4. send_message ---------------------------------------------------------------------------
-- Returns the new message. The body is trimmed; 1 to 1000 characters.

create or replace function public.send_message(p_request_id uuid, p_body text)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  -- Trims spaces and line breaks at both ends (trim() alone keeps line breaks).
  v_body text := regexp_replace(coalesce(p_body, ''), '^\s+|\s+$', '', 'g');
  v_block text;
  v_count integer;
  v_row public.messages%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if char_length(v_body) not between 1 and 1000 then
    raise exception 'invalid_message' using errcode = '22023';
  end if;

  -- Locked, so two messages sent at the same moment cannot both pass the
  -- seeker's limit of 3 before the landlord answers.
  perform 1 from public.rental_requests where id = p_request_id for update;
  if not found then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  v_block := public.message_send_block(p_request_id);
  if v_block is not null then
    raise exception '%', v_block
      using errcode = case when v_block in ('not_allowed', 'not_authenticated', 'banned') then '42501' else 'P0001' end;
  end if;

  select count(*) into v_count
  from public.messages
  where sender_id = v_uid and created_at > now() - interval '10 minutes';
  if v_count >= 30 then
    raise exception 'message_rate_limit' using errcode = 'P0001';
  end if;

  insert into public.messages (request_id, sender_id, body)
  values (p_request_id, v_uid, v_body)
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.send_message(uuid, text) from public, anon;
grant execute on function public.send_message(uuid, text) to authenticated;

-- 5. mark_thread_read ------------------------------------------------------------------------
-- Marks the other side's unread messages in one thread as read. Returns how
-- many changed. Suspended members can still read: reading shares nothing.

create or replace function public.mark_thread_read(p_request_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_r public.rental_requests%rowtype;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select * into v_r from public.rental_requests where id = p_request_id;
  if not found then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if v_r.tenant_id = v_uid then
    -- The seeker reads what the landlord side wrote.
    update public.messages
    set read_at = now()
    where request_id = p_request_id and read_at is null and sender_id <> v_r.tenant_id;
  elsif public.can_manage_listing(v_r.listing_id) then
    -- The landlord side reads what the seeker wrote.
    update public.messages
    set read_at = now()
    where request_id = p_request_id and read_at is null and sender_id = v_r.tenant_id;
  else
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.mark_thread_read(uuid) from public, anon;
grant execute on function public.mark_thread_read(uuid) to authenticated;

-- 6. thread_info: the thread page's header ------------------------------------------------------
-- One row for a member on the request, none for anybody else (admins
-- included). The ad may no longer be live, so the summary comes from here
-- and not from the listings policy (as in my_requests). The seeker's phone
-- is included for the landlord side once the seeker is shortlisted (plan
-- section 1.5), the same rule as the profile_private policy.

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
  my_side text,
  listing_title text,
  listing_type public.listing_type,
  listing_status public.listing_status,
  monthly_rent integer,
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
  messages_left integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with req as (
    select
      r.*,
      case
        when r.tenant_id = (select auth.uid()) then 'seeker'
        when r.listing_id in (select public.managed_listing_ids()) then 'landlord'
      end as side
    from public.rental_requests r
    where r.id = p_request_id
  )
  select
    r.id, r.listing_id, r.tenant_id, r.status, r.household_type, r.members_count, r.occupation,
    r.move_in_date, r.message, r.decline_reason, r.decline_note, r.shortlisted_at, r.closed_at,
    r.created_at,
    r.side,
    l.title, l.listing_type, l.status, l.monthly_rent, b.area_id,
    (select p.storage_path from public.listing_photos p
      where p.listing_id = l.id order by p.sort_order limit 1),
    l.posted_by, poster.full_name, poster.avatar_url, l.posted_as,
    seeker.full_name, seeker.avatar_url, seeker.created_at, seeker.is_banned,
    case
      when r.side = 'landlord' and r.status in ('shortlisted', 'offered', 'confirmed') then pp.phone
    end,
    public.message_send_block(r.id),
    case when r.side = 'seeker' then public.seeker_messages_left(r.id) end
  from req r
  join public.listings l on l.id = r.listing_id
  join public.units u on u.id = l.unit_id
  join public.buildings b on b.id = u.building_id
  join public.profiles seeker on seeker.id = r.tenant_id
  left join public.profiles poster on poster.id = l.posted_by
  left join public.profile_private pp on pp.user_id = r.tenant_id
  where r.side is not null;
$$;

revoke execute on function public.thread_info(uuid) from public, anon;
grant execute on function public.thread_info(uuid) to authenticated;

-- 7. Unread counts ------------------------------------------------------------------------------
-- "Unread" is always from the caller's side: the seeker counts the landlord
-- side's messages, the landlord side counts the seeker's.

-- One number for the menu badge.
create or replace function public.unread_message_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.rental_requests r
  join public.messages m on m.request_id = r.id and m.read_at is null
  where r.id in (select public.my_thread_ids())
    and case
      when r.tenant_id = (select auth.uid()) then m.sender_id <> r.tenant_id
      else m.sender_id = r.tenant_id
    end;
$$;

revoke execute on function public.unread_message_count() from public, anon;
grant execute on function public.unread_message_count() to authenticated;

-- Per request on one ad, for the landlord's requests page of that ad. Empty
-- for anybody who does not manage the ad.
create or replace function public.listing_thread_counts(p_listing_id uuid)
returns table (request_id uuid, message_count integer, unread_count integer, last_message_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.request_id,
    count(*)::integer,
    count(*) filter (where m.read_at is null and m.sender_id = r.tenant_id)::integer,
    max(m.created_at)
  from public.rental_requests r
  join public.messages m on m.request_id = r.id
  where r.listing_id = p_listing_id
    and (select public.can_manage_listing(p_listing_id))
  group by m.request_id;
$$;

revoke execute on function public.listing_thread_counts(uuid) from public, anon;
grant execute on function public.listing_thread_counts(uuid) to authenticated;

-- 8. message_threads: the Messages page ------------------------------------------------------------
-- Every thread of the caller with at least one message, newest first, with
-- the other side's name and the last message. On the seeker's side the
-- other side is shown as the ad's poster (caretakers who write are named in
-- the thread itself).

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
    select r.id, r.status, r.listing_id, r.tenant_id, r.tenant_id = (select auth.uid()) as as_seeker
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

revoke execute on function public.message_threads() from public, anon;
grant execute on function public.message_threads() to authenticated;

-- 9. my_requests and request_inbox (F6) now include message counts -------------------------------
-- The return types change, so the functions are dropped and created again.

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
    r.id, r.listing_id, r.status, r.household_type, r.members_count, r.occupation,
    r.move_in_date, r.message, r.decline_reason, r.decline_note, r.shortlisted_at,
    r.closed_at, r.created_at,
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

drop function if exists public.request_inbox();
create function public.request_inbox()
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
  last_request_at timestamptz,
  unread_count integer
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
    m.id, m.title, m.listing_type, m.status, m.monthly_rent, u.label, b.name, b.area_id,
    (select p.storage_path from public.listing_photos p
      where p.listing_id = m.id order by p.sort_order limit 1),
    c.pending_count, c.shortlisted_count, c.closed_count, c.last_request_at,
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

-- 10. Live updates (Supabase Realtime) ----------------------------------------------------------------
-- New messages and read marks reach the two sides without reloading. The
-- publication exists on every Supabase project; the check makes this safe
-- to run twice.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
    )
  then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;
