"use client";

import { useEffect } from "react";
import { markRequestNotificationsRead } from "@/lib/actions/notification";
import { NOTIFICATIONS_READ_EVENT } from "@/lib/realtime";

/**
 * Opening a request's page reads its news, so its notifications are marked
 * read (F9), and the bell updates at once. The page renders this only when
 * such notifications are unread; `newest` (the newest one's time) makes it
 * run again when another arrives while the page is open. Renders nothing.
 */
export function MarkRequestNotificationsRead({ requestId, newest }: { requestId: string; newest: string }) {
  useEffect(() => {
    let cancelled = false;
    void markRequestNotificationsRead(requestId).then((result) => {
      if (!cancelled && result.ok) window.dispatchEvent(new Event(NOTIFICATIONS_READ_EVENT));
    });
    return () => {
      cancelled = true;
    };
  }, [requestId, newest]);

  return null;
}
