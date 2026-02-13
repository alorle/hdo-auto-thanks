import { chromium } from "playwright";
import type { Page } from "playwright";

type SiteConfig = {
  name: string;
  baseUrl: string;
  envPrefix: string;
  loginButtonSelector: string;
};

const SITES: Record<string, SiteConfig> = {
  hdo: { name: "hdo-olimpo", baseUrl: "https://hd-olimpo.club", envPrefix: "HDO", loginButtonSelector: 'button[type="submit"]' },
  f1: { name: "f1-carreras", baseUrl: "https://f1carreras.xyz", envPrefix: "F1", loginButtonSelector: "button.auth-form__primary-button" },
};

let logPrefix = "auto-thanks";

function log(message: string): void {
  console.log(`[${logPrefix}] ${message}`);
}

async function ensureLoggedIn(
  page: Page,
  username: string,
  password: string,
  site: SiteConfig,
): Promise<void> {
  if (!page.url().includes("/login")) return;

  log("Login required. Submitting credentials...");

  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="password"]').fill(password);
  await page.locator(site.loginButtonSelector).click();
  await page.waitForLoadState("networkidle");

  if (page.url().includes("/login")) {
    throw new Error(`Login failed. Check your ${site.envPrefix}_USERNAME and ${site.envPrefix}_PASSWORD.`);
  }

  log("Login successful.");
}

async function thankTorrent(
  page: Page,
  torrentId: string,
  username: string,
  password: string,
  site: SiteConfig,
): Promise<void> {
  const url = `${site.baseUrl}/torrents/${torrentId}`;
  log(`Navigating to torrent ${torrentId}...`);

  await page.goto(url);

  if (page.url().includes("/login")) {
    await ensureLoggedIn(page, username, password, site);
    await page.goto(url);
  }

  await page.waitForLoadState("networkidle");

  // Wait for Livewire to be fully initialized
  // @ts-expect-error -- runs in browser context where window.Livewire exists
  await page.waitForFunction(() => typeof window.Livewire !== "undefined");

  const thanksButton = page
    .locator(`button[wire\\:click="store(${torrentId})"]`)
    .filter({ hasText: "Agradecer" });
  const count = await thanksButton.count();

  if (count === 0) {
    log(`No thanks button found for torrent ${torrentId}. Skipping.`);
    return;
  }

  if (await thanksButton.isDisabled()) {
    log(`Torrent ${torrentId} already thanked. Skipping.`);
    return;
  }

  // Click and wait for the Livewire XHR to fire and complete
  const [response] = await Promise.all([
    page.waitForResponse((res) => res.url().includes("/livewire")),
    thanksButton.click(),
  ]);
  log(`Thanked torrent ${torrentId}. (status: ${response.status()})`);
}

async function main(): Promise<void> {
  const [siteKey, ...torrentIds] = process.argv.slice(2);

  if (!siteKey || torrentIds.length === 0) {
    log("Usage: npm start -- <site> <id1> <id2> ...");
    log(`Available sites: ${Object.keys(SITES).join(", ")}`);
    process.exit(0);
  }

  const site = SITES[siteKey];
  if (!site) {
    log(`Unknown site "${siteKey}". Available: ${Object.keys(SITES).join(", ")}`);
    process.exit(1);
  }

  logPrefix = `auto-thanks:${site.name}`;

  const username = process.env[`${site.envPrefix}_USERNAME`];
  const password = process.env[`${site.envPrefix}_PASSWORD`];

  if (!username || !password) {
    log(`ERROR: ${site.envPrefix}_USERNAME and ${site.envPrefix}_PASSWORD must be set.`);
    process.exit(1);
  }

  log(`Processing ${torrentIds.length} torrent(s)...`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    for (const torrentId of torrentIds) {
      try {
        await thankTorrent(page, torrentId, username, password, site);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("Login failed")) {
          throw error;
        }
        log(`Error processing torrent ${torrentId}: ${message}`);
      }
    }
  } finally {
    await context.close();
    await browser.close();
  }

  log("Done.");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[${logPrefix}] Fatal error: ${message}`);
  process.exit(1);
});
