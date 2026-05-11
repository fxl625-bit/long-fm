import { existsSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const envPath = resolve(root, ".env");
const envExamplePath = resolve(root, ".env.example");

if (existsSync(envPath)) {
  console.log("[env] .env already exists");
  process.exit(0);
}

copyFileSync(envExamplePath, envPath);
console.log("[env] created .env from .env.example");
