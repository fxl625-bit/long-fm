import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/db/prisma";
import { demoMusicProfileSeed, demoProgramsSeed } from "../src/lib/demo/demo-programs";
import { createMusicProvider } from "../src/lib/providers/music";
import { saveUserMusicProfile } from "../src/lib/repositories/music-profile-repository";
import { syncLibraryFromProvider } from "../src/lib/repositories/music-sync-repository";
import { buildDefaultSessionFromTracks } from "../src/lib/repositories/playback-session-repository";
import { getOrCreateDemoUser } from "../src/lib/repositories/user-repository";

async function seedDemoPrograms(userId: string) {
  const tracks = await prisma.track.findMany({
    where: { source: "MOCK" },
    select: { id: true, providerTrackId: true },
  });

  const trackIdMap = new Map(tracks.map((item) => [item.providerTrackId, item.id]));

  await prisma.radioProgramTrack.deleteMany({
    where: {
      radioProgram: {
        userId,
        prompt: {
          startsWith: "DEMO:",
        },
      },
    },
  });

  await prisma.radioProgram.deleteMany({
    where: {
      userId,
      prompt: {
        startsWith: "DEMO:",
      },
    },
  });

  await prisma.programRequest.deleteMany({
    where: {
      userId,
      prompt: {
        startsWith: "DEMO:",
      },
    },
  });

  for (const program of demoProgramsSeed) {
    const request = await prisma.programRequest.create({
      data: {
        userId,
        prompt: program.prompt,
        contextJson: {
          mode: "demo",
          theme: program.theme,
        } as Prisma.InputJsonValue,
      },
    });

    const created = await prisma.radioProgram.create({
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
        coverPrompt: program.coverPrompt,
        programJson: {
          vibeDescription: program.vibeDescription,
          arrangementLogic: program.arrangementLogic,
          hostTone: program.hostTone,
          mode: "demo",
        } as Prisma.InputJsonValue,
      },
    });

    for (let index = 0; index < program.tracks.length; index += 1) {
      const item = program.tracks[index];
      const trackId = trackIdMap.get(item.providerTrackId);
      if (!trackId) {
        continue;
      }

      await prisma.radioProgramTrack.create({
        data: {
          radioProgramId: created.id,
          trackId,
          orderIndex: index,
          section: item.section,
          reasonText: item.reasonText,
          transitionText: item.transitionText,
        },
      });
    }
  }
}

async function main() {
  const user = await getOrCreateDemoUser();
  const provider = createMusicProvider();
  const summary = await syncLibraryFromProvider(user.id, provider);
  await saveUserMusicProfile(user.id, demoMusicProfileSeed);
  await seedDemoPrograms(user.id);

  const latestProgram = await prisma.radioProgram.findFirst({
    where: {
      userId: user.id,
      prompt: {
        startsWith: "DEMO:",
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      tracks: {
        orderBy: { orderIndex: "asc" },
      },
    },
  });

  if (latestProgram?.tracks.length) {
    await buildDefaultSessionFromTracks(
      user.id,
      latestProgram.tracks.map((item) => item.trackId),
    );
  }

  console.log("Seed complete", {
    userId: user.id,
    provider: provider.providerName,
    summary,
    profileSeeded: true,
    programSeeded: demoProgramsSeed.length,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
