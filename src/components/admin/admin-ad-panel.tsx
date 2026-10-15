import { Phone, ShieldCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ListingModeration } from "@/lib/data/admin";
import { formatDate } from "@/lib/format";
import { formatBdPhoneLocal } from "@/lib/phone";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PosterLine, ReportList, statusVariant } from "./ad-review-card";
import { FlagList } from "./flag-list";
import { ModerationActions } from "./moderation-actions";

/**
 * Shown to admins on an ad's own page (F5): status, who posted it, why it is
 * in the queue, open reports, earlier decisions and the decision buttons.
 */
export function AdminAdPanel({
  listingId,
  moderation,
  viewerId,
  contact,
}: {
  listingId: string;
  moderation: ListingModeration;
  viewerId: string;
  /** The ad's numbers, to judge the phone checks. */
  contact: { contact_phone: string | null; whatsapp: string | null } | null;
}) {
  const t = useTranslations("Admin");
  const tEnum = useTranslations("Enums");
  const tAd = useTranslations("AdPage");
  const locale = useLocale();
  const { status, poster, flags, openReports, history } = moderation;

  return (
    <Card className="gap-4 border-primary/40 py-5">
      <CardContent className="flex flex-col gap-4 px-4 sm:px-6">
        <div className="flex flex-col gap-1">
          <p className="flex flex-wrap items-center gap-2">
            <ShieldCheck className="size-5 text-primary" aria-hidden />
            <span className="font-semibold">{t("panelTitle")}</span>
            <Badge variant={statusVariant(status)}>{tEnum(`listingStatus.${status}`)}</Badge>
          </p>
          {poster?.id !== viewerId && <p className="text-xs text-muted-foreground">{tAd("adminView")}</p>}
        </div>

        <PosterLine poster={poster} />

        {contact?.contact_phone && (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <Phone className="size-4 text-muted-foreground" aria-hidden />
            <span dir="ltr">{formatBdPhoneLocal(contact.contact_phone)}</span>
            {contact.whatsapp && contact.whatsapp !== contact.contact_phone && (
              <span dir="ltr" className="text-muted-foreground">
                {tAd("whatsapp")} {formatBdPhoneLocal(contact.whatsapp)}
              </span>
            )}
          </p>
        )}

        {(flags.length > 0 || status === "pending_review") && (
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">{t("whyHere")}</h2>
            <FlagList flags={flags} />
          </section>
        )}

        {openReports.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">{t("reportsCount", { count: openReports.length })}</h2>
            <ReportList reports={openReports} />
          </section>
        )}

        {history.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">{t("history")}</h2>
            <ul className="flex flex-col gap-1.5 text-sm">
              {history.map((h) => (
                <li key={h.id} className="flex flex-col">
                  <span>
                    {tEnum(`moderationAction.${h.action}`)}
                    <span className="text-muted-foreground">
                      {" "}
                      · {h.admin?.full_name.trim() || t("system")} · {formatDate(h.created_at, locale)}
                    </span>
                  </span>
                  {h.note && <span className="break-words text-muted-foreground">{h.note}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="border-t pt-4">
          <ModerationActions
            listingId={listingId}
            status={status}
            hasOpenReports={openReports.length > 0}
            isOwn={poster?.id === viewerId}
            posterBanned={Boolean(poster?.is_banned)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
