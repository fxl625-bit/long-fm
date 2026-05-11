import type { TTSRequest, TTSResult, TTSVoice } from "./tts-types";

export type { TTSProviderId, TTSProviderStatus, TTSRequest, TTSResult, TTSStyle, TTSVoice } from "./tts-types";

export interface TTSProvider {
  id: string;
  isAvailable(): Promise<boolean>;
  listVoices(): Promise<TTSVoice[]>;
  synthesize(request: TTSRequest): Promise<TTSResult>;
}
