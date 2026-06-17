import type { Metadata } from "next";
import { DiscoverBrowser } from "@/components/DiscoverBrowser";
import { JsonLd } from "@/components/JsonLd";
import { getDiscoverSections } from "@/lib/data";
import { getBaseUrl } from "@/lib/env";

// Daily content cadence — revalidate every 24h; on-demand revalidation
// refreshes sooner when the nightly adds content (see tasks.md MI23).
export const revalidate = 86400;

const homeDescription =
  "Free sport and training tutorials organized by sub-skill, level, and source.";

export const metadata: Metadata = {
  title: { absolute: "Subskills — Free tutorials, sorted by skill" },
  description: homeDescription,
  alternates: { canonical: "/" },
  openGraph: {
    title: "Subskills — Free tutorials, sorted by skill",
    description: homeDescription,
    url: "/",
  },
};

function homeJsonLd() {
  const baseUrl = getBaseUrl();
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${baseUrl}/#website`,
        name: "Subskills",
        url: `${baseUrl}/`,
        description: homeDescription,
        potentialAction: {
          "@type": "SearchAction",
          target: `${baseUrl}/?q={search_term_string}`,
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": "Organization",
        "@id": `${baseUrl}/#organization`,
        name: "Subskills",
        url: `${baseUrl}/`,
        logo: `${baseUrl}/apple-icon.png`,
      },
    ],
  };
}

export default async function HomePage() {
  const sections = await getDiscoverSections();

  return (
    <>
      <JsonLd data={homeJsonLd()} />
      <DiscoverBrowser sections={sections} />
    </>
  );
}
