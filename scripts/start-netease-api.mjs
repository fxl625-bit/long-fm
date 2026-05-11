import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const requireFromHere = createRequire(import.meta.url);
const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const logsDir = resolve(projectRoot, ".logs");
const pidFile = resolve(logsDir, "netease-api.pid");

mkdirSync(logsDir, { recursive: true });

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

if (existsSync(pidFile)) {
  const existingPid = Number(readFileSync(pidFile, "utf8").trim());
  if (Number.isFinite(existingPid) && isProcessAlive(existingPid)) {
    console.log(`[netease-api] already running on pid ${existingPid}`);
    process.exit(0);
  }
}

const apiEntry = requireFromHere.resolve("@neteasecloudmusicapienhanced/api/app.js");
const stdoutPath = resolve(logsDir, "netease-api.stdout.log");
const stderrPath = resolve(logsDir, "netease-api.stderr.log");

const child = spawn(process.execPath, [apiEntry], {
  cwd: projectRoot,
  detached: true,
  stdio: [
    "ignore",
    openSync(stdoutPath, "a"),
    openSync(stderrPath, "a"),
  ],
  env: {
    ...process.env,
    PORT: "3001",
    HOST: "127.0.0.1",
  },
});

child.unref();
writeFileSync(pidFile, String(child.pid));
console.log(`[netease-api] started pid ${child.pid}`);
