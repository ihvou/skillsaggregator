import Link from "next/link";
import Image from "next/image";
import { ArrowRight, SearchCheck, ShieldCheck } from "lucide-react";
import { SkillGrid } from "@/components/SkillGrid";
import { getCatalog } from "@/lib/data";

export const revalidate = 3600;

export default async function HomePage() {
  const { category, skills } = await getCatalog();

  return (
    <div>
      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-12 lg:grid-cols-[1fr_360px] lg:py-16">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-court">
            Badminton MVP
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-bold leading-tight text-ink md:text-6xl">
            Best free resources for improving specific badminton skills
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-graphite">
            Browse technique pages populated through an agent-powered suggestion pipeline and a
            compact moderation queue.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href={`/${category.slug}`}
              className="focus-ring inline-flex items-center gap-2 rounded-md bg-court px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-ink"
            >
              Browse {category.name}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href="/admin"
              className="focus-ring inline-flex items-center gap-2 rounded-md border border-ink/15 bg-white px-4 py-3 text-sm font-semibold text-ink hover:border-court/50"
            >
              Moderation queue
            </Link>
          </div>
        </div>
        <div className="grid content-start gap-3">
          <div className="overflow-hidden rounded-lg border border-ink/10 bg-white shadow-sm">
            <div className="relative aspect-video bg-ink/10">
              <Image
                src="/badminton-court.svg"
                alt="Badminton court preview"
                fill
                sizes="360px"
                className="object-cover"
                priority
              />
            </div>
            <div className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-court">
                Resource preview
              </p>
              <p className="mt-2 text-sm leading-6 text-graphite">
                Skill pages use cached thumbnails and curator notes from approved suggestions.
              </p>
            </div>
          </div>
          <div className="rounded-lg border border-ink/10 bg-white p-4 shadow-sm">
            <SearchCheck className="h-5 w-5 text-court" aria-hidden="true" />
            <h2 className="mt-3 text-base font-semibold text-ink">Automated discovery</h2>
            <p className="mt-2 text-sm leading-6 text-graphite">
              Link Searcher expands skill queries, scores transcripts, and submits structured
              suggestions.
            </p>
          </div>
          <div className="rounded-lg border border-ink/10 bg-white p-4 shadow-sm">
            <ShieldCheck className="h-5 w-5 text-amberline" aria-hidden="true" />
            <h2 className="mt-3 text-base font-semibold text-ink">Triangulated approvals</h2>
            <p className="mt-2 text-sm leading-6 text-graphite">
              Claude, OpenAI, and Perplexity votes are stored per suggestion for transparent
              moderation.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-court">
              {skills.length} sub-skills
            </p>
            <h2 className="mt-1 text-2xl font-bold text-ink">{category.name}</h2>
          </div>
          <Link className="focus-ring text-sm font-semibold text-court hover:text-ink" href="/badminton">
            Category page
          </Link>
        </div>
        <SkillGrid category={category} skills={skills} />
      </section>
    </div>
  );
}
