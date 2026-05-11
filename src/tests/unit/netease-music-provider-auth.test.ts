import { afterEach, describe, expect, it, vi } from "vitest";
import { NeteaseMusicProvider } from "@/lib/providers/music/netease-music-provider";

describe("NeteaseMusicProvider authentication fallbacks", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves a fallback profile from account.id when login status has no direct profile", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              account: {
                id: 24680,
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            profile: {
              userId: 24680,
              nickname: "Fallback User",
              avatarUrl: "https://example.com/avatar.jpg",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    const provider = new NeteaseMusicProvider({
      baseUrl: "http://127.0.0.1:3001",
    });

    const profile = await provider.getUserProfile("MUSIC_U=test-cookie");

    expect(profile).toEqual({
      id: "24680",
      nickname: "Fallback User",
      avatar: "https://example.com/avatar.jpg",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("passes the netease cookie in both query params and headers for remote api compatibility", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ url: "https://audio.example/test.mp3" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const provider = new NeteaseMusicProvider({
      baseUrl: "http://127.0.0.1:3001",
    });

    const audioUrl = await provider.getSongUrl("2082576919", "MUSIC_U=test-cookie");

    expect(audioUrl).toBe("https://audio.example/test.mp3");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [requestUrl, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(requestUrl)).toContain("cookie=MUSIC_U%3Dtest-cookie");
    expect((init?.headers as Record<string, string>)?.Cookie).toBe("MUSIC_U=test-cookie");
  });
});
