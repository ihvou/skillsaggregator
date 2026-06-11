import { AppDownloadButtons } from "@/components/AppDownloadButtons";
import { PageHeader } from "@/components/PageHeader";
import { SectionHeader } from "@/components/SectionHeader";
import { SkillTile } from "@/components/SkillTile";
import { SuggestLinkButton } from "@/components/SuggestLinkButton";
import { getDiscoverSections } from "@/lib/data";

export const revalidate = 3600;

export default async function HomePage() {
  const sections = await getDiscoverSections();

  return (
    <div className="pb-20">
      <PageHeader
        title="The best free tutorials, sorted by skill."
        subtitle="Curated free tutorials for every sub-skill across sports and training."
      />

      <section className="mx-auto mt-6 max-w-5xl px-4">
        <AppDownloadButtons />
        <div className="mt-4">
          <SuggestLinkButton />
        </div>
      </section>

      <div className="mt-12 space-y-14">
        {sections.map((section) => (
          <section key={section.category.id} aria-labelledby={`cat-${section.category.slug}`}>
            <div className="mx-auto max-w-5xl px-4">
              <SectionHeader title={section.category.name} href={`/${section.category.slug}`} />
            </div>
            <div className="mt-5 overflow-x-auto no-scrollbar">
              <div className="mx-auto flex max-w-5xl gap-4 px-4 pb-2">
                {section.skills.map((tile) => (
                  <SkillTile
                    key={tile.skill.id}
                    skill={tile.skill}
                    thumbnailUrl={tile.latest_thumbnail}
                  />
                ))}
              </div>
            </div>
            <div className="mx-auto mt-6 max-w-5xl px-4">
              <div className="h-px bg-divider" />
            </div>
          </section>
        ))}
        {sections.length === 0 ? (
          <div className="mx-auto max-w-5xl px-4 text-sm text-muted">
            No approved resources yet. Run the agent to populate the catalog.
          </div>
        ) : null}
      </div>
    </div>
  );
}
