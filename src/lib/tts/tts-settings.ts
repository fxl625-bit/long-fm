export type DJVoicePreset = {
  id: string;
  label: string;
  provider: "edge_tts";
  voice: string;
  rate: string;
  pitch: string;
  description: string;
};

export type DJVoiceSettings = {
  presetId: string;
  provider: "edge_tts";
  voice: string;
  rate: string;
  pitch: string;
};

export const DJ_VOICE_PRESETS: DJVoicePreset[] = [
  {
    id: "night_male",
    label: "低声男声",
    provider: "edge_tts",
    voice: "zh-CN-YunjianNeural",
    rate: "-12%",
    pitch: "-4Hz",
    description: "更像深夜电台，低一点，慢一点",
  },
  {
    id: "warm_male",
    label: "温和男声",
    provider: "edge_tts",
    voice: "zh-CN-YunxiNeural",
    rate: "-8%",
    pitch: "-2Hz",
    description: "自然、温和、陪伴感",
  },
  {
    id: "soft_female",
    label: "温柔女声",
    provider: "edge_tts",
    voice: "zh-CN-XiaoxiaoNeural",
    rate: "-8%",
    pitch: "-2Hz",
    description: "轻一点，适合白天和咖啡馆感",
  },
  {
    id: "clear_female",
    label: "清亮女声",
    provider: "edge_tts",
    voice: "zh-CN-XiaoyiNeural",
    rate: "-5%",
    pitch: "+0Hz",
    description: "更清晰，适合普通播报",
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
    provider: "edge_tts",
    voice: input?.voice?.trim() || preset.voice,
    rate: input?.rate?.trim() || preset.rate,
    pitch: input?.pitch?.trim() || preset.pitch,
  };
}
