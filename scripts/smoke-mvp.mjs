import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const port = Number(process.env.SMOKE_PORT ?? 3101);
const baseUrl = `http://127.0.0.1:${port}`;
const nextBin = resolve(process.cwd(), "node_modules", "next", "dist", "bin", "next");

let cookie = "";

function mergeCookie(setCookieHeader) {
  if (!setCookieHeader) {
    return;
  }
  const incoming = setCookieHeader.split(";")[0];
  if (!incoming.includes("=")) {
    return;
  }
  const [name] = incoming.split("=");
  const currentPairs = cookie
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !item.startsWith(`${name}=`));
  currentPairs.push(incoming);
  cookie = currentPairs.join("; ");
}

async function request(path, init = {}) {
  const headers = new Headers(init.headers ?? {});
  if (cookie) {
    headers.set("cookie", cookie);
  }
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
  });
  mergeCookie(response.headers.get("set-cookie"));
  return response;
}

async function waitForServer(maxRetries = 80) {
  for (let i = 0; i < maxRetries; i += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/provider/playlists`);
      if (response.status !== 404) {
        return;
      }
    } catch {
      // server not ready yet
    }
    await delay(1000);
  }
  throw new Error("dev server startup timeout");
}

function stopProcessTree(pid) {
  if (!pid) {
    return;
  }
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  process.kill(pid, "SIGTERM");
}

async function runSmoke() {
  const devProcess = spawn(process.execPath, [nextBin, "dev", "--port", String(port)], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  devProcess.stdout?.on("data", (chunk) => {
    const text = String(chunk).trim();
    if (text) {
      console.log(`[next] ${text}`);
    }
  });
  devProcess.stderr?.on("data", (chunk) => {
    const text = String(chunk).trim();
    if (text) {
      console.log(`[next] ${text}`);
    }
  });

  let exitCode = 0;
  try {
    console.log(`[smoke] waiting for dev server on ${baseUrl}`);
    await waitForServer();
    console.log("[smoke] server ready");

    const loginRes = await request("/api/auth/demo-login", { method: "POST" });
    const loginJson = await loginRes.json();
    if (!loginRes.ok || !loginJson.ok) {
      throw new Error("demo login failed");
    }
    console.log("[smoke] demo login passed");

    const syncRes = await request("/api/provider/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "demo" }),
    });
    const syncJson = await syncRes.json();
    if (!syncRes.ok || !syncJson.ok) {
      throw new Error("provider sync failed");
    }
    console.log("[smoke] provider sync passed");

    const profileRes = await request("/api/profile/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force: false }),
    });
    const profileJson = await profileRes.json();
    if (!profileRes.ok || !profileJson.ok) {
      throw new Error("profile generate failed");
    }
    console.log("[smoke] profile generate passed");

    const generateRes = await request("/api/radio/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "做一组可连续播放的城市流动队列",
        desiredTrackCount: 12,
        styleId: "daily-flow",
      }),
    });
    const generateJson = await generateRes.json();
    if (!generateRes.ok || !generateJson.ok || !generateJson.programId) {
      throw new Error("radio generate failed");
    }
    console.log("[smoke] radio generate passed");

    const detailRes = await request(`/api/radio/${generateJson.programId}`);
    const detailJson = await detailRes.json();
    if (!detailRes.ok || !detailJson.ok || !detailJson.program?.tracks?.length) {
      throw new Error("program detail read failed");
    }
    console.log("[smoke] program detail passed");

    const getSessionRes = await request("/api/playback/session");
    const getSessionJson = await getSessionRes.json();
    if (!getSessionRes.ok || !getSessionJson.ok || !Array.isArray(getSessionJson.session?.queue)) {
      throw new Error("playback session read failed");
    }
    console.log("[smoke] playback session read passed");

    const queue = (detailJson.program.tracks ?? []).map((item) => ({
      track: {
        id: item.track.id,
        name: item.track.name,
        artist: item.track.artist,
        album: item.track.album,
        duration: item.track.duration,
        durationMs: item.track.durationMs,
        coverUrl: item.track.coverUrl,
        audioUrl: item.track.audioUrl,
        externalUrl: item.track.externalUrl,
        localPath: item.track.localPath,
        sourceType: item.track.sourceType,
        playableStatus: item.track.playableStatus,
        language: item.track.language,
        era: item.track.era,
        moodTags: item.track.moodTags,
        styleTags: item.track.styleTags,
        energyLevel: item.track.energyLevel,
        rawMeta: item.track.rawMeta,
      },
      reason: item.reasonText,
      section: item.section,
    }));

    const updateRes = await request("/api/playback/session", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentTrackId: queue[0]?.track.id,
        queue,
        currentIndex: 0,
        currentTime: 12000,
        isPlaying: false,
        volume: 0.7,
        source: queue[0]?.track.sourceType ?? "DEMO",
      }),
    });
    const updateJson = await updateRes.json();
    if (!updateRes.ok || !updateJson.ok) {
      throw new Error("playback session update failed");
    }
    console.log("[smoke] playback session update passed");

    const verifyRes = await request("/api/playback/session");
    const verifyJson = await verifyRes.json();
    if (!verifyRes.ok || !verifyJson.ok || verifyJson.session?.currentTime !== 12000) {
      throw new Error("playback refresh restore failed");
    }
    console.log("[smoke] playback refresh restore passed");

    const homeRes = await request("/");
    const homeHtml = await homeRes.text();
    if (!homeRes.ok || !homeHtml.includes("你的 DJ 已经准备好了")) {
      throw new Error("home proactive render check failed");
    }
    console.log("[smoke] proactive home render passed");

    console.log("[smoke] all checks passed");
  } catch (error) {
    exitCode = 1;
    console.error(`[smoke] failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    stopProcessTree(devProcess.pid);
    process.exit(exitCode);
  }
}

runSmoke();
