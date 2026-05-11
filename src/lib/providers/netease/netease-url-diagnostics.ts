import type { MusicTrack } from "@/lib/types/music";
import { classifyNeteaseSongPlayableStatus } from "./netease-url-resolver";

export type ResolveOneFailureReason =
  | "no_url"
  | "vip_only"
  | "copyright_unavailable"
  | "cookie_missing"
  | "api_error"
  | "invalid_response";

export type ResolveOneAttempt = {
  endpoint: "song/url/v1" | "song/url";
  params: Record<string, string | number>;
  success: boolean;
  urlFound: boolean;
  urlPrefix: string | null;
  rawShape: string;
  code: number | null;
  fee: number | null;
  message: string;
};

export type ResolveOneDiagnostics = {
  songId: string;
  loggedIn: boolean;
  hasCookie: boolean;
  apiMode: "package" | "remote";
  attempts: ResolveOneAttempt[];
  final: {
    playable: boolean;
    audioUrl: string | null;
    reason: ResolveOneFailureReason | null;
  };
  debug: {
    rawKeys: string[];
    sampleRaw: unknown;
  };
};

export type NeteaseSongUrlDiagnosticsClient = {
  getSongUrlV1Raw: (songId: string, cookie: string, level: "standard" | "higher") => Promise<Record<string, unknown>>;
  getSongUrlRaw: (songId: string, cookie: string, br: number) => Promise<Record<string, unknown>>;
  getSongDetail?: (songId: string, cookie: string) => Promise<MusicTrack | null>;
};

type DiagnosticUrlResult = {
  url: string;
  code: number | null;
  fee: number | null;
  type: string | null;
  br: number | null;
  rawItem: Record<string, unknown>;
  rawShape: string;
};

type ResolveInput = {
  songId: string;
  cookie?: string | null;
  client: NeteaseSongUrlDiagnosticsClient;
  apiMode?: "package" | "remote";
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function toNumber(value: unknown): number | null {
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

function toRawKeys(raw: unknown) {
  const record = asRecord(raw);
  return record ? Object.keys(record).slice(0, 12) : [];
}

function toUrlPrefix(url?: string | null) {
  return url ? url.slice(0, 96) : null;
}

export function extractDiagnosticUrl(raw: unknown): DiagnosticUrlResult | null {
  const record = asRecord(raw);
  const bodyRecord = asRecord(record?.body);
  const dataRecord = asRecord(record?.data);
  const bodyData = Array.isArray(bodyRecord?.data) ? (bodyRecord.data as unknown[]) : [];
  const nestedData = Array.isArray(dataRecord?.data) ? (dataRecord.data as unknown[]) : [];
  const urls = Array.isArray(record?.urls) ? (record.urls as unknown[]) : [];
  const candidates: Array<{ item: unknown; rawShape: string }> = [
    { item: Array.isArray(record?.data) ? record?.data[0] : null, rawShape: "data[0].url" },
    { item: bodyData[0] ?? null, rawShape: "body.data[0].url" },
    { item: nestedData[0] ?? null, rawShape: "data.data[0].url" },
    { item: urls[0] ?? null, rawShape: "urls[0].url" },
    { item: record?.url ? raw : null, rawShape: "url" },
  ];

  for (const candidate of candidates) {
    const item = asRecord(candidate.item);
    if (!item || typeof item.url !== "string" || !item.url.trim()) {
      continue;
    }

    return {
      url: item.url,
      code: toNumber(item.code),
      fee: toNumber(item.fee),
      type: typeof item.type === "string" ? item.type : null,
      br: toNumber(item.br),
      rawItem: item,
      rawShape: candidate.rawShape,
    };
  }

  return null;
}

function mapReason(input: { url?: string | null; songMeta?: Record<string, unknown>; raw?: unknown }): ResolveOneFailureReason {
  const status = classifyNeteaseSongPlayableStatus(input).playableStatus;
  if (status === "vip_only") return "vip_only";
  if (status === "copyright_unavailable") return "copyright_unavailable";
  if (status === "no_url") return "no_url";
  if (status === "unknown") return "api_error";
  return "invalid_response";
}

function pickCode(raw: unknown) {
  const record = asRecord(raw);
  const directCode = toNumber(record?.code);
  if (directCode !== null) return directCode;
  const nestedData = Array.isArray(record?.data) ? asRecord(record?.data[0]) : null;
  const bodyRecord = asRecord(record?.body);
  const bodyData = Array.isArray(bodyRecord?.data) ? (bodyRecord.data as unknown[]) : [];
  const nestedBody = bodyData.length ? asRecord(bodyData[0]) : null;
  const urls = Array.isArray(record?.urls) ? (record.urls as unknown[]) : [];
  const nestedUrls = urls.length ? asRecord(urls[0]) : null;
  return toNumber(nestedData?.code) ?? toNumber(nestedBody?.code) ?? toNumber(nestedUrls?.code);
}

function toAttempt(params: ResolveOneAttempt["params"], endpoint: ResolveOneAttempt["endpoint"], raw: unknown, message = ""): ResolveOneAttempt {
  const extracted = extractDiagnosticUrl(raw);
  return {
    endpoint,
    params,
    success: true,
    urlFound: Boolean(extracted?.url),
    urlPrefix: toUrlPrefix(extracted?.url),
    rawShape: extracted?.rawShape ?? "none",
    code: extracted?.code ?? pickCode(raw),
    fee: extracted?.fee ?? null,
    message,
  };
}

export async function resolveOneSongUrlWithDiagnostics(input: ResolveInput): Promise<ResolveOneDiagnostics> {
  const cookie = input.cookie?.trim() ?? "";
  if (!cookie) {
    return {
      songId: input.songId,
      loggedIn: false,
      hasCookie: false,
      apiMode: input.apiMode ?? "remote",
      attempts: [],
      final: {
        playable: false,
        audioUrl: null,
        reason: "cookie_missing",
      },
      debug: {
        rawKeys: [],
        sampleRaw: null,
      },
    };
  }

  const songDetail = input.client.getSongDetail ? await input.client.getSongDetail(input.songId, cookie).catch(() => null) : null;
  const songMeta = songDetail?.rawMeta && typeof songDetail.rawMeta === "object" ? (songDetail.rawMeta as Record<string, unknown>) : undefined;
  const attempts: ResolveOneAttempt[] = [];
  let lastRaw: unknown = null;

  const runAttempt = async (
    endpoint: ResolveOneAttempt["endpoint"],
    params: ResolveOneAttempt["params"],
    executor: () => Promise<Record<string, unknown>>,
  ) => {
    try {
      const raw = await executor();
      lastRaw = raw;
      const attempt = toAttempt(params, endpoint, raw);
      attempts.push(attempt);
      const extracted = extractDiagnosticUrl(raw);
      if (extracted?.url) {
        return {
          playable: true as const,
          audioUrl: extracted.url,
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      attempts.push({
        endpoint,
        params,
        success: false,
        urlFound: false,
        urlPrefix: null,
        rawShape: "error",
        code: null,
        fee: null,
        message,
      });
      lastRaw = { error: message };
    }

    return null;
  };

  const orderedAttempts: Array<() => Promise<{ playable: true; audioUrl: string } | null>> = [
    () => runAttempt("song/url/v1", { id: input.songId, level: "standard" }, () => input.client.getSongUrlV1Raw(input.songId, cookie, "standard")),
    () => runAttempt("song/url/v1", { id: input.songId, level: "higher" }, () => input.client.getSongUrlV1Raw(input.songId, cookie, "higher")),
    () => runAttempt("song/url", { id: input.songId, br: 128000 }, () => input.client.getSongUrlRaw(input.songId, cookie, 128000)),
    () => runAttempt("song/url", { id: input.songId, br: 320000 }, () => input.client.getSongUrlRaw(input.songId, cookie, 320000)),
  ];

  for (const attempt of orderedAttempts) {
    const resolved = await attempt();
    if (resolved) {
      return {
        songId: input.songId,
        loggedIn: true,
        hasCookie: true,
        apiMode: input.apiMode ?? "remote",
        attempts,
        final: {
          playable: true,
          audioUrl: resolved.audioUrl,
          reason: null,
        },
        debug: {
          rawKeys: toRawKeys(lastRaw),
          sampleRaw: lastRaw,
        },
      };
    }
  }

  return {
    songId: input.songId,
    loggedIn: true,
    hasCookie: true,
    apiMode: input.apiMode ?? "remote",
    attempts,
    final: {
      playable: false,
      audioUrl: null,
      reason: mapReason({ url: null, songMeta, raw: lastRaw }),
    },
    debug: {
      rawKeys: toRawKeys(lastRaw),
      sampleRaw: lastRaw,
    },
  };
}
