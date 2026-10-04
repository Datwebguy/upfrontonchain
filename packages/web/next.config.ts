import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The app imports chain ids, addresses and ABIs from packages/config, one level above this package.
  turbopack: { root: path.join(__dirname, "../..") },
  reactStrictMode: true,
};

export default nextConfig;
