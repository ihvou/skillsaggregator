import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@skillsaggregator/shared"],
  images: {
    // Serve thumbnails directly from their source CDNs instead of through
    // /_next/image. Sources are already-optimized JPEGs (YouTube hqdefault
    // ~480px/~25KB, TikTok CDN, Supabase storage), so on-the-fly resizing buys
    // little — and costs a lot: next/image emitted a 16-variant srcset (16w to
    // 3840w) per thumbnail, ~2.6K image URLs per category page. Each variant a
    // client or bot fetched was host image-CDN work + bandwidth (part of the
    // 2026-06 bot-traffic bill), and the srcset bloat alone was ~300KB of HTML
    // per page.
    // Reassessed for M68 on 2026-06-18: keep this on until we introduce a
    // capped image loader/transform policy; reopening unbounded transforms
    // would trade a modest LCP win for the same bot-amplification cost risk.
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "*.ytimg.com" },
      { protocol: "https", hostname: "img.youtube.com" },
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "*.supabase.in" },
      { protocol: "https", hostname: "*.tiktokcdn.com" },
      { protocol: "https", hostname: "*.tiktokcdn-us.com" },
      { protocol: "https", hostname: "*.tiktokcdn-eu.com" },
      { protocol: "https", hostname: "*.muscdn.com" },
      { protocol: "http", hostname: "127.0.0.1", port: "54321" },
      { protocol: "http", hostname: "localhost", port: "54321" },
      { protocol: "http", hostname: "192.168.10.108", port: "54321" },
    ],
  },
};

export default nextConfig;
