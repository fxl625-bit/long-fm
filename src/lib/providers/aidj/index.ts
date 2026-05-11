import type { MusicProfileStructured, MusicTrack, ProgramTweak } from "@/lib/types/music";
import type { GeneratedProgram } from "@/lib/types/radio";
import { AI_DJ_SHORT_LINES } from "@/lib/constants/product";
import { generateRadioProgram } from "@/lib/engines/radio-program-engine";

export interface AIDJProvider {
  arrangeProgram(input: {
    userPrompt: string;
    tracks: MusicTrack[];
    profile: MusicProfileStructured;
    desiredTrackCount?: number;
    tweak?: ProgramTweak;
  }): Promise<GeneratedProgram>;
  buildOneLine(program?: GeneratedProgram): string;
}

class DefaultAIDJProvider implements AIDJProvider {
  async arrangeProgram(input: {
    userPrompt: string;
    tracks: MusicTrack[];
    profile: MusicProfileStructured;
    desiredTrackCount?: number;
    tweak?: ProgramTweak;
  }): Promise<GeneratedProgram> {
    return generateRadioProgram({
      userPrompt: input.userPrompt,
      tracks: input.tracks,
      profile: input.profile,
      desiredTrackCount: input.desiredTrackCount,
      tweak: input.tweak,
      styleId: "daily-flow",
    });
  }

  buildOneLine(program?: GeneratedProgram): string {
    if (!program?.tracksDetailed?.length) {
      return AI_DJ_SHORT_LINES[0];
    }
    const idx = (program.tracksDetailed.length + program.title.length) % AI_DJ_SHORT_LINES.length;
    return AI_DJ_SHORT_LINES[idx];
  }
}

export function createAIDJProvider(): AIDJProvider {
  return new DefaultAIDJProvider();
}
