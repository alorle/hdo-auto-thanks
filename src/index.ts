import { SITES, getSiteCredentials, getScanConfig } from "./config.js";
import { log } from "./log.js";
import { getPage, closeAll } from "./browser.js";
import { thankTorrent } from "./thanks.js";
import { startServer } from "./webhook-server.js";
import { QBittorrentClient } from "./qbittorrent.js";
import { scanAllTorrents } from "./scanner.js";
import { scheduleDaily } from "./scheduler.js";

function mask(value: string | undefined): string {
  if (!value) return "(not set)";
  if (value.length <= 4) return "****";
  return value.slice(0, 2) + "****" + value.slice(-2);
}

function logConfig(): void {
  log("config", "Loaded environment config:");
  log("config", `  WEBHOOK_PORT     = ${process.env.WEBHOOK_PORT ?? "(not set, default: 3000)"}`);
  log("config", `  QBIT_URL         = ${process.env.QBIT_URL ?? "(not set)"}`);
  log("config", `  QBIT_USERNAME    = ${process.env.QBIT_USERNAME ?? "(not set)"}`);
  log("config", `  QBIT_PASSWORD    = ${mask(process.env.QBIT_PASSWORD)}`);
  for (const site of Object.values(SITES)) {
    const prefix = site.envPrefix;
    log("config", `  ${prefix}_USERNAME   = ${process.env[`${prefix}_USERNAME`] ?? "(not set)"}`);
    log("config", `  ${prefix}_PASSWORD   = ${mask(process.env[`${prefix}_PASSWORD`])}`);
  }
  log("config", `  CACHE_DIR        = ${process.env.CACHE_DIR ?? "(not set)"}`);
  log("config", `  SCAN_ENABLED     = ${process.env.SCAN_ENABLED ?? "(not set, default: true)"}`);
  log("config", `  SCAN_HOUR        = ${process.env.SCAN_HOUR ?? "(not set, default: 3)"}`);
  log("config", `  SCAN_ON_START    = ${process.env.SCAN_ON_START ?? "(not set, default: false)"}`);
}

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
  logConfig();
  const [command, ...rest] = process.argv.slice(2);

  if (command === "serve") {
    const port = Number(process.env.WEBHOOK_PORT ?? "3000");
    await startServer(port);

    const qbClient = QBittorrentClient.fromEnv();
    const scanConfig = getScanConfig();
    if (scanConfig.enabled) {
      scheduleDaily(scanConfig.hour, () => scanAllTorrents(qbClient));
      if (scanConfig.onStart) {
        scanAllTorrents(qbClient).catch((err) =>
          log("scanner", `Initial scan failed: ${err}`),
        );
      }
    }
    return;
  }

  if (command === "scan") {
    const qbClient = QBittorrentClient.fromEnv();
    try {
      await scanAllTorrents(qbClient);
    } finally {
      await closeAll();
    }
    return;
  }

  // Backward-compatible CLI mode: first arg is site key
  if (command && command in SITES && rest.length > 0) {
    await runCli(command, rest);
    return;
  }

  console.log("Usage:");
  console.log("  node src/index.ts <site> <id1> <id2> ...   Thank specific torrents");
  console.log("  node src/index.ts serve                    Start webhook server + daily scan");
  console.log("  node src/index.ts scan                     Run scan once and exit");
  console.log(`\nAvailable sites: ${Object.keys(SITES).join(", ")}`);
  console.log("\nEnvironment variables:");
  console.log("  HDO_USERNAME, HDO_PASSWORD     HD-Olimpo credentials");
  console.log("  F1_USERNAME, F1_PASSWORD       F1Carreras credentials");
  console.log("  QBIT_URL                       qBittorrent WebUI URL");
  console.log("  QBIT_USERNAME                  qBittorrent WebUI username");
  console.log("  QBIT_PASSWORD                  qBittorrent WebUI password");
  console.log("  WEBHOOK_PORT                   Webhook server port (default: 3000)");
  console.log("  CACHE_DIR                      Browser session cache directory");
  console.log("  SCAN_ENABLED                   Enable daily scan (default: true)");
  console.log("  SCAN_HOUR                      Hour to run daily scan, 0-23 (default: 3)");
  console.log("  SCAN_ON_START                  Run scan on startup (default: false)");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[auto-thanks] Fatal error: ${message}`);
  process.exit(1);
});
