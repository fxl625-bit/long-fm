"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2 } from "lucide-react";
import { DJ_VOICE_PRESETS, getDJVoicePreset } from "@/lib/tts/tts-settings";
import { readDJVoiceSettings, subscribeDJVoiceSettings, writeDJVoiceSettings } from "@/lib/tts/tts-settings-store";

const PREVIEW_TEXT = "这里是 Auralia。声音已经切过来了。";

export function VoiceSelector() {
  const [settings, setSettings] = useState(() => readDJVoiceSettings());
  const [previewing, setPreviewing] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => subscribeDJVoiceSettings(setSettings), []);

  const applyPreset = (presetId: string) => {
    const preset = getDJVoicePreset(presetId);
    const next = writeDJVoiceSettings({
      presetId: preset.id,
      voice: preset.voice,
      rate: preset.rate,
      pitch: preset.pitch,
    });
    setSettings(next);
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.currentTime = 0;
    }
  };

  const previewVoice = async () => {
    const current = readDJVoiceSettings();
    setPreviewing(true);
    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: PREVIEW_TEXT,
          provider: current.provider,
          voice: current.voice,
          rate: current.rate,
          pitch: current.pitch,
          style: "night_radio",
        }),
      });
      const payload = (await response.json().catch(() => null)) as { mode?: "audio" | "subtitle_only"; audioUrl?: string } | null;
      if (payload?.mode !== "audio" || !payload.audioUrl) {
        return;
      }

      previewAudioRef.current?.pause();
      const audio = new Audio(payload.audioUrl);
      previewAudioRef.current = audio;
      await audio.play().catch(() => undefined);
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <details className="mt-4 rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-zinc-300">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
        <Volume2 className="h-3.5 w-3.5" />
        主持人声音
      </summary>
      <div className="mt-3 grid gap-2">
        {DJ_VOICE_PRESETS.map((preset) => {
          const selected = settings.presetId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyPreset(preset.id)}
              className={`rounded-2xl border px-3 py-3 text-left transition ${
                selected
                  ? "border-emerald-300/50 bg-emerald-300/10 text-emerald-100"
                  : "border-white/10 bg-black/10 text-zinc-300 hover:bg-white/10"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold">{preset.label}</span>
                <span className="text-[11px] text-zinc-400">
                  {preset.voice.replace("zh-CN-", "").replace("Neural", "")}
                </span>
              </div>
              <p className="mt-1 text-xs leading-5 text-zinc-400">{preset.description}</p>
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-zinc-500">
        <span>
          当前：{settings.voice} · {settings.rate} · {settings.pitch}
        </span>
        <button
          type="button"
          onClick={() => void previewVoice()}
          disabled={previewing}
          className="inline-flex h-9 items-center justify-center rounded-full border border-white/15 px-3 text-[11px] text-zinc-200 hover:bg-white/10 disabled:opacity-50"
        >
          {previewing ? "试听中..." : "试听声音"}
        </button>
      </div>
    </details>
  );
}
