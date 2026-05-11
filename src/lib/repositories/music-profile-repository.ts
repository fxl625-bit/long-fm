import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { MusicPersonaResult } from "@/lib/types/music";

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}

export async function saveUserMusicProfile(userId: string, profile: MusicPersonaResult) {
  return prisma.userMusicProfile.upsert({
    where: {
      userId,
    },
    update: {
      summaryText: profile.summaryText,
      structuredProfileJson: toJson(profile.structured),
      topArtistsJson: toJson(profile.structured.topArtists),
      listeningTrendJson: toJson({
        moods: profile.structured.moods,
        energy: profile.structured.energy,
      }),
    },
    create: {
      userId,
      summaryText: profile.summaryText,
      structuredProfileJson: toJson(profile.structured),
      topArtistsJson: toJson(profile.structured.topArtists),
      listeningTrendJson: toJson({
        moods: profile.structured.moods,
        energy: profile.structured.energy,
      }),
    },
  });
}

export async function getUserMusicProfile(userId: string) {
  return prisma.userMusicProfile.findUnique({
    where: { userId },
  });
}

