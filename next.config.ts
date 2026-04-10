import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  distDir: process.env.BUILD_OUTPUT_DIR?.trim() || ".next",
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
