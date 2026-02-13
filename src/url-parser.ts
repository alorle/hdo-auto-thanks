import { SITES } from "./config.js";

export type ParsedTorrentUrl = {
  siteKey: string;
  torrentId: string;
};

export function parseTorrentComment(comment: string): ParsedTorrentUrl | null {
  for (const [key, site] of Object.entries(SITES)) {
    const escaped = site.baseUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`${escaped}/torrents/(\\d+)`);
    const match = comment.match(pattern);
    if (match?.[1]) {
      return { siteKey: key, torrentId: match[1] };
    }
  }
  return null;
}
