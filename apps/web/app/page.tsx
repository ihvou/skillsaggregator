import { DiscoverBrowser } from "@/components/DiscoverBrowser";
import { getDiscoverSections } from "@/lib/data";

// Daily content cadence — revalidate every 24h; on-demand revalidation
// refreshes sooner when the nightly adds content (see tasks.md MI23).
export const revalidate = 86400;

export default async function HomePage() {
  const sections = await getDiscoverSections();

  return <DiscoverBrowser sections={sections} />;
}
