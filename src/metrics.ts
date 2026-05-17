import {
  Registry,
  Counter,
  Histogram,
  Gauge,
  collectDefaultMetrics,
} from "prom-client";

export const registry = new Registry();

registry.setDefaultLabels({ app: "hdo-auto-thanks" });
collectDefaultMetrics({ register: registry });

// --- Webhook metrics ---

export const webhooksReceived = new Counter({
  name: "hdo_webhooks_received_total",
  help: "Total webhook events received",
  labelNames: ["source", "event_type"] as const,
  registers: [registry],
});

export const webhookProcessingDuration = new Histogram({
  name: "hdo_webhook_processing_duration_seconds",
  help: "Time to process a webhook grab event end-to-end",
  labelNames: ["source", "site"] as const,
  buckets: [1, 5, 10, 30, 60, 120, 300],
  registers: [registry],
});

// --- Thank metrics ---

export const torrentsThanked = new Counter({
  name: "hdo_torrents_thanked_total",
  help: "Total torrents successfully thanked",
  labelNames: ["site"] as const,
  registers: [registry],
});

export const torrentsSkipped = new Counter({
  name: "hdo_torrents_skipped_total",
  help: "Total torrents skipped (already thanked or no button)",
  labelNames: ["site", "reason"] as const,
  registers: [registry],
});

export const torrentsErrored = new Counter({
  name: "hdo_torrents_errored_total",
  help: "Total torrent processing errors",
  labelNames: ["site"] as const,
  registers: [registry],
});

export const thankDuration = new Histogram({
  name: "hdo_thank_duration_seconds",
  help: "Time to thank a single torrent (navigation + click)",
  labelNames: ["site"] as const,
  buckets: [1, 2, 5, 10, 20, 30, 60],
  registers: [registry],
});

// --- Scanner metrics ---

export const scansCompleted = new Counter({
  name: "hdo_scans_completed_total",
  help: "Total scan runs completed",
  labelNames: ["status"] as const,
  registers: [registry],
});

export const scanDuration = new Histogram({
  name: "hdo_scan_duration_seconds",
  help: "Time to complete a full scan",
  buckets: [10, 30, 60, 120, 300, 600, 1800],
  registers: [registry],
});

export const scanTorrentsProcessed = new Gauge({
  name: "hdo_scan_last_torrents_processed",
  help: "Number of torrents processed in the last scan",
  labelNames: ["result"] as const,
  registers: [registry],
});

// --- qBittorrent API metrics ---

export const qbitApiDuration = new Histogram({
  name: "hdo_qbittorrent_api_duration_seconds",
  help: "qBittorrent API call duration",
  labelNames: ["endpoint"] as const,
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [registry],
});

export const qbitApiErrors = new Counter({
  name: "hdo_qbittorrent_api_errors_total",
  help: "Total qBittorrent API errors",
  labelNames: ["endpoint"] as const,
  registers: [registry],
});

// --- Login metrics ---

export const logins = new Counter({
  name: "hdo_logins_total",
  help: "Total site login attempts",
  labelNames: ["site", "status"] as const,
  registers: [registry],
});
