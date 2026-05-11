"use client";

import { useEffect, useState } from "react";

type DJSpeakPayload = {
  ok: boolean;
  mode: "audio" | "subtitle_only";
  provider: string;
  audioUrl?: string;
  durationMs?: number;
  text: string;
  cached?: boolean;
  error: string | null;
};

function splitSentences(text: string) {
  return text.match(/[^。！？!?]+[。！？!?]?/g)?.map((item) => item.trim()).filter(Boolean) ?? [text];
}

export default function DebugDJVoicePage() {
  const [text, setText] = useState("我已经连上你的网易云了，现在先帮你筛出能播放的歌。");
  const [result, setResult] = useState<DJSpeakPayload | null>(null);
  const [currentLine, setCurrentLine] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const sentences = result?.text ? splitSentences(result.text) : [];
    if (!result || result.mode !== "subtitle_only" || !sentences.length) {
      return;
    }

    let cancelled = false;
    let previousLine = "";

    const run = async () => {
      for (const sentence of sentences) {
        if (cancelled) return;
        await new Promise((resolve) => setTimeout(resolve, 30));
        if (cancelled) return;
        if (previousLine) {
          setHistory((items) => [previousLine, ...items].slice(0, 4));
        }
        setCurrentLine(sentence);
        previousLine = sentence;
        await new Promise((resolve) => setTimeout(resolve, Math.min(2800, Math.max(1800, sentence.length * 90))));
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [result]);

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-8 text-sm">
      <h1 className="text-2xl font-semibold">DJ Voice Debug</h1>

      <section className="rounded border p-4">
        <h2 className="mb-3 text-lg font-medium">Speak Test</h2>
        <div className="space-y-3">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={4}
            className="w-full rounded border p-3"
          />
          <button
            type="button"
            className="rounded border px-3 py-2"
            disabled={!text.trim() || loading}
            onClick={async () => {
              setLoading(true);
              try {
                const response = await fetch("/api/dj/debug/speak", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ text }),
                });
                const payload = (await response.json()) as DJSpeakPayload;
                setResult(payload);
                setCurrentLine("");
                setHistory([]);
              } finally {
                setLoading(false);
              }
            }}
          >
            测试 DJ 说话
          </button>
        </div>
      </section>

      {result ? (
        <section className="rounded border p-4">
          <h2 className="mb-3 text-lg font-medium">Result</h2>
          <p>provider: {result.provider}</p>
          <p>mode: {result.mode}</p>
          <p>cached: {String(result.cached ?? false)}</p>
          <p>durationMs: {result.durationMs ?? "N/A"}</p>
          <p>error: {result.error ?? "null"}</p>
          {result.audioUrl ? <audio controls autoPlay src={result.audioUrl} className="mt-3 w-full" /> : null}
          {result.mode === "subtitle_only" ? (
            <div className="mt-4 rounded border bg-zinc-50 p-4">
              <p className="min-h-16 text-lg leading-8">{currentLine || "等待字幕渐进显示..."}</p>
              <div className="mt-2 space-y-1 text-xs text-zinc-500">
                {history.map((line, index) => (
                  <p key={`${line}-${index}`} style={{ opacity: Math.max(0.35, 0.55 - index * 0.08) }}>
                    {line}
                  </p>
                ))}
              </div>
            </div>
          ) : null}
          <pre className="mt-4 overflow-auto rounded bg-zinc-100 p-3 text-xs">{JSON.stringify(result, null, 2)}</pre>
        </section>
      ) : null}
    </main>
  );
}
