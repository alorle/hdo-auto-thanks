import { log } from "./log.js";
import { getRequiredEnv } from "./config.js";

const PREFIX = "qbittorrent";

type TorrentProperties = {
  comment: string;
};

type TorrentInfo = {
  hash: string;
  name: string;
};

type QBittorrentConfig = {
  baseUrl: string;
  username: string;
  password: string;
};

export class QBittorrentClient {
  private config: QBittorrentConfig;
  private sid: string | null = null;

  constructor(config: QBittorrentConfig) {
    this.config = config;
  }

  static fromEnv(): QBittorrentClient {
    return new QBittorrentClient({
      baseUrl: getRequiredEnv("QBIT_URL"),
      username: getRequiredEnv("QBIT_USERNAME"),
      password: getRequiredEnv("QBIT_PASSWORD"),
    });
  }

  private async login(): Promise<void> {
    const res = await fetch(`${this.config.baseUrl}/api/v2/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        username: this.config.username,
        password: this.config.password,
      }),
    });

    const body = await res.text();
    if (!res.ok) {
      throw new Error(`qBittorrent login failed: HTTP ${res.status} ${res.statusText}`);
    }
    if (body !== "Ok.") {
      throw new Error(`qBittorrent login failed: ${body} (check credentials or IP ban)`);
    }

    const cookie = res.headers.get("set-cookie");
    const sidMatch = cookie?.match(/SID=([^;]+)/);
    if (!sidMatch?.[1]) {
      throw new Error("qBittorrent login failed: no SID cookie received.");
    }
    this.sid = sidMatch[1];
    log(PREFIX, "Authenticated with qBittorrent.");
  }

  async getTorrentComment(hash: string): Promise<string> {
    if (!this.sid) await this.login();

    const res = await fetch(
      `${this.config.baseUrl}/api/v2/torrents/properties?hash=${hash.toLowerCase()}`,
      { headers: { Cookie: `SID=${this.sid}` } },
    );

    if (res.status === 403) {
      this.sid = null;
      await this.login();
      return this.getTorrentComment(hash);
    }

    if (!res.ok) {
      throw new Error(`qBittorrent API error: ${res.status} ${res.statusText}`);
    }

    const props = (await res.json()) as TorrentProperties;
    return props.comment;
  }

  async getTorrentCommentWithRetry(
    hash: string,
    maxAttempts = 5,
    initialDelayMs = 5000,
  ): Promise<string> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const comment = await this.getTorrentComment(hash);
        if (comment) return comment;
        log(PREFIX, `Torrent ${hash} has empty comment (attempt ${attempt}/${maxAttempts}).`);
      } catch (err) {
        if (attempt === maxAttempts) throw err;
        log(PREFIX, `Error fetching torrent ${hash} (attempt ${attempt}/${maxAttempts}): ${err}`);
      }

      if (attempt < maxAttempts) {
        const delay = initialDelayMs * Math.pow(2, attempt - 1);
        log(PREFIX, `Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw new Error(`Torrent ${hash} comment still empty after ${maxAttempts} attempts.`);
  }

  async listTorrents(): Promise<TorrentInfo[]> {
    if (!this.sid) await this.login();

    const res = await fetch(`${this.config.baseUrl}/api/v2/torrents/info`, {
      headers: { Cookie: `SID=${this.sid}` },
    });

    if (res.status === 403) {
      this.sid = null;
      await this.login();
      return this.listTorrents();
    }

    if (!res.ok) {
      throw new Error(`qBittorrent API error: ${res.status} ${res.statusText}`);
    }

    return (await res.json()) as TorrentInfo[];
  }
}
