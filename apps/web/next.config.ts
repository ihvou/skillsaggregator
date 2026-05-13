import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@skillsaggregator/shared"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "*.ytimg.com" },
      { protocol: "https", hostname: "img.youtube.com" },
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "*.supabase.in" },
      { protocol: "http", hostname: "127.0.0.1", port: "54321" },
      { protocol: "http", hostname: "localhost", port: "54321" },
      { protocol: "http", hostname: "192.168.10.108", port: "54321" },
    ],
  },
};

export default nextConfig;
