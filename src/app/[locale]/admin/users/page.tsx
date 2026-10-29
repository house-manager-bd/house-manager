import type { Metadata } from "next";
import { Search } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth";
import { USERS_PAGE_SIZE, listUsers } from "@/lib/data/admin";
import { formatDate } from "@/lib/format";
import { nameInitials } from "@/lib/utils";
import { USER_FILTERS, type UserFilter } from "@/lib/validation/moderation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { BanControl } from "@/components/admin/ban-control";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Admin");
  return { title: t("usersTitle"), robots: { index: false } };
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AdminUsersPage({ searchParams }: PageProps<"/[locale]/admin/users">) {
  const query = await searchParams;
  const q = (first(query.q) ?? "").trim().slice(0, 100);
  const filterParam = first(query.filter);
  const filter = USER_FILTERS.includes(filterParam as UserFilter) ? (filterParam as UserFilter) : null;
  const page = Math.max(1, Math.floor(Number(first(query.page)) || 1));

  const [t, tEnum, locale, user, { users, total }] = await Promise.all([
    getTranslations("Admin"),
    getTranslations("Enums"),
    getLocale(),
    getCurrentUser(),
    listUsers(q || null, filter, page),
  ]);
  if (!user) return null;
  const pages = Math.max(1, Math.ceil(total / USERS_PAGE_SIZE));

  const pageHref = (n: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (filter) params.set("filter", filter);
    if (n > 1) params.set("page", String(n));
    const s = params.toString();
    return s ? `/admin/users?${s}` : "/admin/users";
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold sm:text-3xl">{t("usersTitle")}</h1>
        <p className="max-w-2xl text-muted-foreground">{t("usersIntro")}</p>
      </div>

      <form method="get" className="flex flex-col gap-3 sm:flex-row sm:items-end" role="search">
        <div className="flex flex-1 flex-col gap-2">
          <label htmlFor="users-q" className="text-sm font-medium">
            {t("searchLabel")}
          </label>
          <Input id="users-q" name="q" defaultValue={q} type="search" maxLength={100} />
        </div>
        <div className="flex flex-col gap-2 sm:w-48">
          <label htmlFor="users-filter" className="text-sm font-medium">
            {t("filterLabel")}
          </label>
          <NativeSelect id="users-filter" name="filter" defaultValue={filter ?? ""}>
            <option value="">{t("filters.all")}</option>
            {USER_FILTERS.map((f) => (
              <option key={f} value={f}>
                {t(`filters.${f}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit" className="sm:w-auto">
          <Search aria-hidden />
          {t("searchButton")}
        </Button>
      </form>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {t("usersCount", { count: total })}
      </p>

      {users.length > 0 && (
        <ul className="flex flex-col gap-3">
          {users.map((u) => {
            const name = u.full_name.trim() || t("noName");
            const isMe = u.id === user.id;
            return (
              <li key={u.id}>
                <Card className="gap-3 px-4 py-4 sm:px-6">
                  <div className="flex min-w-0 items-start gap-3">
                    <Avatar className="size-10 border">
                      {u.avatar_url && <AvatarImage src={u.avatar_url} alt="" referrerPolicy="no-referrer" />}
                      <AvatarFallback>{nameInitials(name)}</AvatarFallback>
                    </Avatar>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-semibold break-words">{name}</span>
                        {isMe && <Badge variant="outline">{t("badgeYou")}</Badge>}
                        {u.is_admin && <Badge>{t("badgeAdmin")}</Badge>}
                        {u.is_banned && (
                          <Badge className="bg-destructive/10 text-destructive">{t("badgeBanned")}</Badge>
                        )}
                        <Badge variant={u.trust_level === 0 ? "warning" : "muted"}>
                          {tEnum(`trustLevel.${u.trust_level === 0 ? "0" : "1"}`)}
                        </Badge>
                      </span>
                      <span className="text-sm break-all text-muted-foreground" dir="ltr">
                        {u.email}
                      </span>
                      <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span>{t("joined", { date: formatDate(u.created_at, locale) })}</span>
                        {u.last_sign_in_at && <span>{t("lastLogin", { date: formatDate(u.last_sign_in_at, locale) })}</span>}
                        <span>{t("adsLine", { live: u.live_ads, total: u.total_ads })}</span>
                        <span>{t("upheldLine", { count: u.upheld_reports })}</span>
                      </span>
                    </div>
                  </div>
                  {!isMe && !u.is_admin && <BanControl userId={u.id} banned={u.is_banned} />}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 && (
        <nav className="flex flex-wrap items-center justify-between gap-3" aria-label={t("usersTitle")}>
          {page > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={pageHref(page - 1)}>{t("previousPage")}</Link>
            </Button>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted-foreground">{t("pageOf", { page, total: pages })}</span>
          {page < pages ? (
            <Button asChild variant="outline" size="sm">
              <Link href={pageHref(page + 1)}>{t("nextPage")}</Link>
            </Button>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
