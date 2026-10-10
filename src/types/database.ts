// Database types for the tables created so far.
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
    };
    Views: { [_ in never]: never };
    Functions: {
      save_building: { Args: { p_building_id: string | null; p_data: Json }; Returns: string };
      create_listing_draft: { Args: { p_unit_id: string }; Returns: string };
      submit_listing: { Args: { p_listing_id: string }; Returns: undefined };
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
    };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Profile = ProfileRow;
export type ProfilePrivate = Database["public"]["Tables"]["profile_private"]["Row"];
export type Area = Database["public"]["Tables"]["areas"]["Row"];
