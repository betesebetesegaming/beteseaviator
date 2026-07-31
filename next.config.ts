import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
  },
  async headers() {
    return [
      {
        source: "/play/:path*",
        headers: [
          // Allow QTech/Spribe game clients to register unload handlers (Chrome blocks by default).
          {
            key: "Permissions-Policy",
            value: "unload=*, autoplay=*, fullscreen=*, payment=*, encrypted-media=*",
          },
        ],
      },
      {
        source: "/downloads/:path*.apk",
        headers: [
          { key: "Content-Type", value: "application/vnd.android.package-archive" },
          { key: "Content-Disposition", value: "attachment; filename=\"BeteseAviator.apk\"" },
          { key: "Cache-Control", value: "public, max-age=3600" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      { source: "/admin/login", destination: "/s", permanent: false },
      { source: "/staff", destination: "/s", permanent: false },
      { source: "/play/game/aviator", destination: "/play/game/qt-spb-aviator", permanent: true },
      { source: "/play/game/aviator-turbo", destination: "/play/game/qt-spb-aviator", permanent: true },
      { source: "/play/game/qtech-aviator", destination: "/play/game/qt-spb-aviator", permanent: true },
      { source: "/play/game/crash", destination: "/play/game/qt-spb-aviator", permanent: true },
      { source: "/play/game/crash-turbo", destination: "/play/game/qt-spb-aviator", permanent: true },
      { source: "/play/game/qtech-crash", destination: "/play/game/qt-spb-aviator", permanent: true },
    ];
  },
};

export default nextConfig;
