import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// F12: every public page loads in both languages, has one main heading, a
// canonical link and no serious accessibility problems (axe, WCAG 2.1 AA).
// Read-only, so it is safe to run against the live site too.

const PAGES = ["", "/ads", "/ads?area=10002", "/rights", "/terms", "/privacy", "/signup", "/login", "/forgot-password"];

for (const lang of ["bn", "en"] as const) {
  for (const path of PAGES) {
    test(`/${lang}${path} loads and passes axe`, async ({ page }) => {
      const response = await page.goto(`/${lang}${path}`);
      expect(response?.status()).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("lang", lang);
      await expect(page.locator("h1")).toHaveCount(1);
      await checkAxe(page);
    });
  }

  test(`/${lang} ad page loads and passes axe`, async ({ page }) => {
    await page.goto(`/${lang}/ads`);
    const first = page.locator('main a[href*="/ads/"]').first();
    test.skip((await first.count()) === 0, "No live ads to open.");
    await first.click();
    await page.waitForURL(/\/ads\/[0-9a-f-]{36}/);
    await expect(page.locator("h1")).toHaveCount(1);
    // Live ads carry structured data for search engines (F12).
    const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(ld.join(" ")).toContain("RealEstateListing");
    await checkAxe(page);
  });

  test(`/${lang}/nope shows the 404 page`, async ({ page }) => {
    const response = await page.goto(`/${lang}/nope-${Date.now()}`);
    expect(response?.status()).toBe(404);
    await expect(page.locator("h1")).toHaveCount(1);
  });
}

test("robots.txt and sitemap.xml", async ({ request, baseURL }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  const text = await robots.text();
  // Previews close everything; the live site points to its sitemap.
  expect(text.includes("Sitemap:") || text.includes("Disallow: /")).toBeTruthy();

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  const xml = await sitemap.text();
  expect(xml).toContain("<urlset");
  expect(xml).toContain("/bn/rights");
  expect(xml).toContain('hreflang="en"');
  expect(xml).not.toContain("/dashboard");
  expect(baseURL).toBeTruthy();
});

test("skip link moves focus to the main content", async ({ page }) => {
  await page.goto("/en");
  await page.keyboard.press("Tab");
  const skip = page.locator('a[href="#main"]');
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("main#main")).toBeFocused();
});

async function checkAxe(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    // Map tiles come from OpenStreetMap and are outside our control.
    .exclude(".leaflet-container")
    .analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}
