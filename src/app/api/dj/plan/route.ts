import { NextResponse } from "next/server";
import { DEFAULT_CHANNEL_NAME } from "@/lib/constants/product";
import { createProgramPlanWithDeepSeek } from "@/lib/dj/llm-program-planner";
import type { Track } from "@/lib/radio/radio-types";

function parseTrackArray(value: unknown): Track[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const parsed: Track[] = [];
  for (const item of value) {
    const raw = item as Partial<Track>;
    if (!raw?.id || !raw?.title || !raw?.artist) {
      continue;
    }
    const providerTrackId = String(raw.providerTrackId ?? raw.neteaseId ?? raw.id);
    const track: Track = {
      id: raw.id,
      providerTrackId,
      neteaseId: String(raw.neteaseId ?? providerTrackId),
      title: raw.title,
      artist: raw.artist,
      album: raw.album,
      coverUrl: raw.coverUrl,
      audioUrl: raw.audioUrl,
      durationMs: raw.durationMs,
      sourceType: raw.sourceType ?? "netease",
      playableStatus: raw.playableStatus ?? "playable",
      tags: raw.tags,
    };
    if (track.playableStatus === "playable" && track.audioUrl) {
      parsed.push(track);
    }
  }

  return parsed;
}

function inferTimeOfDay() {
  const hour = new Date().getHours();
  if (hour < 11) return "morning" as const;
  if (hour < 17) return "afternoon" as const;
  if (hour < 22) return "evening" as const;
  return "night" as const;
}

function summarizePool(tracks: Track[]) {
  const languages = Array.from(new Set(tracks.map((track) => track.tags?.language).filter(Boolean)));
  const artists = Array.from(new Set(tracks.map((track) => track.artist))).slice(0, 3);
  const tones = Array.from(new Set(tracks.map((track) => track.tags?.mood?.[0]).filter(Boolean))).slice(0, 3);
  return `常出现的歌手有 ${artists.join(" / ") || "熟悉的声音"}；语种以 ${languages.join(" / ") || "混合"} 为主；整体气质偏 ${tones.join(" / ") || "松弛"}。`;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const candidateTracks = parseTrackArray(body?.candidateTracks);
  const playlistName = typeof body?.playlistName === "string" && body.playlistName.trim() ? body.playlistName.trim() : DEFAULT_CHANNEL_NAME;

  if (!candidateTracks.length) {
    return NextResponse.json(
      {
        ok: false,
        provider: "deepseek",
        configured: Boolean(process.env.DEEPSEEK_API_KEY),
        usedFallback: true,
        parsedPlan: null,
        error: {
          type: "invalid_schema",
          message: "candidateTracks is required",
        },
      },
      { status: 400 },
    );
  }

  const result = await createProgramPlanWithDeepSeek({
    playlistName,
    timeOfDay: inferTimeOfDay(),
    userMemorySummary: summarizePool(candidateTracks),
    playableTrackPool: candidateTracks,
    recentTracks: candidateTracks.slice(0, 5),
  });

  return NextResponse.json({
    ok: !result.usedFallback || Boolean(result.parsedPlan),
    provider: result.provider,
    configured: result.configured,
    model: result.model,
    usedFallback: result.usedFallback,
    rawPrompt: result.rawPrompt,
    rawResponse: result.rawResponse,
    candidateTracks,
    parsedPlan: result.parsedPlan,
    plan: result.parsedPlan,
    error: result.error,
  });
}
