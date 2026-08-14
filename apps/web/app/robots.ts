import type { MetadataRoute } from "next";
import { getBaseUrl } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    // Allow crawlable campaign/referral query strings so search engines can read
    // the canonical and consolidate links. Keep only the old filter dimensions
    // blocked: they once produced a crawler-enumerated duplicate URL space, and
    // the client-side filters do not need to be indexed separately.
    rules: [{
      userAgent: "*",
      allow: "/",
      disallow: ["/*?*skills=", "/*?*level=", "/*?*sort="],
    }],
    sitemap: `${getBaseUrl()}/sitemap.xml`,
  };
}
