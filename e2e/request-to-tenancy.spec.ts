import { expect, test, type Browser } from "@playwright/test";
import { accounts, dhakaDate, hasPasswords, logIn, runId, startsWith, T, testPhoto } from "./support";

// F12: the whole TO-LET story in one test, the way two people use the site.
// A landlord adds a building and a flat, posts an ad with photos (an admin
// approves it if it waits for review), a member sends a request, the
// landlord shortlists it and writes, adds a visit time that the member
// books, and makes an offer; the member accepts with NID, photo and address,
// and both sides see the tenancy. The ad is then rented.
//
// It writes real data. Run it on a laptop against `npm run dev` or against
// a preview, then delete the data with docs/testing/F12.md Query 3.

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

async function signedIn(browser: Browser, email: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await logIn(page, email);
  return page;
}

test("a new ad becomes a confirmed tenancy", async ({ browser }) => {
  test.skip(!hasPasswords(), "Set E2E_PASSWORD (docs/testing/F12.md section 6).");
  const id = runId();
  const title = `E2E ${id} two bedroom flat for a family`;
  const landlord = await signedIn(browser, accounts.landlord);
  let listingId = "";
  let requestId = "";

  await test.step("landlord adds a building", async () => {
    await landlord.goto("/en/dashboard/properties/new?next=post");
    await landlord.getByRole("radio", { name: T.Enums.myRole.owner, exact: true }).check();
    await landlord.getByLabel(T.BuildingForm.name, { exact: true }).fill(`E2E ${id} House`);
    await landlord.getByLabel("Thana", { exact: true }).selectOption({ label: "Mirpur Model" });
    await landlord.getByLabel("Area", { exact: true }).selectOption({ label: "Mirpur 10" });
    await landlord.getByLabel(T.BuildingForm.totalFloors, { exact: true }).fill("6");
    await landlord.getByRole("button", { name: T.BuildingForm.next, exact: true }).click();
    // Part 2: address, and the pin starts at the area's centre.
    await landlord.getByLabel(T.BuildingForm.roadAddress, { exact: true }).fill("Road 3, Section 10");
    await landlord.getByLabel(T.BuildingForm.houseNo, { exact: true }).fill(`E2E-${id}`);
    await landlord.getByRole("button", { name: T.BuildingForm.useAreaCenter, exact: true }).click();
    await landlord.getByRole("button", { name: T.BuildingForm.next, exact: true }).click();
    await landlord.getByRole("button", { name: T.BuildingForm.next, exact: true }).click();
    await landlord.getByRole("button", { name: T.BuildingForm.save, exact: true }).click();
    // With ?next=post, saving goes on to the unit step of the post-ad wizard.
    await landlord.waitForURL(/\/en\/post\?building=/);
  });

  await test.step("landlord adds a flat and fills in the ad", async () => {
    // A new building has no units, so the unit form is already open.
    const unitName = landlord.getByLabel(T.UnitForm.label, { exact: true });
    if (!(await unitName.isVisible())) await landlord.getByRole("button", { name: T.Wizard.addNewUnit, exact: true }).click();
    await unitName.fill("2A");
    await landlord.getByLabel(T.UnitForm.bedrooms, { exact: true }).fill("2");
    await landlord.getByLabel(T.UnitForm.bathrooms, { exact: true }).fill("2");
    await landlord.getByRole("button", { name: T.UnitForm.save, exact: true }).click();
    // Saving the unit creates the draft and opens step 3 at /post/<draft id>.
    await landlord.waitForURL(/\/en\/post\/[0-9a-f-]{36}/);
    listingId = landlord.url().match(UUID)![0];

    // Step 3: ad type, title, description, date.
    await landlord.getByRole("radio", { name: startsWith(T.Enums.listingType.flat) }).check();
    await landlord.getByLabel(T.Wizard.adTitle, { exact: true }).fill(title);
    await landlord
      .getByLabel(T.Wizard.description, { exact: true })
      .fill("A bright flat with two bedrooms, a lift and a generator. Written by the end-to-end test.");
    await landlord.getByLabel(T.Wizard.availableFrom, { exact: true }).fill(dhakaDate(10));
    await landlord.getByRole("button", { name: T.Wizard.saveAndNext, exact: true }).click();
    // Step 4: rent and costs.
    await landlord.getByLabel(T.Wizard.monthlyRent, { exact: true }).fill("18000");
    await landlord.getByLabel(T.Wizard.advanceMonths, { exact: true }).fill("1");
    await landlord.getByLabel(T.Wizard.electricity, { exact: true }).selectOption("prepaid");
    await landlord.getByLabel(T.Wizard.water, { exact: true }).selectOption("included");
    await landlord.getByRole("button", { name: T.Wizard.saveAndNext, exact: true }).click();
    // Step 5: who can rent and the contact number.
    await landlord.getByRole("checkbox", { name: startsWith(T.Enums.tenantType.family) }).check();
    await landlord.getByRole("button", { name: T.Wizard.saveAndNext, exact: true }).click();
    // Step 6: four new photos.
    await landlord
      .locator('input[type="file"]')
      .setInputFiles([1, 2, 3, 4].map((n) => testPhoto(Date.now() + n)));
    await expect(landlord.getByText(T.Photos.enough)).toBeVisible({ timeout: 60_000 });
    await landlord.getByRole("button", { name: T.Wizard.saveAndNext, exact: true }).click();
  });

  await test.step("landlord publishes, and an admin approves if needed", async () => {
    const publish = landlord.getByRole("button", { name: new RegExp(`^(${T.Wizard.submit}|${T.Wizard.submitReview})$`) });
    await publish.click();
    await landlord.waitForURL(new RegExp(`/en/ads/${listingId}`));
    if (landlord.url().includes("submitted=review")) {
      const admin = await signedIn(browser, accounts.admin);
      await admin.goto(`/en/ads/${listingId}`);
      await admin.getByRole("button", { name: T.Admin.approve, exact: true }).click();
      await expect(admin.getByText(T.Admin.done.approve)).toBeVisible();
      await admin.context().close();
    }
  });

  const seeker = await signedIn(browser, accounts.seeker);

  await test.step("member finds the ad and sends a request", async () => {
    await seeker.goto(`/en/ads/${listingId}`);
    await expect(seeker.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await seeker.getByRole("button", { name: T.RequestForm.open, exact: true }).click();
    await seeker.getByRole("radio", { name: startsWith(T.Enums.householdType.family) }).check();
    await seeker.getByLabel(T.RequestForm.members, { exact: true }).fill("3");
    await seeker.getByLabel(T.RequestForm.occupation, { exact: true }).fill("Teacher");
    await seeker.getByLabel(T.RequestForm.moveIn, { exact: true }).fill(dhakaDate(20));
    await seeker.getByLabel(T.RequestForm.message, { exact: true }).fill("We are a family of three.");
    await seeker.getByRole("button", { name: T.RequestForm.send, exact: true }).click();
    await expect(seeker.getByText(T.RequestForm.sentTitle)).toBeVisible();
    await seeker.goto("/en/dashboard/requests");
    // The request's own page (messages, offer, visit) is linked from its card.
    const card = seeker.getByRole("listitem").filter({ has: seeker.getByRole("heading", { name: title }) });
    const href = await card.locator('a[href*="/dashboard/requests/"]').first().getAttribute("href");
    requestId = href!.match(UUID)![0];
  });

  await test.step("landlord shortlists the request and writes a message", async () => {
    await landlord.goto(`/en/dashboard/requests/${requestId}`);
    await landlord.getByRole("button", { name: T.Inbox.shortlist, exact: true }).click();
    await expect(landlord.getByText(T.Inbox.doneShortlisted)).toBeVisible();
    await landlord.getByLabel(T.Thread.composeLabel, { exact: true }).fill(`Hello from the landlord, ${id}.`);
    await landlord.getByRole("button", { name: T.Thread.send, exact: true }).click();
    await expect(landlord.getByText(`Hello from the landlord, ${id}.`)).toBeVisible();
  });

  await test.step("landlord adds visit times and the member books one", async () => {
    await landlord.goto(`/en/dashboard/ads/${listingId}/viewings`);
    await landlord.getByLabel(T.Viewing.day, { exact: true }).selectOption({ index: 1 });
    await landlord.getByLabel(T.Viewing.from, { exact: true }).selectOption({ label: "10:00 am" });
    await landlord.getByLabel(T.Viewing.to, { exact: true }).selectOption({ label: "11:00 am" });
    await landlord.getByRole("button", { name: T.Viewing.add, exact: true }).click();
    await expect(landlord.getByText(/visit times? added/)).toBeVisible();

    await seeker.goto(`/en/dashboard/requests/${requestId}`);
    await expect(seeker.getByText(`Hello from the landlord, ${id}.`)).toBeVisible();
    await seeker.locator("#visit").getByRole("button").filter({ hasText: "10:00" }).first().click();
    await seeker.getByRole("button", { name: T.Viewing.book, exact: true }).click();
    await expect(seeker.getByText(T.Viewing.doneBooked)).toBeVisible();
  });

  await test.step("landlord makes an offer", async () => {
    await landlord.goto(`/en/dashboard/requests/${requestId}`);
    await landlord.getByRole("button", { name: T.Offer.make, exact: true }).click();
    await landlord.getByRole("button", { name: T.Offer.send, exact: true }).click();
    await expect(landlord.getByRole("status").getByText(T.Offer.doneOffered)).toBeVisible();
  });

  await test.step("member accepts with NID, photo and address", async () => {
    await seeker.goto(`/en/dashboard/requests/${requestId}`);
    await seeker.getByRole("button", { name: T.Offer.accept, exact: true }).click();
    const nid = String(Date.now()).slice(-10);
    await seeker.getByLabel(T.Offer.nid, { exact: true }).fill(nid);
    await seeker.locator('input[type="file"]').setInputFiles(testPhoto(Date.now(), 800, 800));
    await seeker.getByLabel(T.Offer.permanentAddress, { exact: true }).fill("Village Test, Post Office Test, Savar, Dhaka");
    await seeker.getByRole("checkbox").check();
    await seeker.getByRole("button", { name: T.Offer.confirm, exact: true }).click();
    await expect(seeker.getByText(T.Offer.doneAccepted)).toBeVisible({ timeout: 60_000 });
    await expect(seeker.getByText(T.Offer.tenancyTitleSeeker)).toBeVisible();
  });

  await test.step("both sides see the tenancy, and the ad is rented", async () => {
    await landlord.goto(`/en/dashboard/requests/${requestId}`);
    await expect(landlord.getByText(T.Offer.tenantDetails).first()).toBeVisible();
    await landlord.goto(`/en/ads/${listingId}`);
    await expect(landlord.locator("main")).toContainText(T.Enums.listingStatus.rented);
  });

  await landlord.context().close();
  await seeker.context().close();
});

