import Link from "next/link";
import { ArrowRight, Layers, ShieldCheck } from "lucide-react";
import {
  CategoryFilterChips,
  LevelFilterChips,
  SortChips,
} from "@/components/ResourceFilters";
import { ResourceList } from "@/components/ResourceList";
import { getResourceListing } from "@/lib/data";
import {
  type PageSearchParams,
  parseLevel,
  parsePage,
  parseSort,
} from "@/lib/listing-params";

export const revalidate = 3600;

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<PageSearchParams>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const level = parseLevel(resolvedSearchParams);
  const sort = parseSort(resolvedSearchParams);
  const page = parsePage(resolvedSearchParams);
  const listing = await getResourceListing({ level, sort, page });

  return (
    <div>
      <section className="border-b border-ink/10 bg-white/75">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 lg:grid-cols-[1fr_320px] lg:py-14">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-court">
              Skills Aggregator
            </p>
            <h1 className="mt-3 max-w-4xl text-4xl font-bold leading-tight text-ink md:text-6xl">
              Curated learning resources across sports and training skills
            </h1>
            <div className="mt-5 max-w-3xl space-y-4 text-base leading-8 text-graphite md:text-lg">
              <p>
                This site collects practical tutorials for specific skills: a padel bandeja,
                a surf pop-up, a safer bench press, or a cleaner badminton smash. Each resource
                is attached to the exact skill it teaches so learners can skip broad search
                results and get straight to focused practice.
              </p>
              <p>
                Local collection suggests candidates from trusted sources, then moderators review
                the notes, level, and evidence before a link appears publicly. The result is a
                multi-sport library that stays searchable, shareable, and deliberately human-curated.
              </p>
            </div>
          </div>
          <aside className="grid content-start gap-3 text-sm text-graphite">
            <div className="rounded-lg border border-ink/10 bg-sky-50 p-4">
              <Layers className="h-5 w-5 text-sky-700" aria-hidden="true" />
              <p className="mt-3 font-semibold text-ink">{listing.categories.length} active categories</p>
              <p className="mt-1 leading-6">Use category chips to jump into a sport-specific resource page.</p>
            </div>
            <div className="rounded-lg border border-ink/10 bg-amber-50 p-4">
              <ShieldCheck className="h-5 w-5 text-amberline" aria-hidden="true" />
              <p className="mt-3 font-semibold text-ink">Moderated by default</p>
              <p className="mt-1 leading-6">Suggestions stay pending until a moderator approves them.</p>
            </div>
          </aside>
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-8 grid gap-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-court">
                Resource library
              </p>
              <h2 className="mt-1 text-2xl font-bold text-ink">
                Browse approved resources
              </h2>
            </div>
            <Link
              href="/admin"
              className="focus-ring inline-flex min-h-10 items-center gap-2 rounded-md border border-ink/15 bg-white px-3 text-sm font-semibold text-ink hover:border-court/50 hover:text-court"
            >
              Moderation queue
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>

          <div className="grid gap-4 rounded-lg border border-ink/10 bg-white/80 p-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-graphite">
                Categories
              </p>
              <CategoryFilterChips categories={listing.categories} />
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-graphite">
                Level
              </p>
              <LevelFilterChips
                pathname="/"
                searchParams={resolvedSearchParams}
                currentLevel={listing.level}
              />
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-graphite">
                Sort
              </p>
              <SortChips pathname="/" searchParams={resolvedSearchParams} currentSort={listing.sort} />
            </div>
          </div>
        </div>

        <ResourceList
          resources={listing.resources}
          totalCount={listing.totalCount}
          page={listing.page}
          pageCount={listing.pageCount}
          pathname="/"
          searchParams={resolvedSearchParams}
        />
      </main>
    </div>
  );
}
