// A real toggle, not a framework: flip to false to hide the panel without touching the
// upload/playlist logic - satisfies "feature-flag it, never block export on it" without
// building a config service for one flag.
export const FPP_CONNECT_ENABLED = true;

// M8: FPP Connect (Chromium path), per SPEC ch16 §3.2 + ch14 §1.4/2.1/2.4 exactly.
// Browsers can't do the UDP-based instance discovery xLights uses (multicast ping on
// 239.70.80.80:32320) - "discover FPP" here means the user enters a host and we verify
// it's really an FPP via GET /api/system/info, same as the SPEC's documented fallback.
export interface FppSystemInfo {
  HostName: string;
  Version: string;
  Mode: string;
}

// Chrome 142+ ships the Local Network Access permission that exempts private-IP/`.local`
// fetches from mixed-content blocking (SPEC ch16 §3.2). Firefox/Safari have no equivalent -
// an HTTPS page's fetch to http://<lan-host> is simply blocked there, so those browsers get
// the guided-download fallback instead of a broken upload button.
export function isChromiumLanCapable(): boolean {
  const brands = (navigator as unknown as { userAgentData?: { brands?: Array<{ brand: string }> } }).userAgentData?.brands;
  if (brands) return brands.some((b) => b.brand === "Chromium");
  // No Client Hints support: fall back to UA sniffing. Edge is Chromium too (ships the
  // same LNA feature) and its UA string also contains "Chrome/", so it's included here -
  // only exclude engines that fake a Chrome/ token without being Chromium (none currently
  // relevant), not Chromium-family browsers themselves.
  return /Chrome\//.test(navigator.userAgent);
}

function fppUrl(host: string, path: string): string {
  const clean = host.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return `http://${clean}${path}`;
}

export async function getFppSystemInfo(host: string): Promise<FppSystemInfo> {
  const res = await fetch(fppUrl(host, "/api/system/info"));
  if (!res.ok) throw new Error(`FPP at ${host} responded ${res.status}`);
  return res.json();
}

// Legacy upload path (SPEC ch16 §3.2 / ch14 §2.1): passes FPP's CORS preflight because it's
// a plain POST with only Content-Type set - no custom headers (X-Requested-With is dropped
// per the goal prompt's exact instruction, since Allow-Headers doesn't include it).
export async function uploadFseqToFpp(host: string, filename: string, bytes: Uint8Array): Promise<void> {
  const uploadRes = await fetch(fppUrl(host, `/api/file/uploads/${encodeURIComponent(filename)}`), {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: bytes as unknown as BodyInit,
  });
  if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`);

  const moveRes = await fetch(fppUrl(host, `/api/file/move/${encodeURIComponent(filename)}`));
  if (!moveRes.ok) throw new Error(`Move into sequences/ failed: ${moveRes.status}`);
}

interface FppPlaylistEntry {
  type: "sequence" | "both";
  enabled: 1;
  playOnce: 0;
  sequenceName: string;
  mediaName?: string;
  videoOut?: string;
  duration: number;
}

interface FppPlaylist {
  name?: string;
  playlistInfo?: { total_items?: number; total_duration?: number };
  mainPlaylist?: FppPlaylistEntry[];
  random?: 0;
  [key: string]: unknown;
}

// SPEC ch14 §2.4: GET-merge-POST - appends one entry to mainPlaylist, recomputes
// playlistInfo.total_items/total_duration, preserves/creates random:0.
export async function syncPlaylist(host: string, playlistName: string, sequenceName: string, durationSec: number, mediaName?: string): Promise<void> {
  const getRes = await fetch(fppUrl(host, `/api/playlist/${encodeURIComponent(playlistName)}`));
  const existing: FppPlaylist = getRes.ok ? await getRes.json() : {};

  const entry: FppPlaylistEntry = mediaName
    ? { type: "both", enabled: 1, playOnce: 0, sequenceName, mediaName, videoOut: "--Default--", duration: durationSec }
    : { type: "sequence", enabled: 1, playOnce: 0, sequenceName, duration: durationSec };

  const mainPlaylist = [...(existing.mainPlaylist ?? []), entry];
  const updated: FppPlaylist = {
    ...existing,
    name: playlistName,
    mainPlaylist,
    playlistInfo: {
      ...existing.playlistInfo,
      total_items: mainPlaylist.length,
      total_duration: mainPlaylist.reduce((sum, e) => sum + e.duration, 0),
    },
    random: existing.random ?? 0,
  };

  const postRes = await fetch(fppUrl(host, `/api/playlist/${encodeURIComponent(playlistName)}`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updated),
  });
  if (!postRes.ok) throw new Error(`Playlist sync failed: ${postRes.status}`);
}
