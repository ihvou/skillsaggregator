import Link from "next/link";
import type { SkillResource } from "@skillsaggregator/shared";
import { hrefWithParams } from "./ResourceFilters";
import { ResourceCard } from "./ResourceCard";

type SearchValue = string | string[] | undefined;
type SearchParams = Record<string, SearchValue>;

interface ResourceListProps {
  resources: SkillResource[];
  totalCount: number;
  page: number;
  pageCount: number;
  pathname: string;
  searchParams: SearchParams;
}

export function ResourceList({
  resources,
  totalCount,
  page,
  pageCount,
  pathname,
  searchParams,
}: ResourceListProps) {
  if (!resources.length) {
    return (
      <div className="rounded-lg border border-dashed border-ink/20 bg-white/70 p-6 text-sm leading-6 text-graphite">
        No approved resources match these filters yet. Run local collection, approve a few
        suggestions, and this page will fill in automatically.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-sm text-graphite">
        <p>
          Showing {resources.length} of {totalCount} approved resources
        </p>
        {pageCount > 1 ? <p>Page {page} of {pageCount}</p> : null}
      </div>
      <div className="space-y-3">
        {resources.map((resource) => (
          <ResourceCard key={resource.id} resource={resource} />
        ))}
      </div>
      {pageCount > 1 ? (
        <nav className="mt-6 flex flex-wrap gap-2" aria-label="Resource pages">
          {page > 1 ? (
            <Link
              className="focus-ring rounded-md border border-ink/10 bg-white px-3 py-2 text-sm font-semibold text-ink hover:border-court/50 hover:text-court"
              href={hrefWithParams(pathname, searchParams, { page: String(page - 1) })}
            >
              Previous
            </Link>
          ) : null}
          {page < pageCount ? (
            <Link
              className="focus-ring rounded-md border border-ink/10 bg-white px-3 py-2 text-sm font-semibold text-ink hover:border-court/50 hover:text-court"
              href={hrefWithParams(pathname, searchParams, { page: String(page + 1) })}
            >
              Next
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
