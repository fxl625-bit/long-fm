import { realpathSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";

const cwd = realpathSync.native(process.cwd());
const nextBin = join(cwd, "node_modules", "next", "dist", "bin", "next");

const child = spawn(process.execPath, [nextBin, "build", "--webpack"], {
  cwd,
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
