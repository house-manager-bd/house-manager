// Database types for the tables created so far (F1 to F7).
// Once the Supabase CLI is linked, regenerate this file with:
//   npx supabase gen types typescript --linked > src/types/database.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type AppLocale = "bn" | "en";
export type AppMode = "seek" | "host";
export type GasType = "titas_line" | "lpg" | "none";
export type ManagerRole = "owner" | "caretaker";
export type UnitKind = "flat" | "room" | "mess_room";
export type UnitStatus = "vacant" | "listed" | "occupied";
export type Furnishing = "unfurnished" | "semi_furnished" | "furnished";
export type NearbyKind = "metro" | "bus_stop" | "market" | "school" | "hospital" | "mosque" | "park";
export type ListingType = "flat" | "room" | "sublet" | "mess_seat";
export type PostedAs = "owner" | "caretaker" | "tenant_sublet";
export type ListingStatus =
  | "draft"
  | "pending_review"
  | "active"
  | "rented"
  | "expired"
  | "rejected"
  | "hidden";
export type ElectricityBilling = "prepaid" | "postpaid" | "included";
export type ReportReason =
  | "broker"
  | "fake"
  | "already_rented"
  | "wrong_info"
  | "discriminatory"
  | "offensive"
  | "other";
export type ReportStatus = "open" | "upheld" | "dismissed";
export type ModerationAction = "approve" | "reject" | "hide" | "restore" | "auto_hide" | "ban" | "unban";
/** Why an ad went to the review queue (F5). */
export type ListingFlag =
  | "new_member"
  | "was_rejected"
  | "photo_reused"
  | "phone_many_ads"
  | "phone_other_member"
  | "banned_words"
  | "phone_in_text"
  | "rent_outlier";
/** Plan section 1.4. offered and confirmed come with F8. */
export type RequestStatus =
  | "pending"
  | "shortlisted"
  | "offered"
  | "confirmed"
  | "declined"
  | "withdrawn"
  | "expired";
export type HouseholdType = "family" | "bachelor_male" | "bachelor_female";
/** filled is also used by F8 when the place goes to someone else. */
export type DeclineReason = "filled" | "household" | "move_in" | "other";
export type WaterBilling = "included" | "tenant_pays";
export type GasBilling = "included" | "tenant_pays";

export type HouseRules = {
  pets?: boolean;
  smoking?: boolean;
  guests_overnight?: boolean;
  gate_closing_time?: string | null;
  rooftop_use?: boolean;
  notes?: string | null;
};

type LocationRow = { id: number; name_en: string; name_bn: string };

type Table<Row, Insert = never, Update = never> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type ProfileRow = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  preferred_locale: AppLocale;
  default_mode: AppMode | null;
  is_admin: boolean;
  trust_level: number;
  is_banned: boolean;
  created_at: string;
  updated_at: string;
};

export type BuildingRow = {
  id: string;
  created_by: string;
  owner_id: string | null;
  name: string;
  area_id: number;
  landmark: string | null;
  approx_lat: number;
  approx_lng: number;
  total_floors: number | null;
  gas: GasType;
  amenities: string[];
  house_rules: HouseRules;
  created_at: string;
  updated_at: string;
};

export type BuildingPrivateRow = {
  building_id: string;
  road_address: string;
  house_no: string | null;
  exact_lat: number;
  exact_lng: number;
  offset_lat: number;
  offset_lng: number;
};

export type UnitRow = {
  id: string;
  building_id: string;
  label: string;
  unit_kind: UnitKind;
  floor_no: number | null;
  size_sqft: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  balconies: number | null;
  facing: string | null;
  furnishing: Furnishing;
  capacity: number;
  status: UnitStatus;
  created_at: string;
  updated_at: string;
};

type UnitEditable = Partial<
  Pick<
    UnitRow,
    | "label"
    | "unit_kind"
    | "floor_no"
    | "size_sqft"
    | "bedrooms"
    | "bathrooms"
    | "balconies"
    | "facing"
    | "furnishing"
    | "capacity"
  >
>;

export type ListingRow = {
  id: string;
  unit_id: string;
  posted_by: string;
  posted_as: PostedAs;
  owner_name: string | null;
  sublet_consent: boolean;
  listing_type: ListingType;
  tenant_types: string[];
  title: string | null;
  description: string | null;
  open_slots: number;
  max_occupants: number | null;
  monthly_rent: number | null;
  rent_negotiable: boolean;
  advance_months: number | null;
  service_charge: number | null;
  electricity: ElectricityBilling | null;
  water: WaterBilling | null;
  gas_bill: GasBilling | null;
  other_charges: string | null;
  extra_rules: string | null;
  agreement_required: boolean;
  dmp_form_required: boolean;
  available_from: string | null;
  status: ListingStatus;
  rejection_reason: string | null;
  published_at: string | null;
  expires_at: string | null;
  is_featured: boolean;
  featured_until: string | null;
  view_count: number;
  /** Title and description in compact form for keyword search (F4). Filled by the database. */
  search_text: string;
  /** When the ad was last sent in, to go live or to the review queue (F5). */
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ListingEditable = Partial<
  Pick<
    ListingRow,
    | "owner_name"
    | "sublet_consent"
    | "listing_type"
    | "tenant_types"
    | "title"
    | "description"
    | "open_slots"
    | "max_occupants"
    | "monthly_rent"
    | "rent_negotiable"
    | "advance_months"
    | "service_charge"
    | "electricity"
    | "water"
    | "gas_bill"
    | "other_charges"
    | "extra_rules"
    | "agreement_required"
    | "available_from"
  >
>;

export type ListingPhotoRow = {
  id: string;
  listing_id: string;
  storage_path: string;
  sort_order: number;
  is_cover: boolean;
  width: number | null;
  height: number | null;
  content_hash: string | null;
  created_at: string;
};

export type ReportRow = {
  id: string;
  listing_id: string;
  reporter_id: string;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
};

export type ModerationActionRow = {
  id: string;
  admin_id: string | null;
  listing_id: string | null;
  user_id: string | null;
  action: ModerationAction;
  note: string | null;
  created_at: string;
};

export type ListingFlagRow = {
  listing_id: string;
  flag: ListingFlag;
  detail: { [key: string]: Json | undefined };
  created_at: string;
};

/** One row of public.admin_list_users() (admins only). */
export type AdminUserRow = {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  trust_level: number;
  is_admin: boolean;
  is_banned: boolean;
  live_ads: number;
  total_ads: number;
  upheld_reports: number;
  total_count: number;
};

export type RentalRequestRow = {
  id: string;
  listing_id: string;
  tenant_id: string;
  status: RequestStatus;
  household_type: HouseholdType;
  members_count: number;
  occupation: string;
  move_in_date: string;
  message: string | null;
  offer_expires_at: string | null;
  decline_reason: DeclineReason | null;
  decline_note: string | null;
  shortlisted_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

/** One row of public.my_requests(): the seeker's request with a summary of the ad (F6). */
export type MyRequestRow = Pick<
  RentalRequestRow,
  | "id"
  | "listing_id"
  | "status"
  | "household_type"
  | "members_count"
  | "occupation"
  | "move_in_date"
  | "message"
  | "decline_reason"
  | "decline_note"
  | "shortlisted_at"
  | "closed_at"
  | "created_at"
> & {
  listing_title: string | null;
  listing_type: ListingType;
  listing_status: ListingStatus;
  monthly_rent: number | null;
  area_id: number;
  landmark: string | null;
  cover_path: string | null;
  poster_name: string | null;
  posted_as: PostedAs;
  /** F7: messages on this request, and how many the seeker has not read. */
  message_count: number;
  unread_count: number;
};

/** One row of public.request_inbox(): an ad the landlord manages, with request counts (F6). */
export type InboxRow = {
  listing_id: string;
  listing_title: string | null;
  listing_type: ListingType;
  listing_status: ListingStatus;
  monthly_rent: number | null;
  unit_label: string;
  building_name: string;
  area_id: number;
  cover_path: string | null;
  pending_count: number;
  shortlisted_count: number;
  closed_count: number;
  last_request_at: string;
  /** F7: seekers' messages on this ad's requests that nobody on the landlord side has read. */
  unread_count: number;
};

/** Which side of a request the signed-in member is on (F7). */
export type ThreadSide = "seeker" | "landlord";

/** Why a member cannot write in a thread right now (public.message_send_block, F7). */
export type MessageSendBlock =
  | "not_authenticated"
  | "not_allowed"
  | "banned"
  | "thread_closed"
  | "thread_paused"
  | "member_banned"
  | "wait_for_reply";

export type MessageRow = {
  id: string;
  request_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

/** One row of public.thread_info(): the thread page's header (F7). */
export type ThreadInfoRow = Pick<
  RentalRequestRow,
  | "id"
  | "listing_id"
  | "tenant_id"
  | "status"
  | "household_type"
  | "members_count"
  | "occupation"
  | "move_in_date"
  | "message"
  | "decline_reason"
  | "decline_note"
  | "shortlisted_at"
  | "closed_at"
  | "created_at"
> & {
  my_side: ThreadSide;
  listing_title: string | null;
  listing_type: ListingType;
  listing_status: ListingStatus;
  monthly_rent: number | null;
  area_id: number;
  cover_path: string | null;
  poster_id: string | null;
  poster_name: string | null;
  poster_avatar: string | null;
  posted_as: PostedAs;
  seeker_name: string;
  seeker_avatar: string | null;
  seeker_since: string;
  seeker_banned: boolean;
  /** Only for the landlord side, once the seeker is shortlisted. */
  seeker_phone: string | null;
  send_block: MessageSendBlock | null;
  /** The seeker's messages left before the landlord side answers; null when there is no limit. */
  messages_left: number | null;
};

/** One row of public.message_threads(): the Messages page (F7). */
export type MessageThreadRow = {
  request_id: string;
  my_side: ThreadSide;
  request_status: RequestStatus;
  listing_id: string;
  listing_title: string | null;
  listing_type: ListingType;
  listing_status: ListingStatus;
  other_name: string | null;
  other_avatar: string | null;
  last_body: string;
  last_from_me: boolean;
  last_at: string;
  unread_count: number;
};

/** One row of public.listing_thread_counts() (F7). */
export type ThreadCountRow = {
  request_id: string;
  message_count: number;
  unread_count: number;
  last_message_at: string;
};

/** One row of public.search_listings(): only what a visitor may see. */
export type SearchListingRow = {
  id: string;
  title: string | null;
  listing_type: ListingType;
  tenant_types: string[];
  monthly_rent: number | null;
  rent_negotiable: boolean;
  open_slots: number;
  available_from: string | null;
  published_at: string | null;
  area_id: number;
  landmark: string | null;
  approx_lat: number;
  approx_lng: number;
  gas: GasType;
  amenities: string[];
  unit_kind: UnitKind;
  bedrooms: number | null;
  bathrooms: number | null;
  size_sqft: number | null;
  furnishing: Furnishing;
  cover_path: string | null;
  photo_count: number;
  total_count: number;
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<
        ProfileRow,
        never,
        {
          full_name?: string;
          avatar_url?: string | null;
          preferred_locale?: AppLocale;
          default_mode?: AppMode | null;
        }
      >;
      profile_private: Table<
        { user_id: string; phone: string | null; phone_verified: boolean; updated_at: string },
        never,
        { phone?: string | null }
      >;
      divisions: Table<LocationRow>;
      districts: Table<LocationRow & { division_id: number }>;
      thanas: Table<LocationRow & { district_id: number }>;
      areas: Table<LocationRow & { thana_id: number; center_lat: number; center_lng: number }>;
      buildings: Table<BuildingRow>;
      building_private: Table<BuildingPrivateRow>;
      building_managers: Table<{
        building_id: string;
        user_id: string;
        role: ManagerRole;
        added_by: string | null;
        created_at: string;
      }>;
      nearby_places: Table<{
        id: string;
        building_id: string;
        kind: NearbyKind;
        name: string;
        walk_minutes: number | null;
      }>;
      units: Table<
        UnitRow,
        UnitEditable & { building_id: string; label: string; unit_kind: UnitKind },
        UnitEditable
      >;
      listings: Table<ListingRow, never, ListingEditable>;
      listing_private: Table<
        { listing_id: string; contact_phone: string | null; whatsapp: string | null },
        never,
        { contact_phone?: string | null; whatsapp?: string | null }
      >;
      listing_photos: Table<ListingPhotoRow>;
      contact_reveals: Table<{ id: string; user_id: string; listing_id: string; created_at: string }>;
      listing_flags: Table<ListingFlagRow>;
      reports: Table<ReportRow>;
      moderation_actions: Table<ModerationActionRow>;
      moderation_words: Table<{ word: string; created_at: string }>;
      rental_requests: Table<RentalRequestRow>;
      messages: Table<MessageRow>;
    };
    Views: { [_ in never]: never };
    Functions: {
      save_building: { Args: { p_building_id: string | null; p_data: Json }; Returns: string };
      create_listing_draft: { Args: { p_unit_id: string }; Returns: string };
      /** Returns the new status: "active", or "pending_review" for the review queue (F5). */
      submit_listing: { Args: { p_listing_id: string }; Returns: ListingStatus };
      reopen_listing: { Args: { p_listing_id: string }; Returns: undefined };
      report_listing: {
        Args: { p_listing_id: string; p_reason: ReportReason; p_details?: string | null };
        Returns: undefined;
      };
      moderate_listing: {
        Args: { p_listing_id: string; p_action: ModerationAction; p_note?: string | null };
        Returns: ListingStatus;
      };
      set_user_ban: { Args: { p_user_id: string; p_banned: boolean; p_note?: string | null }; Returns: undefined };
      admin_list_users: {
        Args: { p_q?: string | null; p_filter?: string | null; p_limit?: number; p_offset?: number };
        Returns: AdminUserRow[];
      };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      /** F6: the ad's poster or a manager of its building. */
      can_manage_listing: { Args: { p_listing_id: string }; Returns: boolean };
      send_request: {
        Args: {
          p_listing_id: string;
          p_household_type: HouseholdType;
          p_members_count: number;
          p_occupation: string;
          p_move_in_date: string;
          p_message?: string | null;
        };
        Returns: string;
      };
      shortlist_request: { Args: { p_request_id: string }; Returns: undefined };
      decline_request: {
        Args: { p_request_id: string; p_reason: DeclineReason; p_note?: string | null };
        Returns: undefined;
      };
      withdraw_request: { Args: { p_request_id: string }; Returns: undefined };
      my_requests: { Args: Record<string, never>; Returns: MyRequestRow[] };
      request_inbox: { Args: Record<string, never>; Returns: InboxRow[] };
      /** F7 message threads. */
      send_message: { Args: { p_request_id: string; p_body: string }; Returns: MessageRow };
      mark_thread_read: { Args: { p_request_id: string }; Returns: number };
      thread_info: { Args: { p_request_id: string }; Returns: ThreadInfoRow[] };
      unread_message_count: { Args: Record<string, never>; Returns: number };
      listing_thread_counts: { Args: { p_listing_id: string }; Returns: ThreadCountRow[] };
      message_threads: { Args: Record<string, never>; Returns: MessageThreadRow[] };
      can_manage_building: { Args: { p_building_id: string }; Returns: boolean };
      add_listing_photo: {
        Args: { p_listing_id: string; p_path: string; p_width: number; p_height: number; p_hash: string };
        Returns: string;
      };
      remove_listing_photo: { Args: { p_photo_id: string }; Returns: string };
      reorder_listing_photos: { Args: { p_listing_id: string; p_photo_ids: string[] }; Returns: undefined };
      reveal_contact: {
        Args: { p_listing_id: string };
        Returns: { contact_phone: string | null; whatsapp: string | null; remaining: number }[];
      };
      search_listings: {
        Args: {
          p_q?: string | null;
          p_area_ids?: number[] | null;
          p_types?: string[] | null;
          p_tenant_types?: string[] | null;
          p_rent_min?: number | null;
          p_rent_max?: number | null;
          p_bedrooms_min?: number | null;
          p_amenities?: string[] | null;
          p_gas?: string | null;
          p_available_by?: string | null;
          p_bounds?: number[] | null;
          p_sort?: string;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: SearchListingRow[];
      };
    };
    Enums: {
      app_locale: AppLocale;
      app_mode: AppMode;
      report_reason: ReportReason;
      report_status: ReportStatus;
      moderation_action: ModerationAction;
      request_status: RequestStatus;
      household_type: HouseholdType;
      decline_reason: DeclineReason;
    };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Profile = ProfileRow;
export type ProfilePrivate = Database["public"]["Tables"]["profile_private"]["Row"];
export type Area = Database["public"]["Tables"]["areas"]["Row"];
