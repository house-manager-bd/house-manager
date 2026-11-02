"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { watchMessages, watchNotifications, watchRequests } from "@/lib/realtime";

/**
 * Reloads the page's data when a message arrives or is read in one of the
 * member's threads (F7), so lists and unread counts stay current without a
 * manual reload. With `requests`, also when one of the member's requests
 * changes: a new request, an offer, an acceptance, a decline (F8). With
 * `requestId`, only that request's changes are watched. With
 * `notificationsFor` (the member's id), when one of their notifications
 * arrives or is read (F9). Renders nothing.
 */
export function LiveRefresh({
  messages = true,
  requests = false,
  requestId,
  notificationsFor,
}: {
  messages?: boolean;
  requests?: boolean;
  requestId?: string;
  notificationsFor?: string;
}) {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 800);
    };
    const stops: (() => void)[] = [];
    if (messages) stops.push(watchMessages({ onChange: refresh }));
    if (requests || requestId) stops.push(watchRequests({ requestId, onChange: refresh }));
    if (notificationsFor) stops.push(watchNotifications({ userId: notificationsFor, onChange: refresh }));
    return () => {
      clearTimeout(timer);
      stops.forEach((stop) => stop());
    };
  }, [router, messages, requests, requestId, notificationsFor]);

  return null;
}
