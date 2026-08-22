import type { MetadataRoute } from "next";
import { getBaseUrl } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    // Allow crawlable campaign/referral query strings so search engines can read
    // the canonical and consolidate links. Keep only the old filter dimensions
    // blocked: they once produced a crawler-enumerated duplicate URL space, and
    // the client-side filters do not need to be indexed separately.
    //
    // `/suggest?` is blocked separately. Narrowing the old blanket `Disallow: /*?`
    // to the three filter keys reopened it by accident: the suggest form takes
    // `?category=&skill=` — note `skill=` singular, which `/*?*skills=` does not
    // match — so every category/sub-skill pair became a crawlable near-duplicate
    // of the same form, ~490 skills x 13 categories of it. Search Console had 9
    // such URLs already recorded under "Blocked by robots.txt" from the old rule
    // (crawled 2026-06-18..28); without this line they would come back allowed.
    // The bare /suggest page stays crawlable — only the parameterised variants go.
    rules: [{
      userAgent: "*",
      allow: "/",
      disallow: ["/*?*skills=", "/*?*level=", "/*?*sort=", "/suggest?"],
    }],
    sitemap: `${getBaseUrl()}/sitemap.xml`,
  };
}
