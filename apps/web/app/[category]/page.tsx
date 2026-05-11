import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  LevelFilterChips,
  SkillFilterChips,
  SortChips,
} from "@/components/ResourceFilters";
import { ResourceList } from "@/components/ResourceList";
import { getAllCatalogs, getResourceListing } from "@/lib/data";
import { getBaseUrl } from "@/lib/env";
import {
  type PageSearchParams,
  parseLevel,
  parsePage,
  parseSort,
} from "@/lib/listing-params";

export const revalidate = 3600;

export async function generateStaticParams() {
  const catalogs = await getAllCatalogs();
  return catalogs.map(({ category }) => ({ category: category.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category: slug } = await params;
  const listing = await getResourceListing({ categorySlug: slug, pageSize: 1 });
  if (!listing.category) return {};
  return {
    title: `${listing.category.name} resources | Skills Aggregator`,
    description: listing.category.description ?? `Curated resources for ${listing.category.name}.`,
    alternates: { canonical: `${getBaseUrl()}/${listing.category.slug}` },
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams?: Promise<PageSearchParams>;
}) {
  const { category: slug } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const level = parseLevel(resolvedSearchParams);
  const sort = parseSort(resolvedSearchParams);
  const page = parsePage(resolvedSearchParams);
  const listing = await getResourceListing({ categorySlug: slug, level, sort, page });
  if (!listing.category) notFound();

  const pathname = `/${listing.category.slug}`;

  return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <nav className="text-sm text-graphite">
        <Link className="focus-ring hover:text-court" href="/">
          Home
        </Link>
        <span className="px-2">/</span>
        <span>{listing.category.name}</span>
      </nav>

      <header className="mt-8 max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-court">Category</p>
        <h1 className="mt-3 text-4xl font-bold text-ink">{listing.category.name}</h1>
        <p className="mt-4 text-lg leading-8 text-graphite">{listing.category.description}</p>
      </header>

      <section className="mt-8 grid gap-4 rounded-lg border border-ink/10 bg-white/80 p-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-graphite">
            Skills
          </p>
          <SkillFilterChips categorySlug={listing.category.slug} skills={listing.skills} />
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-graphite">
            Level
          </p>
          <LevelFilterChips
            pathname={pathname}
            searchParams={resolvedSearchParams}
            currentLevel={listing.level}
          />
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-graphite">
            Sort
          </p>
          <SortChips pathname={pathname} searchParams={resolvedSearchParams} currentSort={listing.sort} />
        </div>
      </section>

      <section className="mt-8">
        <ResourceList
          resources={listing.resources}
          totalCount={listing.totalCount}
          page={listing.page}
          pageCount={listing.pageCount}
          pathname={pathname}
          searchParams={resolvedSearchParams}
        />
      </section>
    </main>
  );
}
