export type DJVoiceProvider = "volcengine" | "edge_tts" | "openai";

export const EDGE_TTS_DEFAULT_VOICE = "zh-CN-XiaoxiaoNeural";
export const OPENAI_TTS_DEFAULT_VOICE = "marin";
export const VOLCENGINE_DEFAULT_VOICE = "zh_female_shuangkuaisisi_moon_bigtts";

export type DJVoicePreset = {
  id: string;
  label: string;
  provider: DJVoiceProvider;
  voice: string;
  rate: string;
  pitch: string;
  description: string;
};

export type DJVoiceSettings = {
  presetId: string;
  provider: DJVoiceProvider;
  voice: string;
  rate: string;
  pitch: string;
};

export const DJ_VOICE_PRESETS: DJVoicePreset[] = [
  {
    id: "natural_warm",
    label: "Natural Warm",
    provider: "volcengine",
    voice: "zh_female_shuangkuaisisi_moon_bigtts",
    rate: "-5%",
    pitch: "+0Hz",
    description: "Default DJ voice using Volcengine TTS with a natural, warm female tone.",
  },
  {
    id: "volc_male_warm",
    label: "Volc Male Warm",
    provider: "volcengine",
    voice: "zh_male_wennuanqingnian_moon_bigtts",
    rate: "-8%",
    pitch: "+0Hz",
    description: "A warm male Volcengine voice for a more mature DJ tone.",
  },
  {
    id: "volc_calm_female",
    label: "Volc Calm Female",
    provider: "volcengine",
    voice: "zh_female_chenwenjingjing_moon_bigtts",
    rate: "-10%",
    pitch: "+0Hz",
    description: "A calmer, slower female voice for night or quiet segments.",
  },
  {
    id: "edge_female",
    label: "Edge Female",
    provider: "edge_tts",
    voice: "zh-CN-XiaoxiaoNeural",
    rate: "-8%",
    pitch: "-2Hz",
    description: "Edge TTS fallback with Xiaoxiao female voice.",
  },
  {
    id: "edge_male",
    label: "Edge Male",
    provider: "edge_tts",
    voice: "zh-CN-YunxiNeural",
    rate: "-8%",
    pitch: "-2Hz",
    description: "Edge TTS fallback with Yunxi male voice.",
  },
];

export const DEFAULT_DJ_VOICE_PRESET = DJ_VOICE_PRESETS[0];

export function getDJVoicePreset(presetId?: string | null) {
  return DJ_VOICE_PRESETS.find((preset) => preset.id === presetId) ?? DEFAULT_DJ_VOICE_PRESET;
}

export function normalizeDJVoiceSettings(input?: Partial<DJVoiceSettings> | null): DJVoiceSettings {
  const preset = getDJVoicePreset(input?.presetId);

  return {
    presetId: preset.id,
    provider: input?.provider ?? preset.provider,
    voice: input?.voice?.trim() || preset.voice,
    rate: input?.rate?.trim() || preset.rate,
    pitch: input?.pitch?.trim() || preset.pitch,
  };
}
