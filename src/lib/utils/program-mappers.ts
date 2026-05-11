import type { Prisma } from "@prisma/client";
import type { GeneratedProgram } from "@/lib/types/radio";
import { mapDbTrackToMusicTrack } from "./mappers";

type ProgramWithTracks = Prisma.RadioProgramGetPayload<{
  include: {
    tracks: {
      include: {
        track: true;
      };
      orderBy: {
        orderIndex: "asc";
      };
    };
  };
}>;

export function mapProgramRecordToGeneratedProgram(record: ProgramWithTracks): GeneratedProgram {
  const metadata = (record.programJson as Record<string, unknown> | null) ?? {};
  const tracksDetailed = record.tracks.map((item) => ({
    track: mapDbTrackToMusicTrack(item.track),
    reason: item.reasonText,
    transition: item.transitionText,
    section: (item.section as GeneratedProgram["tracksDetailed"][number]["section"]) ?? "build",
  }));

  return {
    prompt: record.prompt,
    theme: record.theme ?? "私人播放队列",
    mood: record.mood ?? "平稳",
    title: record.title,
    subtitle: record.subtitle ?? "",
    vibeDescription: String(metadata.vibeDescription ?? "一组可连续播放、过渡顺滑的私人队列。"),
    arrangementLogic: String(metadata.arrangementLogic ?? "先进入，再推进，最后回收，保证听感连贯。"),
    introText: record.introText,
    outroText: record.outroText,
    hostTone: String(metadata.hostTone ?? "Auralia"),
    posterCopy: record.coverPrompt ?? undefined,
    tracks: tracksDetailed.map((item, index) => ({
      trackId: item.track.id,
      position: index + 1,
      reason: item.reason,
      transition: item.transition,
      section: item.section,
    })),
    tracksDetailed,
  };
}

