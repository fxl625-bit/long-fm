-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nickname" TEXT NOT NULL,
    "avatar" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'MOCK',
    "providerUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProviderSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "cookie" TEXT,
    "expiresAt" DATETIME,
    "rawSession" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProviderSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Playlist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "providerPlaylistId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MOCK',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "coverUrl" TEXT,
    "isLikedPlaylist" BOOLEAN NOT NULL DEFAULT false,
    "rawMeta" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Playlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Track" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "providerTrackId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MOCK',
    "name" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "album" TEXT,
    "duration" INTEGER NOT NULL,
    "coverUrl" TEXT,
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

-- CreateTable
CREATE TABLE "PlaylistTrack" (
    "playlistId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("playlistId", "trackId"),
    CONSTRAINT "PlaylistTrack_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlaylistTrack_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserMusicProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "summaryText" TEXT NOT NULL,
    "structuredProfileJson" JSONB NOT NULL,
    "topArtistsJson" JSONB,
    "listeningTrendJson" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserMusicProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProgramRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "contextJson" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProgramRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RadioProgram" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "requestId" TEXT,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "prompt" TEXT NOT NULL,
    "theme" TEXT,
    "mood" TEXT,
    "introText" TEXT NOT NULL,
    "outroText" TEXT NOT NULL,
    "coverPrompt" TEXT,
    "coverUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "programJson" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RadioProgram_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RadioProgram_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ProgramRequest" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RadioProgramTrack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "radioProgramId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "section" TEXT,
    "reasonText" TEXT NOT NULL,
    "transitionText" TEXT NOT NULL,
    CONSTRAINT "RadioProgramTrack_radioProgramId_fkey" FOREIGN KEY ("radioProgramId") REFERENCES "RadioProgram" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RadioProgramTrack_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_provider_providerUserId_key" ON "User"("provider", "providerUserId");

-- CreateIndex
CREATE INDEX "ProviderSession_userId_provider_idx" ON "ProviderSession"("userId", "provider");

-- CreateIndex
CREATE INDEX "Playlist_userId_idx" ON "Playlist"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Playlist_userId_providerPlaylistId_key" ON "Playlist"("userId", "providerPlaylistId");

-- CreateIndex
CREATE UNIQUE INDEX "Track_source_providerTrackId_key" ON "Track"("source", "providerTrackId");

-- CreateIndex
CREATE INDEX "PlaylistTrack_playlistId_orderIndex_idx" ON "PlaylistTrack"("playlistId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "UserMusicProfile_userId_key" ON "UserMusicProfile"("userId");

-- CreateIndex
CREATE INDEX "ProgramRequest_userId_createdAt_idx" ON "ProgramRequest"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RadioProgram_userId_createdAt_idx" ON "RadioProgram"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RadioProgramTrack_radioProgramId_orderIndex_idx" ON "RadioProgramTrack"("radioProgramId", "orderIndex");

