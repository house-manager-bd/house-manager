import { Info } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { formatDate } from "@/lib/format";
import { SUPPORT_EMAIL } from "@/lib/site";

export type LegalSection = { id: string; heading: string; body?: string[]; points?: string[]; after?: string[] };

/**
 * One layout for the Know your rights, Terms and Privacy pages (F12): a
 * title, a short note, a list of sections to jump to, and the date of the
 * last change. The text lives in messages/*.json.
 */
export async function LegalPage({
  title,
  intro,
  note,
  sections,
  updated,
  children,
}: {
  title: string;
  intro: string;
  note: string;
  sections: LegalSection[];
  /** yyyy-mm-dd */
  updated: string;
  children?: ReactNode;
}) {
  const [t, locale] = await Promise.all([getTranslations("Legal"), getLocale()]);
  const paragraphs = (items: string[] | undefined) =>
    items?.map((text, i) => (
      <p key={i} className="leading-relaxed">
        {text}
      </p>
    ));

  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-8 sm:py-12">
      <header className="flex flex-col gap-4">
        <h1 className="text-3xl leading-tight font-bold sm:text-4xl">{title}</h1>
        <p className="text-lg leading-relaxed text-muted-foreground">{intro}</p>
        <p className="flex items-start gap-2 rounded-lg border border-primary/20 bg-secondary px-4 py-3 text-sm text-secondary-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{note}</span>
        </p>
      </header>

      <nav aria-labelledby="on-this-page" className="rounded-xl border bg-card p-4 sm:p-5">
        <h2 id="on-this-page" className="mb-2 text-sm font-semibold text-muted-foreground">
          {t("onThisPage")}
        </h2>
        <ol className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          {sections.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-primary underline underline-offset-2 hover:no-underline">
                {s.heading}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {sections.map((s) => (
        <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="flex scroll-mt-24 flex-col gap-3">
          <h2 id={`${s.id}-title`} className="text-xl font-semibold">
            {s.heading}
          </h2>
          {paragraphs(s.body)}
          {s.points && (
            <ul className="flex list-disc flex-col gap-1.5 ps-6 leading-relaxed marker:text-primary">
              {s.points.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          )}
          {paragraphs(s.after)}
        </section>
      ))}

      {children}

      <footer className="flex flex-col gap-2 border-t pt-6 text-sm text-muted-foreground">
        <p>
          {t.rich("contact", {
            email: () => (
              <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-primary underline underline-offset-2">
                {SUPPORT_EMAIL}
              </a>
            ),
          })}
        </p>
        <p>{t("updated", { date: formatDate(updated, locale) })}</p>
      </footer>
    </article>
  );
}
