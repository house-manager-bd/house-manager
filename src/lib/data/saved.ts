import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { SavedListingRow } from "@/types/database";

// F10 saved ads (FR30). Members read only their own saved rows (RLS).

/** The member's saved ads, newest saved first, with what each card may show. */
export async function getSavedListings(): Promise<SavedListingRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_saved_listings");
  return data ?? [];
}

/** Which of these ads the member has saved (for the heart buttons on a page of results). */
export async function getSavedIds(listingIds: string[]): Promise<Set<string>> {
  if (listingIds.length === 0) return new Set();
  const supabase = await createClient();
  const { data } = await supabase.from("saved_listings").select("listing_id").in("listing_id", listingIds);
  return new Set((data ?? []).map((r) => r.listing_id));
}
