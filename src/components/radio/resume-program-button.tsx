"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PlaybackQueueItem, PlaybackSessionState } from "@/lib/types/music";

function buildSession(queue: PlaybackQueueItem[]): PlaybackSessionState {
  return {
    currentTrackId: queue[0]?.track.id,
    queue,
    currentIndex: 0,
    currentTime: 0,
    isPlaying: true,
    volume: 0.85,
    source: queue[0]?.track.sourceType ?? "DEMO",
  };
}

type ProgramTrackPayload = {
  track: {
    id: string;
    name: string;
    artist: string;
    album?: string | null;
    duration?: number;
    durationMs?: number;
    coverUrl?: string | null;
    audioUrl?: string | null;
    externalUrl?: string | null;
    localPath?: string | null;
    sourceType?: PlaybackQueueItem["track"]["sourceType"];
    playableStatus?: PlaybackQueueItem["track"]["playableStatus"];
    language?: string | null;
    era?: string | null;
    moodTags?: string[] | null;
    styleTags?: string[] | null;
    energyLevel?: PlaybackQueueItem["track"]["energyLevel"];
    rawMeta?: Record<string, unknown> | null;
  };
  reasonText?: string | null;
  section?: PlaybackQueueItem["section"];
};

export function ResumeProgramButton({ programId }: { programId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const onContinue = async () => {
    setLoading(true);

    try {
      const detailRes = await fetch(`/api/radio/${programId}`);
      const detailJson = await detailRes.json();
      if (!detailJson?.ok || !detailJson?.program) {
        throw new Error(detailJson?.message ?? "Failed to load program detail");
      }

      const queue: PlaybackQueueItem[] = (detailJson.program.tracks ?? []).map((item: ProgramTrackPayload) => ({
        track: {
          id: item.track.id,
          name: item.track.name,
          artist: item.track.artist,
          album: item.track.album ?? undefined,
          duration: item.track.durationMs || item.track.duration,
          durationMs: item.track.durationMs || item.track.duration,
          coverUrl: item.track.coverUrl ?? undefined,
          audioUrl: item.track.audioUrl ?? undefined,
          externalUrl: item.track.externalUrl ?? undefined,
          localPath: item.track.localPath ?? undefined,
          sourceType: item.track.sourceType,
          playableStatus: item.track.playableStatus,
          language: item.track.language ?? undefined,
          era: item.track.era ?? undefined,
          moodTags: item.track.moodTags ?? undefined,
          styleTags: item.track.styleTags ?? undefined,
          energyLevel: item.track.energyLevel ?? undefined,
          rawMeta: item.track.rawMeta ?? undefined,
        },
        reason: item.reasonText,
        section: item.section,
      }));

      const session = buildSession(queue);
      await fetch("/api/playback/session", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(session),
      });

      router.push("/");
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "继续播放失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button size="lg" onClick={onContinue} disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
      继续播放这期
    </Button>
  );
}
