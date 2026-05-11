import type { NeteaseSongUrlResult } from "./netease-types";

type SongMeta = Record<string, unknown> | undefined;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function hasCopyrightRestriction(songMeta?: SongMeta) {
  if (!songMeta) return false;
  if (songMeta.noCopyrightRcmd && typeof songMeta.noCopyrightRcmd === "object") {
    return true;
  }
  const privilege = songMeta.privilege;
  if (privilege && typeof privilege === "object") {
    const cp = asNumber((privilege as Record<string, unknown>).cp);
    if (cp === 0) {
      return true;
    }
  }
  return false;
}

function isVipOnly(songMeta?: SongMeta) {
  if (!songMeta) return false;
  const fee = asNumber(songMeta.fee);
  if (fee === 1 || fee === 4 || fee === 8) {
    return true;
  }
  const privilege = songMeta.privilege;
  if (privilege && typeof privilege === "object") {
    const feeValue = asNumber((privilege as Record<string, unknown>).fee);
    if (feeValue === 1 || feeValue === 4 || feeValue === 8) {
      return true;
    }
  }
  return false;
}

export function classifyNeteaseSongPlayableStatus(input: {
  url?: string | null;
  songMeta?: SongMeta;
  raw?: unknown;
}): Pick<NeteaseSongUrlResult, "playableStatus" | "reason"> {
  if (input.url?.trim()) {
    return {
      playableStatus: "playable",
      reason: "Playable URL resolved",
    };
  }

  if (hasCopyrightRestriction(input.songMeta)) {
    return {
      playableStatus: "copyright_unavailable",
      reason: "Song is unavailable because of copyright restrictions",
    };
  }

  if (isVipOnly(input.songMeta)) {
    return {
      playableStatus: "vip_only",
      reason: "Song requires VIP playback",
    };
  }

  const raw = asRecord(input.raw);
  const fee = asNumber(raw?.fee);
  if (fee === 1 || fee === 4 || fee === 8) {
    return {
      playableStatus: "vip_only",
      reason: "Song requires VIP playback",
    };
  }

  const code = asNumber(raw?.code);
  if (code !== null && code >= 400) {
    return {
      playableStatus: "unknown",
      reason: "Song URL API returned an error status",
    };
  }

  return {
    playableStatus: "no_url",
    reason: "Song URL is missing",
  };
}
