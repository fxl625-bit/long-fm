import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type EnvMap = Record<string, string>;

let envFileCache: { env: EnvMap; local: EnvMap } | null = null;

function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseEnvFile(filePath: string): EnvMap {
  if (!existsSync(filePath)) {
    return {};
  }

  const content = readFileSync(filePath, "utf8");
  const output: EnvMap = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    const rawValue = trimmed.slice(equalsIndex + 1);
    if (!key) {
      continue;
    }

    output[key] = stripWrappingQuotes(rawValue);
  }

  return output;
}

function getEnvFiles() {
  if (envFileCache) {
    return envFileCache;
  }

  const root = process.cwd();
  envFileCache = {
    env: parseEnvFile(resolve(root, ".env")),
    local: parseEnvFile(resolve(root, ".env.local")),
  };

  return envFileCache;
}

export function readServerEnvVar(key: string): string | undefined {
  const fromProcess = process.env[key];
  if (typeof fromProcess === "string" && fromProcess.trim()) {
    return stripWrappingQuotes(fromProcess);
  }

  const envFiles = getEnvFiles();
  const fromLocal = envFiles.local[key];
  if (fromLocal?.trim()) {
    return stripWrappingQuotes(fromLocal);
  }

  const fromEnv = envFiles.env[key];
  if (fromEnv?.trim()) {
    return stripWrappingQuotes(fromEnv);
  }

  return undefined;
}

export function clearServerEnvCache() {
  envFileCache = null;
}

