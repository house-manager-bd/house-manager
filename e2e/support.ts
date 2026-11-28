import { deflateSync } from "node:zlib";
import { expect, type Page } from "@playwright/test";
import en from "../messages/en.json";

// Shared helpers for the F12 end-to-end tests. The tests use the English
// pages and read button names from messages/en.json, so a change of wording
// does not break them.

export const T = en;

/** Test accounts (docs/testing/F12.md section 6). The password comes from the environment only. */
export const accounts = {
  landlord: process.env.E2E_LANDLORD_EMAIL || "housemanagerbd+n@gmail.com",
  seeker: process.env.E2E_SEEKER_EMAIL || "housemanagerbd+m1@gmail.com",
  admin: process.env.E2E_ADMIN_EMAIL || "housemanagerbd+admin1@gmail.com",
};

export function passwordFor(email: string) {
  const own: Record<string, string | undefined> = {
    [accounts.landlord]: process.env.E2E_LANDLORD_PASSWORD,
    [accounts.seeker]: process.env.E2E_SEEKER_PASSWORD,
    [accounts.admin]: process.env.E2E_ADMIN_PASSWORD,
  };
  return own[email] || process.env.E2E_PASSWORD || "";
}

export const hasPasswords = () => [accounts.landlord, accounts.seeker].every((e) => passwordFor(e) !== "");

/**
 * Logs in through the real login form and waits for the dashboard. The site
 * then opens in the member's saved language; the tests go on to /en pages.
 */
export async function logIn(page: Page, email: string) {
  await page.goto("/en/login");
  await page.getByLabel(T.Auth.email, { exact: true }).fill(email);
  await page.getByLabel(T.Auth.password, { exact: true }).fill(passwordFor(email));
  await page.getByRole("button", { name: T.Auth.loginButton, exact: true }).click();
  await page.waitForURL(/\/(bn|en)\/(dashboard|onboarding)/);
}

/** yyyy-mm-dd for today plus some days, in Dhaka time. */
export function dhakaDate(plusDays = 0) {
  const now = new Date(Date.now() + 6 * 3600_000 + plusDays * 86_400_000);
  return now.toISOString().slice(0, 10);
}

/** Matches an accessible name that starts with this text (choices with a hint after the label). */
export function startsWith(text: string) {
  return new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
}

/** A short id for this run, so names never clash with earlier runs. */
export const runId = () => Date.now().toString(36).slice(-6);

// ---------------------------------------------------------------- test photos

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/**
 * A PNG that no other ad uses (the F5 checks send reused photos to review):
 * a colour gradient with random blocks, 1200 by 900 pixels, so it passes the
 * 600 pixel minimum.
 */
export function testPhoto(seed: number, width = 1200, height = 900) {
  let s = (seed * 2654435761) >>> 0;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const top = [rand() * 255, rand() * 255, rand() * 255];
  const bottom = [rand() * 255, rand() * 255, rand() * 255];
  const blocks = Array.from({ length: 12 }, () => ({
    x: rand() * width, y: rand() * height, w: 60 + rand() * 300, h: 40 + rand() * 220,
    c: [rand() * 255, rand() * 255, rand() * 255],
  }));
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    const t = y / height;
    for (let x = 0; x < width; x++) {
      let c = top.map((v, i) => v * (1 - t) + bottom[i] * t);
      for (const b of blocks) if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) c = b.c;
      raw.set(c.map(Math.round), row + 1 + x * 3);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return { name: `photo-${seed}.png`, mimeType: "image/png", buffer: png };
}

/** Waits until a form step has saved and the next page is shown. */
export async function clickAndWaitForURL(page: Page, name: string, url: RegExp) {
  await page.getByRole("button", { name, exact: true }).click();
  await page.waitForURL(url);
  await expect(page.locator("main")).toBeVisible();
}
