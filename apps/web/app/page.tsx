import type { Metadata } from "next";
import { DiscoverBrowser } from "@/components/DiscoverBrowser";
import { JsonLd } from "@/components/JsonLd";
import { getDiscoverSections } from "@/lib/data";
import { getBaseUrl } from "@/lib/env";

// One hour. The previous 24h assumed on-demand revalidation would cover the gap,
// but nothing calls /api/revalidate — see the note in [category]/[skill]/page.tsx.
export const revalidate = 3600;

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
  const sections = await getDiscoverSections(12);

  return (
    <>
      <JsonLd data={homeJsonLd()} />
      <DiscoverBrowser sections={sections} />
    </>
  );
}
