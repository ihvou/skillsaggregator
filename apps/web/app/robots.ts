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
    // Both formats, same URL set. The plain-text one is listed because Search
    // Console has reported "Sitemap could not be read" for the XML since
    // 2026-08-15 despite it validating everywhere we can measure; robots.txt is
    // a discovery path independent of the Search Console submission, and a
    // crawler that chokes on one file can still take the other. See the header
    // comment in app/sitemap.txt/route.ts.
    sitemap: [`${getBaseUrl()}/sitemap.xml`, `${getBaseUrl()}/sitemap.txt`],
  };
}
