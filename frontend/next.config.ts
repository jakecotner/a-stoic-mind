import type { NextConfig } from "next";

// The FastAPI origin. The browser only ever talks to the Next origin — these
// rewrites proxy /api/* server-side, so the httponly auth cookie stays
// first-party and no CORS is involved (SSE streams pass through fine).
//
// NOTE: next.config is serialized into the build, so API_URL must be set at
// BUILD time (the Dockerfile declares it as an ARG; on Railway point it at
// the backend's private-network URL, e.g. http://backend.railway.internal:8000).
const API_URL = process.env.API_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  output: "standalone",
  // Pin the workspace root so a stray lockfile in a parent directory can't
  // change what gets traced into the standalone build.
  turbopack: { root: __dirname },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
};

export default nextConfig;
