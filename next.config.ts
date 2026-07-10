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
    ];
  },
  async redirects() {
    return [
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
