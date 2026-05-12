import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Don't bundle the NetEase API package — it needs filesystem access
  serverExternalPackages: ["@neteasecloudmusicapienhanced/api"],
};

export default nextConfig;

