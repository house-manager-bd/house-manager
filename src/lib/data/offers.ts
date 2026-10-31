import "server-only";
import { createClient } from "@/lib/supabase/server";
import { TENANT_DOCS_BUCKET } from "@/lib/validation/offer";
import type { TenancyRow, TenantVerificationRow } from "@/types/database";

// F8 loaders. They run as the signed-in member; Row Level Security lets only
// the tenant and the ad's landlord side read the verification and its photo.

/** How long the link to the tenant's photo works. */
const PHOTO_LINK_SECONDS = 10 * 60;

export type TenantDetails = {
  tenancy: TenancyRow | null;
  verification: Pick<TenantVerificationRow, "nid_last4" | "permanent_address" | "consent_at"> | null;
  /** A short-lived signed link to the photo in the private bucket. */
  photoUrl: string | null;
};

/** The tenancy and the shared details of a confirmed request. */
export async function getTenantDetails(requestId: string): Promise<TenantDetails> {
  const supabase = await createClient();
  const [{ data: tenancy }, { data: verification }] = await Promise.all([
    supabase.from("tenancies").select("*").eq("request_id", requestId).maybeSingle(),
    supabase
      .from("tenant_verifications")
      .select("nid_last4, permanent_address, consent_at, photo_path")
      .eq("request_id", requestId)
      .maybeSingle(),
  ]);

  let photoUrl: string | null = null;
  if (verification?.photo_path) {
    const { data } = await supabase.storage
      .from(TENANT_DOCS_BUCKET)
      .createSignedUrl(verification.photo_path, PHOTO_LINK_SECONDS);
    photoUrl = data?.signedUrl ?? null;
  }

  return {
    tenancy: tenancy ?? null,
    verification: verification
      ? {
          nid_last4: verification.nid_last4,
          permanent_address: verification.permanent_address,
          consent_at: verification.consent_at,
        }
      : null,
    photoUrl,
  };
}
