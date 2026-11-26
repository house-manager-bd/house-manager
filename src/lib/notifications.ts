import type { createTranslator } from "next-intl";
import { formatDateTime, formatTaka, formatTime, formatVisitDay } from "@/lib/format";
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

/** Every type this version of the app can describe (TypeScript keeps the list complete). */
const KNOWN_TYPES: Record<NotificationType, true> = {
  request_new: true,
  request_shortlisted: true,
  request_declined: true,
  offer_received: true,
  offer_taken_back: true,
  offer_accepted: true,
  offer_turned_down: true,
  offer_expired: true,
  ad_approved: true,
  ad_rejected: true,
  ad_hidden: true,
  ad_restored: true,
  ad_expiring: true,
  ad_expired: true,
  request_expired: true,
  caretaker_invited: true,
  caretaker_joined: true,
  caretaker_declined: true,
  caretaker_removed: true,
  caretaker_left: true,
  viewing_booked: true,
  viewing_cancelled: true,
  viewing_reminder: true,
  viewing_slots_added: true,
};

/**
 * Whether this version of the app knows the type. Production and previews
 * share one database, so a deployment may claim an email of a type that a
 * newer feature added; it leaves that one for a newer deployment.
 */
export function isKnownNotificationType(type: string): type is NotificationType {
  return Object.prototype.hasOwnProperty.call(KNOWN_TYPES, type);
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
  | "caretakerLeft"
  | "viewingBooked"
  | "viewingMoved"
  | "viewingCancelledByMember"
  | "viewingCancelledByLandlord"
  | "viewingReminderSeeker"
  | "viewingReminderLandlord"
  | "viewingSlotsAdded";

type OneTextType = Exclude<
  NotificationType,
  "offer_expired" | "request_expired" | "viewing_booked" | "viewing_cancelled" | "viewing_reminder"
>;

const TEXT_KEYS: Record<OneTextType, NotificationTextKey> = {
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
  viewing_slots_added: "viewingSlotsAdded",
};

export function notificationTextKey(type: NotificationType, data: NotificationData): NotificationTextKey {
  if (type === "offer_expired") return data.side === "landlord" ? "offerExpiredLandlord" : "offerExpiredSeeker";
  if (type === "request_expired") return data.side === "landlord" ? "requestExpiredLandlord" : "requestExpiredSeeker";
  // F11: one text per case.
  if (type === "viewing_booked") return data.changed ? "viewingMoved" : "viewingBooked";
  if (type === "viewing_cancelled") return data.by === "landlord" ? "viewingCancelledByLandlord" : "viewingCancelledByMember";
  if (type === "viewing_reminder") return data.side === "landlord" ? "viewingReminderLandlord" : "viewingReminderSeeker";
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
    // F11: the visit's Dhaka day and times.
    day: data.starts_at ? formatVisitDay(data.starts_at, locale) : "",
    from: data.starts_at ? formatTime(data.starts_at, locale) : "",
    to: data.ends_at ? formatTime(data.ends_at, locale) : "",
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
