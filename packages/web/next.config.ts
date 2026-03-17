import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["protobufjs", "@phala/dstack-sdk", "undici", "https-proxy-agent", "agent-base", "global-agent"],
  transpilePackages: ["@rizz/shared"],
};

export default nextConfig;
