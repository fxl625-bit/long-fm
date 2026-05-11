import { createHash } from "node:crypto";
import { OpenAIDJProvider } from "./openai-dj-provider";

const cache = new Map<string, string>();

export type TTSMode = "subtitle_only" | "openai_tts" | "browser_tts";

function keyFor(text: string) {
  return createHash("sha1").update(text).digest("hex");
}

export async function synthesizeSpeechToDataUrl(text: string): Promise<string | null> {
  const normalized = text.trim();
  if (!normalized) {
    return null;
  }

  const key = keyFor(normalized);
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }

  try {
    const provider = new OpenAIDJProvider();
    const buffer = await provider.synthesizeSpeech(normalized);
    const dataUrl = `data:audio/mpeg;base64,${buffer.toString("base64")}`;
    cache.set(key, dataUrl);
    return dataUrl;
  } catch {
    return null;
  }
}

