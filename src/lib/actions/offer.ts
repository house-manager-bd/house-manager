"use server";

import { revalidatePath } from "next/cache";
import { decryptNid, encryptNid, nidKeyReady } from "@/lib/crypto/nid";
import { createClient } from "@/lib/supabase/server";
import {
  acceptOfferSchema,
  makeOfferSchema,
  TENANT_DOCS_BUCKET,
  type AcceptOfferInput,
  type MakeOfferInput,
} from "@/lib/validation/offer";
import { requestIdSchema } from "@/lib/validation/request";
import { dbErrorKey, fromZodError, type ActionResult, type ErrorKey } from "./result";

// F8 offer and confirm. Each action checks the input with the shared schema,
// then calls one database function, which checks the caller, the status and
// the limits again in one transaction.

function offerErrorKey(error: { code?: string; message?: string } | null): ErrorKey {
  if (error?.message === "wrong_status") return "requestChanged";
  if (error?.message === "not_authenticated") return "loginRequired";
  return dbErrorKey(error);
}

/** The landlord side offers the place to a shortlisted member for 48 hours (FR26). */
export async function makeOffer(input: MakeOfferInput): Promise<ActionResult<{ expiresAt: string }>> {
  const parsed = makeOfferSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("make_offer", {
    p_request_id: v.requestId,
    p_monthly_rent: v.monthlyRent,
    p_advance: v.advance,
    p_start_date: v.startDate,
    p_note: v.note ?? null,
  });
  if (error || !data) return { ok: false, error: offerErrorKey(error) };
  revalidatePath("/[locale]", "layout");
  return { ok: true, data: { expiresAt: data } };
}

/**
 * The seeker accepts an offer (FR27, FR28). The browser has already uploaded
 * the photo to the private bucket; the NID number is encrypted here, on the
 * server, and only its last 4 digits are saved in plain text. The database
 * then creates the tenancy in one transaction. If anything fails, the
 * uploaded photo is deleted again.
 */
export async function acceptOffer(input: AcceptOfferInput): Promise<ActionResult<{ tenancyId: string }>> {
  const supabase = await createClient();
  const removePhoto = async () => {
    if (typeof input.photoPath === "string" && input.photoPath) {
      await supabase.storage.from(TENANT_DOCS_BUCKET).remove([input.photoPath]);
    }
  };

  const parsed = acceptOfferSchema.safeParse(input);
  if (!parsed.success) {
    await removePhoto();
    return fromZodError(parsed.error);
  }
  const v = parsed.data;

  const { data: auth } = await supabase.auth.getClaims();
  const uid = auth?.claims?.sub;
  if (!uid) return { ok: false, error: "loginRequired" };
  if (!v.photoPath.startsWith(`${uid}/${v.requestId}/`)) {
    await removePhoto();
    return { ok: false, error: "photoMissing" };
  }
  if (!nidKeyReady()) {
    console.error("F8: NID_ENCRYPTION_KEY is missing or invalid; see docs/SETUP.md section 8.7");
    await removePhoto();
    return { ok: false, error: "nidNotReady" };
  }

  const { data, error } = await supabase.rpc("accept_offer", {
    p_request_id: v.requestId,
    p_nid_encrypted: encryptNid(v.nid, v.requestId, uid),
    p_nid_last4: v.nid.slice(-4),
    p_photo_path: v.photoPath,
    p_permanent_address: v.permanentAddress,
    p_consent: v.consent,
  });
  if (error || !data) {
    await removePhoto();
    return { ok: false, error: offerErrorKey(error) };
  }
  revalidatePath("/[locale]", "layout");
  return { ok: true, data: { tenancyId: data } };
}

/**
 * The full NID number of a confirmed tenant, for the tenant themselves and
 * the ad's landlord side (the DMP tenant form needs it). Row Level Security
 * decides who can read the row; only the server can decrypt it.
 */
export async function revealNid(requestId: string): Promise<ActionResult<{ nid: string }>> {
  const parsed = requestIdSchema.safeParse(requestId);
  if (!parsed.success) return { ok: false, error: "generic" };

  const supabase = await createClient();
  const { data } = await supabase
    .from("tenant_verifications")
    .select("nid_encrypted, tenant_id")
    .eq("request_id", parsed.data)
    .maybeSingle();
  if (!data) return { ok: false, error: "notAllowed" };
  if (!nidKeyReady()) return { ok: false, error: "nidNotReady" };
  const nid = decryptNid(data.nid_encrypted, parsed.data, data.tenant_id);
  if (!nid) return { ok: false, error: "nidUnreadable" };
  return { ok: true, data: { nid } };
}
