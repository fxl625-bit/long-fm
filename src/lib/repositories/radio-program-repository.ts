import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { GeneratedProgram } from "@/lib/types/radio";

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}

export async function saveRadioProgram(userId: string, program: GeneratedProgram) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.programRequest.create({
      data: {
        userId,
        prompt: program.prompt,
        contextJson: toJson({
          theme: program.theme,
          mood: program.mood,
        }),
      },
    });

    const createdProgram = await tx.radioProgram.create({
      data: {
        userId,
        requestId: request.id,
        title: program.title,
        subtitle: program.subtitle,
        prompt: program.prompt,
        theme: program.theme,
        mood: program.mood,
        introText: program.introText,
        outroText: program.outroText,
        coverPrompt: program.posterCopy,
        programJson: toJson({
          vibeDescription: program.vibeDescription,
          arrangementLogic: program.arrangementLogic,
          hostTone: program.hostTone,
        }),
      },
    });

    for (let index = 0; index < program.tracksDetailed.length; index += 1) {
      const item = program.tracksDetailed[index];

      await tx.radioProgramTrack.create({
        data: {
          radioProgramId: createdProgram.id,
          trackId: item.track.id,
          orderIndex: index,
          section: item.section,
          reasonText: item.reason,
          transitionText: item.transition,
        },
      });
    }

    return createdProgram;
  });
}

export async function listRecentPrograms(userId: string, take = 6) {
  return prisma.radioProgram.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export async function listRecentProgramTrackIds(userId: string, takePrograms = 3, takeTracks = 24) {
  const programs = await prisma.radioProgram.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: takePrograms,
    include: {
      tracks: {
        orderBy: { orderIndex: "asc" },
        take: takeTracks,
      },
    },
  });

  const ids = programs.flatMap((program) => program.tracks.map((track) => track.trackId));
  return Array.from(new Set(ids));
}

export async function getProgramById(programId: string) {
  return prisma.radioProgram.findUnique({
    where: { id: programId },
    include: {
      tracks: {
        include: {
          track: true,
        },
        orderBy: {
          orderIndex: "asc",
        },
      },
    },
  });
}

