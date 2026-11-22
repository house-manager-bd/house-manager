import { createTranslator } from "next-intl";
import { describeNotification, notificationTarget } from "@/lib/notifications";
import type { AppLocale, NotificationEmailRow } from "@/types/database";
import bn from "../../../messages/bn.json";
import en from "../../../messages/en.json";

// F9: one notification as an email, in the member's saved language. The
// text is the same as on the notifications page (describeNotification).
// The email carries no private details (no address, phone or NID): it says
// what happened and links to the page.

const MESSAGES: Record<AppLocale, typeof en> = { bn: bn as typeof en, en };

export type RenderedEmail = {
  /** Sender name in the member's language ("হাউস ম্যানেজার" or "House Manager"). */
  fromName: string;
  subject: string;
  text: string;
  html: string;
  /** The page the button opens. */
  url: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Removes line breaks, so a name or title can never add lines or headers. */
function oneLine(value: string) {
  return value.replace(/[\r\n\u2028\u2029]+/g, " ").trim();
}

export function renderNotificationEmail(row: NotificationEmailRow, siteUrl: string): RenderedEmail {
  const locale: AppLocale = row.locale === "en" ? "en" : "bn";
  const messages = MESSAGES[locale];
  const opts = { locale, messages, timeZone: "Asia/Dhaka" } as const;
  const t = createTranslator({ ...opts, namespace: "Notifications" });
  const tEnum = createTranslator({ ...opts, namespace: "Enums" });
  const tEmail = createTranslator({ ...opts, namespace: "Email" });
  const appName = createTranslator({ ...opts, namespace: "Common" })("appName");

  const text = describeNotification(row, locale, t, tEnum);
  const title = oneLine(text.title);
  const body = oneLine(text.body);
  const adTitle = oneLine(text.adTitle);
  const name = oneLine(row.full_name ?? "");
  const greeting = name ? tEmail("greeting", { name }) : tEmail("greetingNoName");

  const target = notificationTarget(row);
  const url = `${siteUrl}/${locale}${target.href}`;
  const settingsUrl = `${siteUrl}/${locale}/dashboard/notifications#email`;
  const button =
    target.kind === "request" ? tEmail("buttonRequest") : target.kind === "ad" ? tEmail("buttonAd") : tEmail("buttonMyAds");

  const plain = [
    greeting,
    "",
    title,
    body,
    ...(adTitle ? ["", adTitle] : []),
    "",
    `${button}: ${url}`,
    "",
    tEmail("safety"),
    tEmail("footer"),
    tEmail("footerSettings"),
    settingsUrl,
    "",
  ].join("\n");

  const font = "'Noto Sans Bengali','Hind Siliguri',Inter,'Segoe UI',Arial,sans-serif";
  const html = `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;">
<div style="max-width:560px;margin:0 auto;padding:24px 16px;font-family:${font};color:#0f172a;">
<div style="font-size:18px;font-weight:700;color:#0F766E;padding:0 4px 16px;">${escapeHtml(appName)}</div>
<div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;">
<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">${escapeHtml(greeting)}</p>
<h1 style="margin:0 0 8px;font-size:20px;line-height:1.4;font-weight:700;">${escapeHtml(title)}</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${escapeHtml(body)}</p>
${adTitle ? `<p style="margin:0 0 20px;padding:10px 12px;background:#f8fafc;border-left:3px solid #F59E0B;font-size:15px;line-height:1.5;font-weight:600;">${escapeHtml(adTitle)}</p>` : ""}
<a href="${escapeHtml(url)}" style="display:inline-block;background:#0F766E;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:8px;">${escapeHtml(button)}</a>
<p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:#64748b;">${escapeHtml(tEmail("linkHint"))}<br><a href="${escapeHtml(url)}" style="color:#0F766E;word-break:break-all;">${escapeHtml(url)}</a></p>
</div>
<p style="margin:16px 4px 0;font-size:12px;line-height:1.6;color:#64748b;">${escapeHtml(tEmail("safety"))}</p>
<p style="margin:8px 4px 0;font-size:12px;line-height:1.6;color:#64748b;">${escapeHtml(tEmail("footer"))} ${escapeHtml(tEmail("footerSettings"))}<br><a href="${escapeHtml(settingsUrl)}" style="color:#0F766E;word-break:break-all;">${escapeHtml(settingsUrl)}</a></p>
</div>
</body>
</html>`;

  return { fromName: appName, subject: title, text: plain, html, url };
}
