-- CreateTable
CREATE TABLE "PlaybackSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "currentTrackId" TEXT,
    "queueJson" JSONB NOT NULL,
    "currentIndex" INTEGER NOT NULL DEFAULT 0,
    "currentTime" INTEGER NOT NULL DEFAULT 0,
    "isPlaying" BOOLEAN NOT NULL DEFAULT false,
    "volume" REAL NOT NULL DEFAULT 0.85,
    "source" TEXT NOT NULL DEFAULT 'DEMO',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlaybackSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlaybackSession_currentTrackId_fkey" FOREIGN KEY ("currentTrackId") REFERENCES "Track" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Track" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "providerTrackId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MOCK',
    "sourceType" TEXT NOT NULL DEFAULT 'DEMO',
    "name" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "album" TEXT,
    "duration" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "coverUrl" TEXT,
    "audioUrl" TEXT,
    "externalUrl" TEXT,
    "localPath" TEXT,
    "playableStatus" TEXT,
    "language" TEXT,
    "era" TEXT,
    "moodTags" JSONB,
    "styleTags" JSONB,
    "energyLevel" TEXT,
    "lyrics" TEXT,
    "rawMeta" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Track" ("album", "artist", "coverUrl", "createdAt", "duration", "energyLevel", "era", "id", "language", "lyrics", "moodTags", "name", "providerTrackId", "rawMeta", "source", "styleTags", "updatedAt") SELECT "album", "artist", "coverUrl", "createdAt", "duration", "energyLevel", "era", "id", "language", "lyrics", "moodTags", "name", "providerTrackId", "rawMeta", "source", "styleTags", "updatedAt" FROM "Track";
DROP TABLE "Track";
ALTER TABLE "new_Track" RENAME TO "Track";
CREATE UNIQUE INDEX "Track_source_providerTrackId_key" ON "Track"("source", "providerTrackId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "PlaybackSession_userId_key" ON "PlaybackSession"("userId");

-- CreateIndex
CREATE INDEX "PlaybackSession_updatedAt_idx" ON "PlaybackSession"("updatedAt");
