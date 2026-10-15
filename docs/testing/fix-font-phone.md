# Fix test steps: Bangla digits and dashboard on phones

Two problems reported by Sifat on 2026-10-15 after F4:
1. In Hind Siliguri the Bangla digit ১ was so small that it looked like a comma ("মিরপুর ১" read as "মিরপুর ,"). The Bangla font is now **Noto Sans Bengali** (one variable file for every weight, about 108 KB instead of four files of about 72 KB each).
2. Every page under `/dashboard` (overview, profile, properties, building pages, my ads) was about 700px wide on a phone, so text was cut off at the right and the page scrolled sideways. The dashboard grid had no column width on phones, so its one column grew to the width of the menu strip. It now uses `grid-cols-1` (`minmax(0, 1fr)`). The phone menu strip also scrolls the current page's item into view.

Also in this change: `package-lock.json` now has the `@emnapi/core` and `@emnapi/runtime` entries, so `npm ci` works again (known bug from 2026-10-09).

No database change. Test on the pull request's Vercel preview.

## 1. Bangla digits
| # | Step | Expected |
|---|---|---|
| 1.1 | Open `/bn` on a phone and a computer | Popular areas read clearly as মিরপুর ১, মিরপুর ১০, মিরপুর ১১, মিরপুর ১২. The ১ is a full-height digit, not a comma |
| 1.2 | `/bn/ads` | Prices like ৳ ১১,০০০ and "১৩টি বিজ্ঞাপন পাওয়া গেছে" are easy to read |
| 1.3 | Chrome DevTools, Elements, select a Bangla heading, Computed, scroll to "Rendered Fonts" | Noto Sans Bengali Variable |
| 1.4 | `/en` with a Bangla name somewhere (for example a Bangla ad title) | English text is still Inter; the Bangla words use Noto Sans Bengali |
| 1.5 | Bold text (headings, buttons) in Bangla | Bold, not faux-bold or blurry |

## 2. Dashboard on a phone (360px)
Use a real phone, or Chrome DevTools device mode at 360px wide. Log in as a landlord (host mode).

| # | Page | Expected |
|---|---|---|
| 2.1 | `/bn/dashboard` | No sideways scrolling. Cards fit the screen and text wraps instead of being cut off |
| 2.2 | `/bn/dashboard/profile` | Photo card and form fit. Name, phone and the language and mode switches fit the width |
| 2.3 | `/bn/dashboard/properties` and one building's page | Building cards and unit list fit |
| 2.4 | `/bn/dashboard/properties/new` and a building's edit page | All four parts of the form fit; the map fits in part 2 |
| 2.5 | `/bn/dashboard/ads` | Ad cards fit; the menu strip at the top shows "আমার বিজ্ঞাপন" highlighted and fully visible |
| 2.6 | `/bn/dashboard/profile` | The menu strip has scrolled so "প্রোফাইল" (the last item) is visible and highlighted |
| 2.7 | Swipe the menu strip sideways | It still scrolls to the other items; the page itself does not move sideways |
| 2.8 | Switch to seeker mode, `/bn/dashboard` | Same: fits the screen |
| 2.9 | The same pages in English (`/en/dashboard`, `/en/dashboard/profile`) | Fit the screen |

## 3. Other widths
| # | Step | Expected |
|---|---|---|
| 3.1 | Tablet width (768px) on the dashboard pages | One column, no sideways scrolling |
| 3.2 | Computer (1280px) on the dashboard pages | Unchanged: menu on the left (220px), page on the right |
| 3.3 | Pages outside the dashboard at 360px (home, search, ad page, post-ad wizard, login, sign-up) | Unchanged and no sideways scrolling |

## 4. For developers
| # | Step | Expected |
|---|---|---|
| 4.1 | Fresh clone, `npm ci` with Node 24 and npm 11 | Installs without "lock file out of sync" |
| 4.2 | `npm run build` | No errors; there is no `@fontsource/hind-siliguri` import left |

Checked before the pull request (2026-10-15): typecheck, lint, production build, and a Playwright run of 21 pages (signed out, landlord and seeker, Bangla and English) at 360px, 768px and 1280px against a local copy of the database. Before the fix 10 dashboard pages were 686 to 765px wide at 360px; after it no page is wider than the screen.
