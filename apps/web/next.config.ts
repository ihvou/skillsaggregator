import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@skillsaggregator/shared"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "*.supabase.in" },
    ],
  },
};

export default nextConfig;
