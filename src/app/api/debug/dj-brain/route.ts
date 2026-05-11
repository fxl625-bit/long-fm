import { NextResponse } from "next/server";
import { resolveDJBrainDecision } from "@/lib/dj/dj-brain";
import type { DJDirectorContext } from "@/lib/dj/dj-types";
import type { Track } from "@/lib/radio/radio-types";

function makeTrack(track: {
  id: string;
  title: string;
  artist: string;
  album?: string;
}): Track {
  return {
    ...track,
    providerTrackId: track.id,
    neteaseId: track.id,
    sourceType: "netease",
    playableStatus: "playable",
    audioUrl: `https://music.163.com/song/media/outer/url?id=${track.id}.mp3`,
    durationMs: 180000,
    tags: {
      language: /[\u4e00-\u9fff]/.test(`${track.title} ${track.artist}`) ? "中文" : "English",
      energy: /Wake Up|Paradise|vibes/i.test(track.title) ? "high" : /Dark|彩蝶|манго/i.test(track.title) ? "low" : "medium",
      style: [/Imagine Dragons/i.test(track.artist) ? "rock" : /Adele/i.test(track.artist) ? "ballad" : /何真真|Corn Wave/i.test(track.artist) ? "ambient" : "pop"],
      mood: [/Dark|манго|彩蝶/.test(track.title) ? "night" : "city"],
    },
  };
}

const mockPool = [
  makeTrack({ id: "3363281756", title: "Goodbye Henry. (feat. Al Green)", artist: "RAYE / Al Green" }),
  makeTrack({ id: "2609698825", title: "take your vibes and go", artist: "Kito / Kah-Lo / Brazy / Baauer" }),
  makeTrack({ id: "3357209106", title: "Someone in the crowd", artist: "雷米克斯" }),
  makeTrack({ id: "36841427", title: "Love In The Dark", artist: "Adele" }),
  makeTrack({ id: "29097535", title: "彩蝶舞夏", artist: "何真真" }),
  makeTrack({ id: "1905096353", title: "манго нектар", artist: "Corn Wave" }),
  makeTrack({ id: "3342094891", title: "The Other Side Of Paradise", artist: "Glass Animals" }),
  makeTrack({ id: "2602954338", title: "Wake Up", artist: "Imagine Dragons" }),
  makeTrack({ id: "1368709511", title: "Bad Liar – Stripped", artist: "Imagine Dragons" }),
  makeTrack({ id: "3356620686", title: "I Bet My Life", artist: "Imagine Dragons" }),
];

function buildDebugContext(userIntent?: string): DJDirectorContext {
  const currentTrack = mockPool[0]!;
  const upcomingTracks = mockPool.slice(1, 5);
  return {
    currentTrack,
    nextTrack: upcomingTracks[0],
    recentTracks: [currentTrack],
    upcomingTracks,
    playableTrackPool: mockPool,
    playedCount: 1,
    timeOfDay: "evening",
    userMemory: {
      topArtists: ["RAYE / Al Green", "Imagine Dragons"],
      topLanguages: ["English", "中文"],
      topEras: ["2020s", "2010s"],
      inferredMoods: ["night", "city"],
      inferredStyles: ["pop", "rock"],
      energyProfile: "mixed",
      familiarityPreference: "balanced",
      discoveryTolerance: "medium",
      avoidPatterns: [],
      favoriteExamples: [],
      timeSlotPreferences: {},
      summary: "喜欢夜里有空气感，也接受中段拉亮一点。",
    },
    currentSegment: "main",
    userIntent,
    musicState: {
      isPlaying: true,
      isPaused: false,
      currentTime: 12000,
      duration: 180000,
    },
    recentLines: ["刚刚那首把灯压低了一点。"],
  };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const event = body?.event === "user_tune" ? "user_tune" : "user_tune";
  const userIntent = typeof body?.userIntent === "string" ? body.userIntent : "更轻快一点";

  const result = await resolveDJBrainDecision({
    trigger: event,
    context: buildDebugContext(userIntent),
  });

  return NextResponse.json({
    provider: result.provider,
    configured: result.configured,
    model: result.model,
    keyPresent: result.keyPresent,
    usedFallback: result.usedFallback,
    rawPrompt: result.rawPrompt ?? null,
    rawResponse: result.rawResponse ?? null,
    parsedDecision: result.parsedDecision ?? null,
    songBrief: result.parsedDecision?.meta?.scriptDebug?.songBrief ?? null,
    talkBreakPlan: result.parsedDecision?.meta?.scriptDebug?.talkBreakPlan ?? null,
    pattern: result.parsedDecision?.meta?.scriptDebug?.pattern ?? null,
    patternStructure: result.parsedDecision?.meta?.scriptDebug?.patternStructure ?? null,
    selectedIndex: result.parsedDecision?.meta?.scriptDebug?.selectedIndex ?? null,
    candidates: result.parsedDecision?.meta?.scriptDebug?.candidates ?? [],
    usedAnchors: result.parsedDecision?.meta?.scriptDebug?.usedAnchors ?? [],
    usedFacts: result.parsedDecision?.meta?.scriptDebug?.usedFacts ?? [],
    usedAngles: result.parsedDecision?.meta?.scriptDebug?.usedAngles ?? [],
    quality: result.parsedDecision?.meta?.scriptDebug?.quality ?? null,
    error: result.error,
  });
}
