"use client";

import { DEFAULT_DJ_VOICE_PRESET, normalizeDJVoiceSettings, type DJVoiceSettings } from "./tts-settings";

export const DJ_VOICE_SETTINGS_STORAGE_KEY = "ai-radio-dj-voice-settings";
export const DJ_VOICE_SETTINGS_EVENT = "ai-radio-dj-voice-settings-change";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function getDefaultDJVoiceSettings(): DJVoiceSettings {
  return normalizeDJVoiceSettings({
    presetId: DEFAULT_DJ_VOICE_PRESET.id,
    voice: DEFAULT_DJ_VOICE_PRESET.voice,
    rate: DEFAULT_DJ_VOICE_PRESET.rate,
    pitch: DEFAULT_DJ_VOICE_PRESET.pitch,
  });
}

export function readDJVoiceSettings(): DJVoiceSettings {
  if (!canUseStorage()) {
    return getDefaultDJVoiceSettings();
  }

  try {
    const raw = window.localStorage.getItem(DJ_VOICE_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return getDefaultDJVoiceSettings();
    }
    return normalizeDJVoiceSettings(JSON.parse(raw) as Partial<DJVoiceSettings>);
  } catch {
    return getDefaultDJVoiceSettings();
  }
}

export function writeDJVoiceSettings(input: Partial<DJVoiceSettings>) {
  if (!canUseStorage()) {
    return getDefaultDJVoiceSettings();
  }

  const next = normalizeDJVoiceSettings(input);
  window.localStorage.setItem(DJ_VOICE_SETTINGS_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent<DJVoiceSettings>(DJ_VOICE_SETTINGS_EVENT, { detail: next }));
  return next;
}

export function subscribeDJVoiceSettings(listener: (settings: DJVoiceSettings) => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleCustom = (event: Event) => {
    const detail = (event as CustomEvent<DJVoiceSettings>).detail;
    listener(detail ?? readDJVoiceSettings());
  };
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== DJ_VOICE_SETTINGS_STORAGE_KEY) {
      return;
    }
    listener(readDJVoiceSettings());
  };

  window.addEventListener(DJ_VOICE_SETTINGS_EVENT, handleCustom);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(DJ_VOICE_SETTINGS_EVENT, handleCustom);
    window.removeEventListener("storage", handleStorage);
  };
}
