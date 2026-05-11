import { describe, expect, it } from "vitest";
import { completeLoginAfterQrCheck } from "@/lib/providers/netease/netease-auth";

describe("completeLoginAfterQrCheck", () => {
  it("treats authorized QR login as successful even when login status lacks a direct profile", async () => {
    const result = await completeLoginAfterQrCheck(
      {
        status: "authorized",
        data: {
          cookie: "MUSIC_U=test-cookie",
        },
      },
      {
        getLoginStatus: async () => ({
          data: {
            account: {
              id: 123456,
            },
          },
        }),
        getUserDetail: async () => ({
          userPoint: {
            userId: 123456,
          },
        }),
      },
    );

    expect(result.ok).toBe(true);
    expect(result.status).toBe("logged_in");
    expect(result.cookie).toBe("MUSIC_U=test-cookie");
    expect(result.account).toEqual({
      id: "123456",
    });
    expect(result.profile).toEqual({
      id: "123456",
      nickname: "网易云用户",
      avatar: undefined,
    });
  });

  it("returns authorized_but_no_cookie instead of crashing when QR authorization has no cookie", async () => {
    const result = await completeLoginAfterQrCheck(
      {
        status: "authorized",
      },
      {
        getLoginStatus: async () => ({}),
        getUserDetail: async () => ({}),
      },
    );

    expect(result.ok).toBe(false);
    expect(result.status).toBe("authorized_but_no_cookie");
  });
});
