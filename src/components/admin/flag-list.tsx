import { CircleAlert, UserRoundPlus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { AdminFlag } from "@/lib/data/admin";
import { formatTaka } from "@/lib/format";

const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));

/** Why an ad is in the review queue, in plain words (from listing_flags). */
export function FlagList({ flags }: { flags: AdminFlag[] }) {
  const t = useTranslations("Admin");
  const locale = useLocale();
  if (!flags.length) return <p className="text-sm text-muted-foreground">{t("noFlags")}</p>;

  return (
    <ul className="flex flex-col gap-1.5">
      {flags.map(({ flag, detail }) => {
        const neutral = flag === "new_member";
        let text: React.ReactNode;
        switch (flag) {
          case "was_rejected":
            text = t("flags.was_rejected", { reason: String(detail.reason ?? "") });
            break;
          case "photo_reused": {
            const ids = Array.isArray(detail.listing_ids) ? (detail.listing_ids as string[]) : [];
            text = (
              <>
                {t("flags.photo_reused", { count: ids.length })}{" "}
                {ids.slice(0, 5).map((other, i) => (
                  <Link key={other} href={`/ads/${other}`} className="mr-2 text-primary underline underline-offset-2">
                    {t("otherAd", { number: i + 1 })}
                  </Link>
                ))}
              </>
            );
            break;
          }
          case "phone_many_ads":
            text = t("flags.phone_many_ads", { count: num(detail.buildings) });
            break;
          case "phone_other_member":
            text = t("flags.phone_other_member", { count: num(detail.members) });
            break;
          case "banned_words":
            text = t("flags.banned_words", {
              words: (Array.isArray(detail.words) ? (detail.words as string[]) : []).join(", "),
            });
            break;
          case "rent_outlier":
            text =
              detail.scope === "fixed"
                ? t("flags.rent_outlier_fixed", {
                    rent: formatTaka(num(detail.rent), locale),
                    low: formatTaka(num(detail.low), locale),
                    high: formatTaka(num(detail.high), locale),
                  })
                : t(detail.scope === "thana" ? "flags.rent_outlier_thana" : "flags.rent_outlier_area", {
                    rent: formatTaka(num(detail.rent), locale),
                    median: formatTaka(num(detail.median), locale),
                    count: num(detail.ads),
                  });
            break;
          default:
            text = t(`flags.${flag}`);
        }
        const Icon = neutral ? UserRoundPlus : CircleAlert;
        return (
          <li key={flag} className="flex items-start gap-2 text-sm">
            <Icon
              className={neutral ? "mt-0.5 size-4 shrink-0 text-muted-foreground" : "mt-0.5 size-4 shrink-0 text-amber-700"}
              aria-hidden
            />
            <span className="min-w-0 break-words">{text}</span>
          </li>
        );
      })}
    </ul>
  );
}
