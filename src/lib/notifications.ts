import type { createTranslator } from "next-intl";
import { formatDateTime, formatTaka } from "@/lib/format";
import type { NotificationData, NotificationRow, NotificationType } from "@/types/database";
import type messages from "../../messages/en.json";

// F9 notifications: what each type says and where it leads. Shared by the
// notifications page (in the member's current language) and the emails (in
// the member's saved language), so both always say the same thing.

/** How many notifications one page of the list shows. */
export const NOTIFICATION_PAGE_SIZE = 30;

/** Where an older page starts: the last shown notification's time and id. */
export type NotificationCursor = { at: string; id: string };

const CURSOR_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The ?before= value of the list page: "<time>_<id>". */
export function cursorParam(c: NotificationCursor) {
  return `${c.at}_${c.id}`;
}

/** Reads ?before=; anything that is not a valid cursor means the first page. */
export function parseCursor(value: unknown): NotificationCursor | null {
  if (typeof value !== "string") return null;
  const i = value.lastIndexOf("_");
  if (i < 0) return null;
  const at = value.slice(0, i);
  const id = value.slice(i + 1);
  return CURSOR_AT.test(at) && UUID.test(id) ? { at, id } : null;
}

/** Keys under Notifications.types in messages/*.json. offer_expired has one text per side. */
export type NotificationTextKey =
  | "requestNew"
  | "requestShortlisted"
  | "requestDeclined"
  | "offerReceived"
  | "offerTakenBack"
  | "offerAccepted"
  | "offerTurnedDown"
  | "offerExpiredSeeker"
  | "offerExpiredLandlord"
  | "adApproved"
  | "adRejected"
  | "adHidden"
  | "adRestored"
  | "adExpiring"
  | "adExpired"
  | "requestExpiredSeeker"
  | "requestExpiredLandlord"
  | "caretakerInvited"
  | "caretakerJoined"
  | "caretakerDeclined"
  | "caretakerRemoved"
  | "caretakerLeft";

const TEXT_KEYS: Record<Exclude<NotificationType, "offer_expired" | "request_expired">, NotificationTextKey> = {
  request_new: "requestNew",
  request_shortlisted: "requestShortlisted",
  request_declined: "requestDeclined",
  offer_received: "offerReceived",
  offer_taken_back: "offerTakenBack",
  offer_accepted: "offerAccepted",
  offer_turned_down: "offerTurnedDown",
  ad_approved: "adApproved",
  ad_rejected: "adRejected",
  ad_hidden: "adHidden",
  ad_restored: "adRestored",
  ad_expiring: "adExpiring",
  ad_expired: "adExpired",
  caretaker_invited: "caretakerInvited",
  caretaker_joined: "caretakerJoined",
  caretaker_declined: "caretakerDeclined",
  caretaker_removed: "caretakerRemoved",
  caretaker_left: "caretakerLeft",
};

export function notificationTextKey(type: NotificationType, data: NotificationData): NotificationTextKey {
  if (type === "offer_expired") return data.side === "landlord" ? "offerExpiredLandlord" : "offerExpiredSeeker";
  if (type === "request_expired") return data.side === "landlord" ? "requestExpiredLandlord" : "requestExpiredSeeker";
  return TEXT_KEYS[type];
}

/**
 * request: the request's page; ad: the public ad page; myAds: the poster's
 * ads (with the reason, or the Renew button); properties: My properties or
 * one building's page (F10 caretakers).
 */
export type NotificationTargetKind = "request" | "ad" | "myAds" | "properties";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Where opening a notification leads (a path without the language prefix). */
export function notificationTarget(
  n: Pick<NotificationRow, "type" | "request_id" | "listing_id"> & { data?: NotificationData | null },
): { href: string; kind: NotificationTargetKind } {
  if (n.request_id) return { href: `/dashboard/requests/${n.request_id}`, kind: "request" };
  if ((n.type === "ad_approved" || n.type === "ad_restored") && n.listing_id) {
    return { href: `/ads/${n.listing_id}`, kind: "ad" };
  }
  if (n.type.startsWith("caretaker_")) {
    const building = n.data?.building_id;
    // The invited member and a removed caretaker cannot open the building's page.
    if (building && UUID_RE.test(building) && n.type !== "caretaker_invited" && n.type !== "caretaker_removed") {
      return { href: `/dashboard/properties/${building}`, kind: "properties" };
    }
    return { href: "/dashboard/properties", kind: "properties" };
  }
  return { href: "/dashboard/ads", kind: "myAds" };
}

/**
 * The values the type's body text needs. The decline reason and household
 * labels come translated from the Enums namespace, so the whole sentence is
 * in one language.
 */
export function notificationValues(
  data: NotificationData,
  locale: string,
  labels: { reason?: string; household?: string; member: string },
): Record<string, string | number> {
  return {
    name: data.member_name?.trim() || labels.member,
    members: data.members_count ?? 1,
    household: labels.household ?? "",
    rent: typeof data.rent === "number" ? formatTaka(data.rent, locale) : "",
    deadline: data.expires_at ? formatDateTime(data.expires_at, locale) : "",
    reason: labels.reason ?? "",
  };
}

type Messages = typeof messages;
/** The same type getTranslations("Notifications") returns, and createTranslator for emails. */
export type NotificationsTranslator = ReturnType<typeof createTranslator<Messages, "Notifications">>;
export type EnumsTranslator = ReturnType<typeof createTranslator<Messages, "Enums">>;

export type NotificationText = {
  /** A short headline (also the email subject). */
  title: string;
  /** One or two sentences in the same language. */
  body: string;
  /** The ad's own title as the poster typed it (any language), shown on its own line. */
  adTitle: string;
};

/** A notification's text in one language. */
export function describeNotification(
  n: Pick<NotificationRow, "type" | "data">,
  locale: string,
  t: NotificationsTranslator,
  tEnum: EnumsTranslator,
): NotificationText {
  const data = n.data ?? {};
  const key = notificationTextKey(n.type, data);
  const values = notificationValues(data, locale, {
    reason: data.reason ? tEnum(`declineReason.${data.reason}`) : undefined,
    household: data.household_type ? tEnum(`householdType.${data.household_type}`) : undefined,
    member: t("member"),
  });
  return {
    title: t(`types.${key}.title`),
    body: t(`types.${key}.body`, values),
    adTitle: data.title?.trim() || (data.listing_type ? tEnum(`listingType.${data.listing_type}`) : ""),
  };
}
