function normalizeNumericId(raw: unknown): string | null {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return String(Math.floor(raw));
  }

  if (typeof raw !== "string") {
    return null;
  }

  const trimmed = raw.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) {
    return null;
  }

  return trimmed;
}

export function buildNeteaseSongExternalUrl(songId: unknown): string | undefined {
  const normalized = normalizeNumericId(songId);
  if (!normalized) {
    return undefined;
  }
  return `https://music.163.com/#/song?id=${normalized}`;
}

export function buildNeteasePlaylistExternalUrl(playlistId: unknown): string | undefined {
  const normalized = normalizeNumericId(playlistId);
  if (!normalized) {
    return undefined;
  }
  return `https://music.163.com/#/playlist?id=${normalized}`;
}

export function isValidExternalUrl(raw: unknown): raw is string {
  if (typeof raw !== "string" || !raw.trim()) {
    return false;
  }

  try {
    const parsed = new URL(raw);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

