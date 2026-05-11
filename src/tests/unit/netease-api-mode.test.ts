import { beforeEach, describe, expect, it, vi } from "vitest";

const envState = new Map<string, string | undefined>();

vi.mock("@/lib/config/server-env", () => ({
  readServerEnvVar: (key: string) => envState.get(key),
}));

describe("netease api mode", () => {
  beforeEach(() => {
    envState.clear();
    vi.resetModules();
  });

  it("prefers package mode when the enhanced package is installed", async () => {
    const apiModeModule = await import("@/lib/providers/netease/netease-api-mode");

    expect(apiModeModule.getInstalledNeteaseApiPackage()).toBe("@neteasecloudmusicapienhanced/api");
    expect(apiModeModule.resolveNeteaseApiMode()).toBe("package");
  });

  it("still uses the local 3001 bridge by default", async () => {
    const apiModeModule = await import("@/lib/providers/netease/netease-api-mode");

    expect(apiModeModule.getNeteaseApiBaseUrl()).toBe("http://127.0.0.1:3001");
  });

  it("still allows forcing remote mode explicitly", async () => {
    envState.set("NETEASE_API_MODE", "remote");
    envState.set("NETEASE_API_BASE_URL", "http://127.0.0.1:3001");
    const apiModeModule = await import("@/lib/providers/netease/netease-api-mode");

    expect(apiModeModule.resolveNeteaseApiMode()).toBe("remote");
    expect(apiModeModule.getNeteaseApiBaseUrl()).toBe("http://127.0.0.1:3001");
  });
});
