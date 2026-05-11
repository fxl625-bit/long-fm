import { NextResponse } from "next/server";
import { resolveCurrentUser } from "@/lib/actions/session";
import { fetchUserPlaylistsFromDb } from "@/lib/repositories/music-sync-repository";
import { buildNeteasePlaylistExternalUrl } from "@/lib/utils/external-links";

export async function GET() {
  try {
    const user = await resolveCurrentUser();
    const playlists = await fetchUserPlaylistsFromDb(user.id);

    return NextResponse.json({
      ok: true,
      playlists: playlists.map((playlist) => ({
        id: playlist.id,
        providerPlaylistId: playlist.providerPlaylistId,
        name: playlist.name,
        description: playlist.description,
        coverUrl: playlist.coverUrl,
        isLikedPlaylist: playlist.isLikedPlaylist,
        trackCount: playlist.tracks.length,
        externalUrl:
          playlist.source === "NETEASE" || playlist.source === "NETEASE_OFFICIAL"
            ? buildNeteasePlaylistExternalUrl(playlist.providerPlaylistId)
            : undefined,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to fetch playlists",
      },
      { status: 500 },
    );
  }
}


