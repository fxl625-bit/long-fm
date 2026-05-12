import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@neteasecloudmusicapienhanced/api"],
  // Ensure the NetEase package's data files are included in the serverless bundle
  outputFileTracingIncludes: {
    "/**/*": ["node_modules/@neteasecloudmusicapienhanced/api/data/**"],
  },
};

export default nextConfig;

