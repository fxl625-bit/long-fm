import { createRequire } from "node:module";
import { readServerEnvVar } from "@/lib/config/server-env";

export type NeteaseApiMode = "package" | "remote";

const requireFromHere = createRequire(import.meta.url);

function isPackageInstalled(name: string) {
  try {
    requireFromHere.resolve(name);
    return true;
  } catch {
    return false;
  }
}

export function getInstalledNeteaseApiPackage() {
  if (isPackageInstalled("@neteasecloudmusicapienhanced/api")) {
    return "@neteasecloudmusicapienhanced/api";
  }
  if (isPackageInstalled("@neteaseapireborn/api")) {
    return "@neteaseapireborn/api";
  }
  return null;
}

export function resolveNeteaseApiMode(): NeteaseApiMode {
  const requested = readServerEnvVar("NETEASE_API_MODE");
  const installedPackage = getInstalledNeteaseApiPackage();

  if (requested === "package" && installedPackage) {
    return "package";
  }

  if (requested === "remote") {
    return "remote";
  }

  return installedPackage ? "package" : "remote";
}

export function getNeteaseApiBaseUrl() {
  const configured = readServerEnvVar("NETEASE_API_BASE_URL");
  if (configured) {
    return configured;
  }

  return "http://127.0.0.1:3001";
}
