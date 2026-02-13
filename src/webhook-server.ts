import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { log } from "./log.js";
import { SITES, getSiteCredentials } from "./config.js";
import { QBittorrentClient } from "./qbittorrent.js";
import { parseTorrentComment } from "./url-parser.js";
import { getPage, enqueue, closeAll } from "./browser.js";
import { thankTorrent } from "./thanks.js";

const PREFIX = "webhook";

// Radarr/Sonarr webhook payload (only fields we use)
type WebhookPayload = {
  eventType?: string;
  downloadId?: string;
  release?: {
    downloadId?: string;
  };
  movie?: { title?: string };
  series?: { title?: string };
};

function extractHash(payload: WebhookPayload): string | null {
  return payload.downloadId ?? payload.release?.downloadId ?? null;
}

function extractTitle(payload: WebhookPayload): string {
  return payload.movie?.title ?? payload.series?.title ?? "unknown";
}

function jsonResponse(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

async function handleWebhook(
  req: IncomingMessage,
  res: ServerResponse,
  source: string,
  qbClient: QBittorrentClient,
): Promise<void> {
  let payload: WebhookPayload;
  try {
    const body = await readBody(req);
    payload = JSON.parse(body) as WebhookPayload;
  } catch {
    jsonResponse(res, 400, { error: "Invalid JSON body." });
    return;
  }

  if (payload.eventType !== "Grab") {
    log(PREFIX, `[${source}] Ignoring event: ${payload.eventType ?? "unknown"}`);
    jsonResponse(res, 200, { status: "ignored", reason: `Event type "${payload.eventType}" is not "Grab".` });
    return;
  }

  const hash = extractHash(payload);
  if (!hash) {
    jsonResponse(res, 400, { error: "No downloadId found in payload." });
    return;
  }

  const title = extractTitle(payload);
  log(PREFIX, `[${source}] Grab event for "${title}" (hash: ${hash})`);

  // Respond immediately — processing happens async
  jsonResponse(res, 200, { status: "accepted", hash });

  // Process in the background
  processGrab(source, hash, title, qbClient).catch((err) => {
    log(PREFIX, `[${source}] Error processing grab for "${title}": ${err}`);
  });
}

async function processGrab(
  source: string,
  hash: string,
  title: string,
  qbClient: QBittorrentClient,
): Promise<void> {
  log(PREFIX, `[${source}] Querying qBittorrent for torrent comment (hash: ${hash})...`);
  const comment = await qbClient.getTorrentCommentWithRetry(hash);

  const parsed = parseTorrentComment(comment);
  if (!parsed) {
    log(PREFIX, `[${source}] No matching site URL in comment: "${comment}". Skipping.`);
    return;
  }

  const site = SITES[parsed.siteKey];
  if (!site) {
    log(PREFIX, `[${source}] Unknown site key "${parsed.siteKey}". Skipping.`);
    return;
  }

  log(PREFIX, `[${source}] Matched ${site.name} torrent ${parsed.torrentId} for "${title}".`);

  let credentials: { username: string; password: string };
  try {
    credentials = getSiteCredentials(site);
  } catch (err) {
    log(PREFIX, `[${source}] Missing credentials for ${site.name}: ${err}`);
    return;
  }

  const logPrefix = `auto-thanks:${site.name}`;
  await enqueue(parsed.siteKey, async () => {
    const page = await getPage(parsed.siteKey);
    await thankTorrent(page, parsed.torrentId, credentials.username, credentials.password, site, logPrefix);
  });

  log(PREFIX, `[${source}] Done processing "${title}".`);
}

export async function startServer(port: number): Promise<void> {
  const qbClient = QBittorrentClient.fromEnv();

  const server = createServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      jsonResponse(res, 200, { status: "healthy" });
      return;
    }
    if (req.method === "POST" && req.url === "/webhook/radarr") {
      handleWebhook(req, res, "radarr", qbClient).catch((err) => {
        log(PREFIX, `Unhandled error in radarr handler: ${err}`);
        if (!res.headersSent) jsonResponse(res, 500, { error: "Internal server error." });
      });
      return;
    }
    if (req.method === "POST" && req.url === "/webhook/sonarr") {
      handleWebhook(req, res, "sonarr", qbClient).catch((err) => {
        log(PREFIX, `Unhandled error in sonarr handler: ${err}`);
        if (!res.headersSent) jsonResponse(res, 500, { error: "Internal server error." });
      });
      return;
    }
    jsonResponse(res, 404, { error: "Not found." });
  });

  const shutdown = async (signal: string) => {
    log(PREFIX, `${signal} received, shutting down...`);
    server.close();
    await closeAll();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  server.listen(port, () => {
    log(PREFIX, `Listening on port ${port}`);
    log(PREFIX, "Endpoints: POST /webhook/radarr, POST /webhook/sonarr, GET /health");
  });
}
