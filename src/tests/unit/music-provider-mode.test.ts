import { afterEach, describe, expect, it, vi } from "vitest";
import { clearServerEnvCache } from "@/lib/config/server-env";
import { resolveMusicProviderMode } from "@/lib/providers/music";

describe("resolveMusicProviderMode", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    clearServerEnvCache();
  });

  it("falls back to netease_experimental when MUSIC_PROVIDER is invalid", () => {
    vi.stubEnv("MUSIC_PROVIDER", "not-a-real-provider");

    expect(resolveMusicProviderMode()).toBe("netease_experimental");
  });
});
