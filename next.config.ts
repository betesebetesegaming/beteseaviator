import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
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
