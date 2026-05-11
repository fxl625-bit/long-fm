import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { extname } from "node:path";
import { Readable } from "node:stream";
import { constants } from "node:fs";
import { NextResponse } from "next/server";
import { readServerEnvVar } from "@/lib/config/server-env";
import { prisma } from "@/lib/db/prisma";
import { LocalAudioProvider } from "@/lib/providers/music/local-audio-provider";

export const runtime = "nodejs";

const MIME_BY_EXT: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
};

async function resolveLocalPath(trackId: string): Promise<string | null> {
  const track = await prisma.track.findFirst({
    where: {
      OR: [{ id: trackId }, { providerTrackId: trackId }],
    },
    select: {
      localPath: true,
    },
  });

  if (track?.localPath) {
    return track.localPath;
  }

  const localAudioDir = readServerEnvVar("LOCAL_AUDIO_DIR");
  if (!localAudioDir) {
    return null;
  }

  const providerTrack = await new LocalAudioProvider(localAudioDir)
    .getSongDetail(trackId)
    .catch(() => null);

  return providerTrack?.localPath ?? null;
}

function parseRangeHeader(rangeHeader: string | null, fileSize: number) {
  if (!rangeHeader || !rangeHeader.startsWith("bytes=")) {
    return null;
  }

  const raw = rangeHeader.replace("bytes=", "").split(",")[0]?.trim();
  if (!raw) {
    return null;
  }

  const [startRaw, endRaw] = raw.split("-");
  const start = startRaw ? Number(startRaw) : 0;
  const end = endRaw ? Number(endRaw) : fileSize - 1;

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || end >= fileSize) {
    return null;
  }

  return { start, end };
}

export async function GET(
  request: Request,
  context: {
    params: Promise<{ trackId: string }>;
  },
) {
  try {
    const { trackId } = await context.params;
    const decodedId = decodeURIComponent(trackId);

    const localPath = await resolveLocalPath(decodedId);

    if (!localPath) {
      return NextResponse.json({ ok: false, message: "Local track not found" }, { status: 404 });
    }

    await access(localPath, constants.R_OK);
    const fileStat = await stat(localPath);
    const fileSize = fileStat.size;
    const range = parseRangeHeader(request.headers.get("range"), fileSize);

    const ext = extname(localPath).toLowerCase();
    const contentType = MIME_BY_EXT[ext] ?? "application/octet-stream";

    if (range) {
      const chunkSize = range.end - range.start + 1;
      const stream = createReadStream(localPath, { start: range.start, end: range.end });

      return new Response(Readable.toWeb(stream) as ReadableStream, {
        status: 206,
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(chunkSize),
          "Accept-Ranges": "bytes",
          "Content-Range": `bytes ${range.start}-${range.end}/${fileSize}`,
          "Cache-Control": "private, max-age=0, must-revalidate",
        },
      });
    }

    const stream = createReadStream(localPath);
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(fileSize),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to stream local audio",
      },
      { status: 500 },
    );
  }
}
