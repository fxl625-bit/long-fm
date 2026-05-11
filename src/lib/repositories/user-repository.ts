import { ProviderType, type User } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { demoUser } from "@/lib/demo/music-data";

export async function getOrCreateDemoUser(): Promise<User> {
  const existing = await prisma.user.findUnique({
    where: {
      provider_providerUserId: {
        provider: ProviderType.MOCK,
        providerUserId: demoUser.id,
      },
    },
  });

  if (existing) {
    return existing;
  }

  return prisma.user.create({
    data: {
      provider: ProviderType.MOCK,
      providerUserId: demoUser.id,
      nickname: demoUser.nickname,
      avatar: demoUser.avatar,
    },
  });
}

export async function getUserById(userId: string) {
  return prisma.user.findUnique({ where: { id: userId } });
}

