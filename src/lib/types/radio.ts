import type { MusicTrack, RadioProgramOutput } from "./music";

export type GeneratedProgram = RadioProgramOutput & {
  prompt: string;
  theme: string;
  mood: string;
  posterCopy?: string;
  tracksDetailed: Array<{
    track: MusicTrack;
    reason: string;
    transition: string;
    section: "opening" | "build" | "lift" | "settle" | "outro";
  }>;
};

