import { describe, expect, it, vi } from "vitest";
import { DeepSeekClient } from "@/lib/llm/deepseek-client";

describe("DeepSeekClient", () => {
  it("returns config_missing when api key is absent", async () => {
    const client = new DeepSeekClient({
      env: {
        DEEPSEEK_API_BASE_URL: "https://api.deepseek.com",
        DEEPSEEK_MODEL: "deepseek-chat",
      },
      fetchImpl: vi.fn(),
    });

    const result = await client.chatJson<{ ok: boolean }>({
      systemPrompt: "只输出 JSON",
      userPrompt: "{}",
    });

    expect(result.ok).toBe(false);
    expect(result.error?.type).toBe("config_missing");
  });

  it("returns parsed JSON and raw text when the response is valid", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"action":"keep_flow","shouldSpeak":true,"lines":["这首先放松一点。"],"reason":"ok"}' } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const client = new DeepSeekClient({
      env: {
        DEEPSEEK_API_BASE_URL: "https://api.deepseek.com",
        DEEPSEEK_API_KEY: "test-key",
        DEEPSEEK_MODEL: "deepseek-chat",
      },
      fetchImpl,
    });

    const result = await client.chatJson<{ action: string }>({
      systemPrompt: "只输出 JSON",
      userPrompt: "{}",
    });

    expect(result.ok).toBe(true);
    expect(result.data?.action).toBe("keep_flow");
    expect(result.rawText).toContain("keep_flow");
  });

  it("returns invalid_json when the model responds with non-json text", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "not-json" } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const client = new DeepSeekClient({
      env: {
        DEEPSEEK_API_BASE_URL: "https://api.deepseek.com",
        DEEPSEEK_API_KEY: "test-key",
        DEEPSEEK_MODEL: "deepseek-chat",
      },
      fetchImpl,
    });

    const result = await client.chatJson<{ action: string }>({
      systemPrompt: "只输出 JSON",
      userPrompt: "{}",
    });

    expect(result.ok).toBe(false);
    expect(result.error?.type).toBe("invalid_json");
    expect(result.rawText).toBe("not-json");
  });

  it("keeps fetch callable when the implementation is receiver-sensitive", async () => {
    const receiverSensitiveFetch = vi.fn(function (this: unknown) {
      if (this && this !== globalThis) {
        throw new TypeError("Illegal invocation");
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"shouldSpeak":true,"speech":"先让这段空气慢慢站稳。"}' } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    });

    const client = new DeepSeekClient({
      env: {
        DEEPSEEK_API_BASE_URL: "https://api.deepseek.com",
        DEEPSEEK_API_KEY: "test-key",
        DEEPSEEK_MODEL: "deepseek-chat",
      },
      fetchImpl: receiverSensitiveFetch as unknown as typeof fetch,
    });

    const result = await client.chatJson<{ shouldSpeak: boolean; speech: string }>({
      systemPrompt: "只输出 JSON",
      userPrompt: "{}",
    });

    expect(result.ok).toBe(true);
    expect(result.data?.shouldSpeak).toBe(true);
    expect(receiverSensitiveFetch).toHaveBeenCalledTimes(1);
  });
});
