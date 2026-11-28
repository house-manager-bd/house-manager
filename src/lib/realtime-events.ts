// Browser events that keep the menu badges in step (F7, F9). In their own
// file, without the Supabase client, so the header can use them without
// loading it (F12).

/** Sent by the thread after it marks messages as read, so the menu badge updates at once. */
export const MESSAGES_READ_EVENT = "hm:messages-read";

/** Sent after notifications are marked read on a page, so the bell updates at once. */
export const NOTIFICATIONS_READ_EVENT = "hm:notifications-read";
