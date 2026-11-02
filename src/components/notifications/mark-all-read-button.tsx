"use client";

import { CheckCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { markAllNotificationsRead } from "@/lib/actions/notification";
import { NOTIFICATIONS_READ_EVENT } from "@/lib/realtime";
import { Button } from "@/components/ui/button";

/** Marks every notification read (F9). The action revalidates, so the list re-renders. */
export function MarkAllReadButton() {
  const t = useTranslations("Notifications");
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await markAllNotificationsRead();
          if (result.ok) window.dispatchEvent(new Event(NOTIFICATIONS_READ_EVENT));
        })
      }
    >
      <CheckCheck aria-hidden />
      {pending ? t("marking") : t("markAllRead")}
    </Button>
  );
}
