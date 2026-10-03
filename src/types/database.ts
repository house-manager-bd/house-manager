// Database types for the tables created so far.
// Once the Supabase CLI is linked, regenerate this file with:
//   npx supabase gen types typescript --linked > src/types/database.ts

export type AppLocale = "bn" | "en";
export type AppMode = "seek" | "host";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
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
        Insert: never;
        Update: {
          full_name?: string;
          avatar_url?: string | null;
          preferred_locale?: AppLocale;
          default_mode?: AppMode | null;
        };
        Relationships: [];
      };
      profile_private: {
        Row: {
          user_id: string;
          phone: string | null;
          phone_verified: boolean;
          updated_at: string;
        };
        Insert: never;
        Update: {
          phone?: string | null;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: {
      app_locale: AppLocale;
      app_mode: AppMode;
    };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type ProfilePrivate = Database["public"]["Tables"]["profile_private"]["Row"];
