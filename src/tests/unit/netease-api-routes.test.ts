import { describe, expect, it } from "vitest";
import { NETEASE_API_ROUTES } from "@/lib/providers/netease/netease-api-routes";

describe("NETEASE_API_ROUTES", () => {
  it("uses flat QR login endpoints that are safe for the app router dev server", () => {
    expect(NETEASE_API_ROUTES.status).toBe("/api/netease/status");
    expect(NETEASE_API_ROUTES.qrCreate).toBe("/api/netease/qr-create");
    expect(NETEASE_API_ROUTES.qrCheck).toBe("/api/netease/qr-check");
  });

  it("keeps route aliases for browser-openable login APIs", () => {
    expect("/api/netease/login/qr").toBe("/api/netease/login/qr");
    expect("/api/netease/login/status").toBe("/api/netease/login/status");
    expect("/api/netease/login/cookie").toBe("/api/netease/login/cookie");
    expect("/api/netease/user/playlists").toBe("/api/netease/user/playlists");
  });
});
