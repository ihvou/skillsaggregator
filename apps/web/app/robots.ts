import type { MetadataRoute } from "next";
import { getBaseUrl } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    // Allow every crawler (search + AI assistants) on the real pages, but
    // disallow query-string URLs. The category filter chips generate
    // ?skills=…&level=…&sort=… permutations — a combinatorial space (~12M URLs
    // per category) that is uncacheable (searchParams force dynamic render) and
    // is duplicate content. Left open, ClaudeBot enumerated it: 370K requests,
    // 0% cache hits, ~1.36M function renders, 22.5 CPU-hours → Hobby pause
    // (2026-06-09/11). Disallowing `/*?` closes the trap for all crawlers while
    // keeping the 166 canonical pages fully indexable. See tasks.md B5/M-series.
    rules: [{ userAgent: "*", allow: "/", disallow: "/*?" }],
    sitemap: `${getBaseUrl()}/sitemap.xml`,
  };
}
