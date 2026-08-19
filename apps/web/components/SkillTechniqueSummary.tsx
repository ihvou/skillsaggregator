import type { SkillTechniqueSummary as SummaryData } from "@/lib/data";

/**
 * The technique summary above a skill's video list — what the coaches on this page
 * agree on, synthesised from their transcripts (docs/skill-summary-routine.md).
 *
 * Two constraints shaped this component:
 *
 * 1. SEO. This is the only unique prose on a sub-skill page, so the FULL text ships
 *    in the HTML and is collapsed with CSS. Collapsing by not rendering (state +
 *    conditional JSX) would hide it from crawlers and waste the point of the feature.
 *    Hence `<details>` — semantic, works without JavaScript, and its contents are
 *    part of the document either way.
 *
 * 2. It must not push the videos below the fold. Collapsed it shows the heading and
 *    the first two consensus points; everything else is behind the toggle.
 */
export function SkillTechniqueSummary({ summary, skillName }: { summary: SummaryData; skillName: string }) {
  const consensus = summary.consensus ?? [];
  const mistakes = summary.mistakes ?? [];
  if (consensus.length === 0) return null;

  // Two visible when collapsed; the rest ride inside <details> and stay in the DOM.
  const visible = consensus.slice(0, 2);
  const hidden = consensus.slice(2);
  const hasMore = hidden.length > 0 || mistakes.length > 0;

  return (
    <section
      aria-labelledby="technique-summary-heading"
      className="rounded-xl border border-line bg-bgGroup/40 p-4 sm:p-5"
    >
      <h2 id="technique-summary-heading" className="text-sm font-bold uppercase tracking-wide text-muted">
        What coaches agree on
      </h2>

      <ul className="mt-3 space-y-2">
        {visible.map((item) => (
          <li key={item.point} className="flex gap-2 text-sm leading-snug text-ink">
            <span aria-hidden className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
            <span>{item.point}</span>
          </li>
        ))}
      </ul>

      {hasMore ? (
        <details className="group mt-2">
          <summary className="focus-ring inline-flex cursor-pointer list-none items-center gap-1 rounded-md py-1 text-sm font-semibold text-accent">
            <span className="group-open:hidden">Show more</span>
            <span className="hidden group-open:inline">Show less</span>
          </summary>

          {hidden.length > 0 ? (
            <ul className="mt-2 space-y-2">
              {hidden.map((item) => (
                <li key={item.point} className="flex gap-2 text-sm leading-snug text-ink">
                  <span aria-hidden className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  <span>{item.point}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {mistakes.length > 0 ? (
            <>
              <h3 className="mt-4 text-sm font-bold uppercase tracking-wide text-muted">Common mistakes</h3>
              <ul className="mt-2 space-y-2">
                {mistakes.map((item) => (
                  <li key={item.point} className="flex gap-2 text-sm leading-snug text-ink">
                    <span aria-hidden className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-line" />
                    <span>{item.point}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {/* Provenance. This is synthesised text about physical technique, so say
              plainly where it came from rather than letting it read as our own advice. */}
          <p className="mt-4 text-xs text-muted">
            Summarised from {summary.used_count} {summary.used_count === 1 ? "video" : "videos"} on this{" "}
            {skillName} page. Always follow the coach in the video you are watching.
          </p>
        </details>
      ) : null}
    </section>
  );
}
