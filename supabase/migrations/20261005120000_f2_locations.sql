-- F2: location tables and seed data
-- All of Bangladesh at division and district level. Thanas and areas are
-- seeded for Mirpur only (plan section 1.1). More areas can be added later
-- with the same id scheme:
--   divisions 1..8, districts 101.., thanas 1001.., areas 10001..
--
-- Area centre points are approximate. They only decide where the map starts
-- when a landlord places a building pin, so a few hundred metres off is fine.
-- Thana and area lists should still be checked against the current DMP list
-- (open question in PROJECT_PLAN.md).

create table public.divisions (
  id integer primary key,
  name_en text not null unique,
  name_bn text not null unique
);

create table public.districts (
  id integer primary key,
  division_id integer not null references public.divisions (id),
  name_en text not null unique,
  name_bn text not null unique
);

create table public.thanas (
  id integer primary key,
  district_id integer not null references public.districts (id),
  name_en text not null,
  name_bn text not null,
  unique (district_id, name_en)
);

create table public.areas (
  id integer primary key,
  thana_id integer not null references public.thanas (id),
  name_en text not null,
  name_bn text not null,
  center_lat numeric(9, 6) not null check (center_lat between 20.5 and 26.7),
  center_lng numeric(9, 6) not null check (center_lng between 88.0 and 92.7),
  unique (thana_id, name_en)
);

create index districts_division_idx on public.districts (division_id);
create index thanas_district_idx on public.thanas (district_id);
create index areas_thana_idx on public.areas (thana_id);

-- Reference data: everyone can read it, nobody can change it from the app.
alter table public.divisions enable row level security;
alter table public.districts enable row level security;
alter table public.thanas enable row level security;
alter table public.areas enable row level security;

create policy "divisions are public" on public.divisions
  for select to anon, authenticated using (true);
create policy "districts are public" on public.districts
  for select to anon, authenticated using (true);
create policy "thanas are public" on public.thanas
  for select to anon, authenticated using (true);
create policy "areas are public" on public.areas
  for select to anon, authenticated using (true);

revoke insert, update, delete on public.divisions, public.districts, public.thanas, public.areas
  from anon, authenticated;

-- Divisions ---------------------------------------------------------------

insert into public.divisions (id, name_en, name_bn) values
  (1, 'Barishal', 'বরিশাল'),
  (2, 'Chattogram', 'চট্টগ্রাম'),
  (3, 'Dhaka', 'ঢাকা'),
  (4, 'Khulna', 'খুলনা'),
  (5, 'Mymensingh', 'ময়মনসিংহ'),
  (6, 'Rajshahi', 'রাজশাহী'),
  (7, 'Rangpur', 'রংপুর'),
  (8, 'Sylhet', 'সিলেট');

-- Districts (64) ------------------------------------------------------------

insert into public.districts (id, division_id, name_en, name_bn) values
  -- Barishal
  (101, 1, 'Barguna', 'বরগুনা'),
  (102, 1, 'Barishal', 'বরিশাল'),
  (103, 1, 'Bhola', 'ভোলা'),
  (104, 1, 'Jhalokati', 'ঝালকাঠি'),
  (105, 1, 'Patuakhali', 'পটুয়াখালী'),
  (106, 1, 'Pirojpur', 'পিরোজপুর'),
  -- Chattogram
  (201, 2, 'Bandarban', 'বান্দরবান'),
  (202, 2, 'Brahmanbaria', 'ব্রাহ্মণবাড়িয়া'),
  (203, 2, 'Chandpur', 'চাঁদপুর'),
  (204, 2, 'Chattogram', 'চট্টগ্রাম'),
  (205, 2, 'Cumilla', 'কুমিল্লা'),
  (206, 2, 'Cox''s Bazar', 'কক্সবাজার'),
  (207, 2, 'Feni', 'ফেনী'),
  (208, 2, 'Khagrachhari', 'খাগড়াছড়ি'),
  (209, 2, 'Lakshmipur', 'লক্ষ্মীপুর'),
  (210, 2, 'Noakhali', 'নোয়াখালী'),
  (211, 2, 'Rangamati', 'রাঙ্গামাটি'),
  -- Dhaka
  (301, 3, 'Dhaka', 'ঢাকা'),
  (302, 3, 'Faridpur', 'ফরিদপুর'),
  (303, 3, 'Gazipur', 'গাজীপুর'),
  (304, 3, 'Gopalganj', 'গোপালগঞ্জ'),
  (305, 3, 'Kishoreganj', 'কিশোরগঞ্জ'),
  (306, 3, 'Madaripur', 'মাদারীপুর'),
  (307, 3, 'Manikganj', 'মানিকগঞ্জ'),
  (308, 3, 'Munshiganj', 'মুন্সীগঞ্জ'),
  (309, 3, 'Narayanganj', 'নারায়ণগঞ্জ'),
  (310, 3, 'Narsingdi', 'নরসিংদী'),
  (311, 3, 'Rajbari', 'রাজবাড়ী'),
  (312, 3, 'Shariatpur', 'শরীয়তপুর'),
  (313, 3, 'Tangail', 'টাঙ্গাইল'),
  -- Khulna
  (401, 4, 'Bagerhat', 'বাগেরহাট'),
  (402, 4, 'Chuadanga', 'চুয়াডাঙ্গা'),
  (403, 4, 'Jashore', 'যশোর'),
  (404, 4, 'Jhenaidah', 'ঝিনাইদহ'),
  (405, 4, 'Khulna', 'খুলনা'),
  (406, 4, 'Kushtia', 'কুষ্টিয়া'),
  (407, 4, 'Magura', 'মাগুরা'),
  (408, 4, 'Meherpur', 'মেহেরপুর'),
  (409, 4, 'Narail', 'নড়াইল'),
  (410, 4, 'Satkhira', 'সাতক্ষীরা'),
  -- Mymensingh
  (501, 5, 'Jamalpur', 'জামালপুর'),
  (502, 5, 'Mymensingh', 'ময়মনসিংহ'),
  (503, 5, 'Netrokona', 'নেত্রকোণা'),
  (504, 5, 'Sherpur', 'শেরপুর'),
  -- Rajshahi
  (601, 6, 'Bogura', 'বগুড়া'),
  (602, 6, 'Chapai Nawabganj', 'চাঁপাইনবাবগঞ্জ'),
  (603, 6, 'Joypurhat', 'জয়পুরহাট'),
  (604, 6, 'Naogaon', 'নওগাঁ'),
  (605, 6, 'Natore', 'নাটোর'),
  (606, 6, 'Pabna', 'পাবনা'),
  (607, 6, 'Rajshahi', 'রাজশাহী'),
  (608, 6, 'Sirajganj', 'সিরাজগঞ্জ'),
  -- Rangpur
  (701, 7, 'Dinajpur', 'দিনাজপুর'),
  (702, 7, 'Gaibandha', 'গাইবান্ধা'),
  (703, 7, 'Kurigram', 'কুড়িগ্রাম'),
  (704, 7, 'Lalmonirhat', 'লালমনিরহাট'),
  (705, 7, 'Nilphamari', 'নীলফামারী'),
  (706, 7, 'Panchagarh', 'পঞ্চগড়'),
  (707, 7, 'Rangpur', 'রংপুর'),
  (708, 7, 'Thakurgaon', 'ঠাকুরগাঁও'),
  -- Sylhet
  (801, 8, 'Habiganj', 'হবিগঞ্জ'),
  (802, 8, 'Moulvibazar', 'মৌলভীবাজার'),
  (803, 8, 'Sunamganj', 'সুনামগঞ্জ'),
  (804, 8, 'Sylhet', 'সিলেট');

-- Thanas: Mirpur (DMP Mirpur Division), all in Dhaka district ---------------

insert into public.thanas (id, district_id, name_en, name_bn) values
  (1001, 301, 'Mirpur Model', 'মিরপুর মডেল'),
  (1002, 301, 'Pallabi', 'পল্লবী'),
  (1003, 301, 'Kafrul', 'কাফরুল'),
  (1004, 301, 'Shah Ali', 'শাহ আলী'),
  (1005, 301, 'Rupnagar', 'রূপনগর'),
  (1006, 301, 'Darus Salam', 'দারুস সালাম'),
  (1007, 301, 'Bhashantek', 'ভাষানটেক');

-- Areas ------------------------------------------------------------------------

insert into public.areas (id, thana_id, name_en, name_bn, center_lat, center_lng) values
  -- Mirpur Model
  (10001, 1001, 'Mirpur 2', 'মিরপুর ২', 23.806300, 90.362500),
  (10002, 1001, 'Mirpur 10', 'মিরপুর ১০', 23.806900, 90.368600),
  (10003, 1001, 'Senpara Parbata', 'সেনপাড়া পর্বতা', 23.801600, 90.371300),
  (10004, 1001, 'Kazipara', 'কাজীপাড়া', 23.796900, 90.372900),
  (10005, 1001, 'Shewrapara', 'শেওড়াপাড়া', 23.790300, 90.375900),
  (10006, 1001, 'Pirerbag', 'পীরেরবাগ', 23.792000, 90.365500),
  (10007, 1001, 'Monipur', 'মণিপুর', 23.799000, 90.360500),
  -- Pallabi
  (10008, 1002, 'Mirpur 6', 'মিরপুর ৬', 23.815000, 90.362000),
  (10009, 1002, 'Mirpur 7', 'মিরপুর ৭', 23.819500, 90.357500),
  (10010, 1002, 'Mirpur 11', 'মিরপুর ১১', 23.819000, 90.366000),
  (10011, 1002, 'Mirpur 12', 'মিরপুর ১২', 23.828000, 90.364000),
  (10012, 1002, 'Pallabi', 'পল্লবী', 23.825800, 90.364700),
  (10013, 1002, 'Mirpur DOHS', 'মিরপুর ডিওএইচএস', 23.836500, 90.368500),
  (10014, 1002, 'Kalshi', 'কালশী', 23.822200, 90.380800),
  -- Kafrul
  (10015, 1003, 'Mirpur 13', 'মিরপুর ১৩', 23.804000, 90.377500),
  (10016, 1003, 'Kafrul', 'কাফরুল', 23.787000, 90.388000),
  (10017, 1003, 'Ibrahimpur', 'ইব্রাহিমপুর', 23.793000, 90.384000),
  -- Shah Ali
  (10018, 1004, 'Mirpur 1', 'মিরপুর ১', 23.795700, 90.353700),
  -- Rupnagar
  (10019, 1005, 'Rupnagar', 'রূপনগর', 23.820500, 90.351000),
  -- Darus Salam
  (10020, 1006, 'Darus Salam', 'দারুস সালাম', 23.783500, 90.349500),
  -- Bhashantek
  (10021, 1007, 'Mirpur 14', 'মিরপুর ১৪', 23.800000, 90.383500),
  (10022, 1007, 'Bhashantek', 'ভাষানটেক', 23.807500, 90.389500);
