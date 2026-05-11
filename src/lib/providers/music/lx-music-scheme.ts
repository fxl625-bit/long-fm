const LX_SCHEME_PREFIX = "lxmusic://";

function encodeSegment(value: string) {
  return encodeURIComponent(value).replace(/%2F/g, "/");
}

export function buildLXSearchPlayUrl(name: string, singer?: string) {
  const query = singer?.trim() ? `${name.trim()}-${singer.trim()}` : name.trim();
  return `${LX_SCHEME_PREFIX}music/searchPlay/${encodeSegment(query)}`;
}

export function buildLXPlayerPlayUrl() {
  return `${LX_SCHEME_PREFIX}player/play`;
}

export function buildLXPlayerPauseUrl() {
  return `${LX_SCHEME_PREFIX}player/pause`;
}

export function buildLXSkipNextUrl() {
  return `${LX_SCHEME_PREFIX}player/skipNext`;
}

export function buildLXSkipPrevUrl() {
  return `${LX_SCHEME_PREFIX}player/skipPrev`;
}

export function buildLXSonglistPlayUrl(source: string, idOrUrl: string) {
  return `${LX_SCHEME_PREFIX}songlist/play/${encodeSegment(source)}/${encodeSegment(idOrUrl)}`;
}

export function openLXScheme(url: string) {
  if (typeof window !== "undefined") {
    window.location.href = url;
  }
  return url;
}
