import { Sparkles } from "lucide-react";
import {
  CategoryCards,
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
        <div className="mx-auto max-w-6xl px-4 py-12 lg:py-16">
          <p className="inline-flex items-center gap-2 rounded-full bg-court/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-court">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Skills Aggregator
          </p>
          <h1 className="mt-4 max-w-4xl text-4xl font-bold leading-tight text-ink md:text-6xl">
            The best free tutorials, sorted by the exact skill you want to learn.
          </h1>
          <div className="mt-5 max-w-3xl space-y-4 text-base leading-8 text-graphite md:text-lg">
            <p>
              Want to nail a forehand smash? Master the padel bandeja? Build a stronger squat?
              We organize the web's best free tutorials by the exact skill they teach — so you
              skip the search rabbit hole and get straight to practicing.
            </p>
            <p>
              Found a great video we missed?{" "}
              <span className="font-semibold text-ink">Suggest a link in seconds</span> — no
              signup needed. Want credit on the contributors page?{" "}
              <span className="font-semibold text-ink">Just log in</span>.
            </p>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-8 grid gap-6">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-graphite">
              Pick a sport
            </p>
            <CategoryCards categories={listing.categories} />
          </div>

          <div className="grid gap-4 rounded-lg border border-ink/10 bg-white/80 p-4">
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
