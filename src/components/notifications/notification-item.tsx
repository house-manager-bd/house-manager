import {
  BadgeCheck,
  Ban,
  CircleCheck,
  CircleX,
  Eye,
  EyeOff,
  Handshake,
  Inbox,
  Star,
  TimerOff,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { openNotification } from "@/lib/actions/notification";
import { formatDateTime, formatShortMoment } from "@/lib/format";
import type { NotificationText } from "@/lib/notifications";
import { cn } from "@/lib/utils";
import type { NotificationRow, NotificationType } from "@/types/database";

type Tone = "good" | "offer" | "bad" | "plain";

const LOOK: Record<NotificationType, { icon: LucideIcon; tone: Tone }> = {
  request_new: { icon: Inbox, tone: "plain" },
  request_shortlisted: { icon: Star, tone: "good" },
  request_declined: { icon: CircleX, tone: "bad" },
  offer_received: { icon: Handshake, tone: "offer" },
  offer_taken_back: { icon: Undo2, tone: "bad" },
  offer_accepted: { icon: BadgeCheck, tone: "good" },
  offer_turned_down: { icon: CircleX, tone: "bad" },
  offer_expired: { icon: TimerOff, tone: "bad" },
  ad_approved: { icon: CircleCheck, tone: "good" },
  ad_rejected: { icon: Ban, tone: "bad" },
  ad_hidden: { icon: EyeOff, tone: "bad" },
  ad_restored: { icon: Eye, tone: "good" },
};

const TONE: Record<Tone, string> = {
  good: "bg-primary/10 text-primary",
  offer: "bg-accent/15 text-amber-700",
  bad: "bg-destructive/10 text-destructive",
  plain: "bg-muted text-foreground",
};

/**
 * One notification in the list (F9). The whole row is a button in a form,
 * so it also works without JavaScript: the server marks it read and opens
 * the page it is about.
 */
export function NotificationItem({
  n,
  text,
  locale,
  unreadLabel,
}: {
  n: NotificationRow;
  text: NotificationText;
  locale: string;
  unreadLabel: string;
}) {
  const unread = !n.read_at;
  const { icon: Icon, tone } = LOOK[n.type] ?? { icon: Inbox, tone: "plain" as Tone };

  return (
    <li>
      <form action={openNotification}>
        <input type="hidden" name="id" value={n.id} />
        <button
          type="submit"
          className={cn(
            "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset",
            unread && "bg-primary/5",
          )}
          data-notification-id={n.id}
          data-unread={unread ? "true" : "false"}
        >
          <span className={cn("mt-0.5 grid size-9 shrink-0 place-items-center rounded-full", TONE[tone])}>
            <Icon className="size-4.5" aria-hidden />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex items-start justify-between gap-2">
              <span className={cn("text-sm", unread ? "font-semibold" : "font-medium")}>{text.title}</span>
              <time
                dateTime={n.created_at}
                title={formatDateTime(n.created_at, locale)}
                className="shrink-0 pt-0.5 text-xs text-muted-foreground"
              >
                {formatShortMoment(n.created_at, locale)}
              </time>
            </span>
            <span className="text-sm text-foreground/85">{text.body}</span>
            {text.adTitle && <span className="truncate text-sm text-muted-foreground">{text.adTitle}</span>}
          </span>
          {unread && (
            <span className="mt-2 size-2.5 shrink-0 rounded-full bg-accent">
              <span className="sr-only">{unreadLabel}</span>
            </span>
          )}
        </button>
      </form>
    </li>
  );
}
