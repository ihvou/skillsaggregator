import { PageHeader } from "@/components/PageHeader";

export const metadata = {
  title: "Support",
  description: "Support and catalog problem reporting for Subskills.",
};

export default function SupportPage() {
  return (
    <div className="pb-20">
      <PageHeader
        title="Support"
        subtitle="Get help, report catalog problems, or ask privacy/account questions."
        backHref="/"
      />
      <section className="mx-auto max-w-3xl px-4">
        <div className="mt-8 space-y-8 rounded-lg bg-surface p-5 shadow-card ring-1 ring-divider">
          <section>
            <h2 className="text-xl font-extrabold text-ink">Contact</h2>
            <p className="mt-3 text-base leading-7 text-muted">
              Open a support issue at{" "}
              <a
                className="focus-ring font-semibold text-ink underline decoration-divider underline-offset-4 transition hover:decoration-ink"
                href="https://github.com/ihvou/skillsaggregator/issues"
              >
                github.com/ihvou/skillsaggregator/issues
              </a>
              . Include the affected resource URL, category, skill, and a short description
              of the problem.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-extrabold text-ink">Resource Reports</h2>
            <p className="mt-3 text-base leading-7 text-muted">
              Subskills reviews submitted resources before they appear publicly. Reports about
              inaccurate, unsafe, duplicated, broken, or off-topic resources are routed back
              into the same moderation process.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-extrabold text-ink">Account Deletion</h2>
            <p className="mt-3 text-base leading-7 text-muted">
              Signed-in users can delete their account from the mobile Account tab or the
              dedicated web deletion page.
            </p>
          </section>
        </div>
      </section>
    </div>
  );
}
