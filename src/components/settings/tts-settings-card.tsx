"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type ProviderStatus = {
  id: "edge_tts" | "kokoro" | "piper" | "openai" | "subtitle_only";
  available: boolean;
  voices: Array<{
    id: string;
    name: string;
    locale?: string;
    gender?: "male" | "female" | "neutral";
    provider: "edge_tts" | "kokoro" | "piper" | "openai" | "subtitle_only";
  }>;
};

type VoicesResponse = {
  ok: boolean;
  currentProvider: ProviderStatus["id"];
  fallbackProvider: ProviderStatus["id"];
  statuses: ProviderStatus[];
  message?: string;
};

type TestResult = {
  ok?: boolean;
  mode?: "audio" | "subtitle_only";
  audioUrl?: string;
  provider?: string;
  voice?: string;
  cached?: boolean;
  text?: string;
  message?: string;
};

const DEFAULT_TEST_TEXT = "这首歌先把空气打开一点。下一首，我们把节奏轻轻往前推。";

export function TTSSettingsCard() {
  const [data, setData] = useState<VoicesResponse | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<ProviderStatus["id"]>(() => {
    if (typeof window === "undefined") {
      return "edge_tts";
    }
    const storedProvider = window.localStorage.getItem("tts_mode");
    if (
      storedProvider === "edge_tts" ||
      storedProvider === "kokoro" ||
      storedProvider === "piper" ||
      storedProvider === "openai" ||
      storedProvider === "subtitle_only"
    ) {
      return storedProvider;
    }
    return "edge_tts";
  });
  const [selectedVoice, setSelectedVoice] = useState(() => {
    if (typeof window === "undefined") {
      return "";
    }
    return window.localStorage.getItem("tts_voice")?.trim() ?? "";
  });
  const [testText, setTestText] = useState(DEFAULT_TEST_TEXT);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/tts/voices", { cache: "no-store" })
      .then((res) => res.json())
      .then((payload: VoicesResponse) => {
        if (cancelled || !payload.ok) return;
        setData(payload);
        setSelectedProvider((prev) => prev || payload.currentProvider);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  const activeProvider = useMemo(
    () => data?.statuses.find((item) => item.id === selectedProvider) ?? null,
    [data, selectedProvider],
  );

  const activeVoices = activeProvider?.voices ?? [];

  const savePreference = () => {
    window.localStorage.setItem("tts_mode", selectedProvider);
    if (selectedVoice.trim()) {
      window.localStorage.setItem("tts_voice", selectedVoice.trim());
    } else {
      window.localStorage.removeItem("tts_voice");
    }
  };

  const runTest = async () => {
    setLoading(true);
    setTestResult(null);
    savePreference();

    try {
      const response = await fetch("/api/tts/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: testText,
          provider: selectedProvider,
          voice: selectedVoice || undefined,
        }),
      });
      const payload = (await response.json()) as TestResult;
      setTestResult(payload);

      if (payload.mode === "audio" && payload.audioUrl) {
        const audio = new Audio(payload.audioUrl);
        await audio.play().catch(() => undefined);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>TTS / DJ 语音</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-zinc-300">
        <div className="flex flex-wrap gap-2">
          {data?.statuses.map((item) => (
            <Badge key={item.id} variant={item.available ? "default" : "muted"}>
              {item.id} · {item.available ? "available" : "offline"}
            </Badge>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-xs uppercase tracking-[0.18em] text-zinc-500">当前 Provider</span>
            <select
              value={selectedProvider}
              onChange={(event) => setSelectedProvider(event.target.value as ProviderStatus["id"])}
              className="flex h-11 w-full rounded-2xl border border-white/15 bg-black/20 px-4 py-2 text-sm text-zinc-100 outline-none"
            >
              {data?.statuses.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.id}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-xs uppercase tracking-[0.18em] text-zinc-500">当前 Voice</span>
            <select
              value={selectedVoice}
              onChange={(event) => setSelectedVoice(event.target.value)}
              className="flex h-11 w-full rounded-2xl border border-white/15 bg-black/20 px-4 py-2 text-sm text-zinc-100 outline-none"
            >
              <option value="">default</option>
              {activeVoices.map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.name} {voice.locale ? `(${voice.locale})` : ""}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="space-y-2">
          <span className="text-xs uppercase tracking-[0.18em] text-zinc-500">测试文本</span>
          <Input value={testText} onChange={(event) => setTestText(event.target.value)} />
        </label>

        <div className="flex gap-2">
          <Button type="button" onClick={runTest} disabled={loading}>
            {loading ? "生成中..." : "测试 DJ 语音"}
          </Button>
          <Button type="button" variant="secondary" onClick={savePreference}>
            保存偏好
          </Button>
        </div>

        {data ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-zinc-400">
            <p>默认 Provider：{data.currentProvider}</p>
            <p>Fallback：{data.fallbackProvider}</p>
            <p>当前 voice 数量：{activeVoices.length}</p>
          </div>
        ) : null}

        {testResult ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-zinc-400">
            <p>mode: {testResult.mode ?? "unknown"}</p>
            <p>provider: {testResult.provider ?? "unknown"}</p>
            <p>voice: {testResult.voice ?? "default"}</p>
            <p>cached: {String(testResult.cached ?? false)}</p>
            <p>audioUrl: {testResult.audioUrl ?? "none"}</p>
            {testResult.message ? <p>message: {testResult.message}</p> : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
