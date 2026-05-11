import { readServerEnvVar } from "@/lib/config/server-env";
import { EdgeTTSProvider } from "./edge-tts-provider";
import { KokoroTTSProvider } from "./kokoro-tts-provider";
import { OpenAITTSProvider } from "./openai-tts-provider";
import { PiperTTSProvider } from "./piper-tts-provider";
import { SubtitleTTSProvider } from "./subtitle-tts-provider";
import type { TTSProvider, TTSProviderId, TTSProviderStatus, TTSRequest, TTSResult } from "./tts-provider";
import { isTTSProviderId } from "./tts-types";

type TTSManagerOptions = {
  providerOrder?: TTSProviderId[];
  fallbackProvider?: TTSProviderId;
  providers?: Partial<Record<TTSProviderId, TTSProvider>>;
};

function resolveProviderOrder(): TTSProviderId[] {
  const preferred = readServerEnvVar("TTS_PROVIDER");
  const primary = isTTSProviderId(preferred) ? preferred : "edge_tts";
  const ordered: TTSProviderId[] = ["edge_tts", "kokoro", "piper", "openai", "subtitle_only"];
  return [primary, ...ordered.filter((item) => item !== primary)];
}

function resolveFallbackProvider(): TTSProviderId {
  const fallback = readServerEnvVar("TTS_FALLBACK_PROVIDER");
  return isTTSProviderId(fallback) ? fallback : "subtitle_only";
}

export class TTSManager {
  private readonly providers: Record<TTSProviderId, TTSProvider>;
  private readonly providerOrder: TTSProviderId[];
  private readonly fallbackProvider: TTSProviderId;

  constructor(options: TTSManagerOptions = {}) {
    this.providers = {
      edge_tts: options.providers?.edge_tts ?? new EdgeTTSProvider(),
      kokoro: options.providers?.kokoro ?? new KokoroTTSProvider(),
      piper: options.providers?.piper ?? new PiperTTSProvider(),
      openai: options.providers?.openai ?? new OpenAITTSProvider(),
      subtitle_only: options.providers?.subtitle_only ?? new SubtitleTTSProvider(),
    };
    this.providerOrder = options.providerOrder ?? resolveProviderOrder();
    this.fallbackProvider = options.fallbackProvider ?? resolveFallbackProvider();
  }

  async synthesize(request: TTSRequest): Promise<TTSResult> {
    const explicit = request.provider && isTTSProviderId(request.provider) ? [request.provider] : [];
    const ordered = [...explicit, ...this.providerOrder.filter((item) => !explicit.includes(item))];
    const uniqueOrder = Array.from(new Set([...ordered, this.fallbackProvider, "subtitle_only"])) as TTSProviderId[];

    for (const providerId of uniqueOrder) {
      const provider = this.providers[providerId];
      const available = await provider.isAvailable().catch(() => false);
      if (!available) {
        continue;
      }

      try {
        return await provider.synthesize({ ...request, provider: providerId });
      } catch {
        continue;
      }
    }

    return this.providers.subtitle_only.synthesize({ ...request, provider: "subtitle_only" });
  }

  async getStatus(): Promise<{
    currentProvider: TTSProviderId;
    fallbackProvider: TTSProviderId;
    statuses: TTSProviderStatus[];
  }> {
    const statuses = await Promise.all(
      (Object.keys(this.providers) as TTSProviderId[]).map(async (id) => {
        const provider = this.providers[id];
        const available = await provider.isAvailable().catch(() => false);
        const voices = available ? await provider.listVoices().catch(() => []) : [];
        return { id, available, voices };
      }),
    );

    return {
      currentProvider: this.providerOrder[0] ?? "edge_tts",
      fallbackProvider: this.fallbackProvider,
      statuses,
    };
  }
}
