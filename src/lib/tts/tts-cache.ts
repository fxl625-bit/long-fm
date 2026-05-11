import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import type { TTSProviderId } from "./tts-types";

type CacheIdentity = {
  provider: TTSProviderId;
  voice?: string;
  rate?: string;
  speed?: number;
  pitch?: number | string;
  text: string;
};

export type TTSCacheMetadata = {
  cacheKey: string;
  publicUrl: string;
  filePath: string;
  text: string;
  provider: TTSProviderId;
  voice?: string;
  rate?: string;
  pitch?: string;
  createdAt: string;
  durationMs?: number;
};

type TTSCacheOptions = {
  publicDir?: string;
  publicUrlBase?: string;
};

export class TTSCache {
  private readonly publicDir: string;
  private readonly publicUrlBase: string;

  constructor(options: TTSCacheOptions = {}) {
    this.publicDir = options.publicDir ?? resolve(process.cwd(), "public", "tts-cache");
    this.publicUrlBase = options.publicUrlBase ?? "/tts-cache";
    this.ensureDirectory();
  }

  resolve(identity: CacheIdentity) {
    const cacheKey = createHash("sha1")
      .update(JSON.stringify({
        provider: identity.provider,
        voice: identity.voice ?? "",
        rate: identity.rate ?? (typeof identity.speed === "number" ? `${identity.speed}` : ""),
        pitch: typeof identity.pitch === "string" ? identity.pitch : typeof identity.pitch === "number" ? `${identity.pitch}` : "",
        text: identity.text.trim(),
      }))
      .digest("hex");

    return {
      cacheKey,
      filePath: join(this.publicDir, `${cacheKey}.mp3`),
      metadataPath: join(this.publicDir, `${cacheKey}.json`),
      publicUrl: `${this.publicUrlBase}/${cacheKey}.mp3`,
    };
  }

  async get(identity: CacheIdentity) {
    const entry = this.resolve(identity);
    if (!existsSync(entry.filePath)) {
      return null;
    }

    let metadata: TTSCacheMetadata = {
      cacheKey: entry.cacheKey,
      publicUrl: entry.publicUrl,
      filePath: entry.filePath,
      text: identity.text.trim(),
      provider: identity.provider,
      voice: identity.voice,
      rate: identity.rate,
      pitch: typeof identity.pitch === "string" ? identity.pitch : undefined,
      createdAt: new Date().toISOString(),
    };

    if (existsSync(entry.metadataPath)) {
      try {
        metadata = JSON.parse(readFileSync(entry.metadataPath, "utf8")) as TTSCacheMetadata;
      } catch {
        metadata = { ...metadata };
      }
    }

    return {
      ...entry,
      metadata,
    };
  }

  writeAudio(filePath: string, buffer: Buffer) {
    this.ensureDirectory();
    writeFileSync(filePath, buffer);
  }

  writeMetadata(metadata: TTSCacheMetadata) {
    this.ensureDirectory();
    writeFileSync(join(this.publicDir, `${metadata.cacheKey}.json`), JSON.stringify(metadata, null, 2), "utf8");
  }

  private ensureDirectory() {
    if (!existsSync(this.publicDir)) {
      mkdirSync(this.publicDir, { recursive: true });
    }
  }
}
