import type { NextConfig } from "next";

// Hosts other than localhost that may load the dev server (e.g. a phone on the
// LAN hitting http://<laptop-ip>:3000). Comma-separated in DEV_ORIGINS.
const devOrigins = (process.env.DEV_ORIGINS ?? "192.168.1.13")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// better-sqlite3 and sharp are on Next's built-in serverExternalPackages list,
// so they need no entry here.
const nextConfig: NextConfig = {
  allowedDevOrigins: devOrigins,
};

export default nextConfig;
