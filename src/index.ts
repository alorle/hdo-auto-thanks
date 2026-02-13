import { SITES, getSiteCredentials } from "./config.js";
import { log } from "./log.js";
import { getPage, closeAll } from "./browser.js";
import { thankTorrent } from "./thanks.js";
import { startServer } from "./webhook-server.js";

async function runCli(siteKey: string, torrentIds: string[]): Promise<void> {
  const site = SITES[siteKey];
  if (!site) {
    log("auto-thanks", `Unknown site "${siteKey}". Available: ${Object.keys(SITES).join(", ")}`);
    process.exit(1);
  }

  const { username, password } = getSiteCredentials(site);
  const logPrefix = `auto-thanks:${site.name}`;

  log(logPrefix, `Processing ${torrentIds.length} torrent(s)...`);

  const page = await getPage(siteKey);
  try {
    for (const torrentId of torrentIds) {
      try {
        await thankTorrent(page, torrentId, username, password, site, logPrefix);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("Login failed")) throw error;
        log(logPrefix, `Error processing torrent ${torrentId}: ${message}`);
      }
    }
  } finally {
    await closeAll();
  }

  log(logPrefix, "Done.");
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);

  if (command === "serve") {
    const port = Number(process.env.WEBHOOK_PORT ?? "3000");
    await startServer(port);
    return;
  }

  // Backward-compatible CLI mode: first arg is site key
  if (command && command in SITES && rest.length > 0) {
    await runCli(command, rest);
    return;
  }

  console.log("Usage:");
  console.log("  node src/index.ts <site> <id1> <id2> ...   Thank specific torrents");
  console.log("  node src/index.ts serve                    Start webhook server");
  console.log(`\nAvailable sites: ${Object.keys(SITES).join(", ")}`);
  console.log("\nEnvironment variables:");
  console.log("  HDO_USERNAME, HDO_PASSWORD     HD-Olimpo credentials");
  console.log("  F1_USERNAME, F1_PASSWORD       F1Carreras credentials");
  console.log("  QBIT_URL                       qBittorrent WebUI URL");
  console.log("  QBIT_USERNAME                  qBittorrent WebUI username");
  console.log("  QBIT_PASSWORD                  qBittorrent WebUI password");
  console.log("  WEBHOOK_PORT                   Webhook server port (default: 3000)");
  console.log("  CACHE_DIR                      Browser session cache directory");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[auto-thanks] Fatal error: ${message}`);
  process.exit(1);
});
