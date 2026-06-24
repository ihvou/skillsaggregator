import Link from "next/link";

export const metadata = {
  title: "Privacy Policy",
  description: "Privacy policy for Subskills.",
};

const sections = [
  {
    title: "Data We Store On Your Device",
    body: "The mobile app stores app settings such as onboarding preferences and authentication session data on your device. Saved resources, watched state, and resource votes require sign-in and are stored in your private account state.",
  },
  {
    title: "Account And Contribution Data",
    body: "Subskills uses Supabase authentication to identify signed-in users and may store email addresses, auth identifiers, saved resources, watched state, votes, submitted links, public notes, display names, profile slugs, and contribution history.",
  },
  {
    title: "Network Data",
    body: "The app requests public catalog data from Subskills services, including categories, skills, links, vote counts, thumbnails, and contributor summaries. Opening a resource link leaves the app and is governed by the destination site's privacy policy.",
  },
  {
    title: "Analytics And Tracking",
    body: "The current mobile app does not include third-party advertising SDKs or cross-app tracking. If analytics are added later, this policy should be updated before release.",
  },
  {
    title: "Children's Privacy",
    body: "Subskills is not directed to children under 13. Do not submit personal information if you are under 13.",
  },
  {
    title: "Data Deletion",
    body: "Signed-in users can delete their account from the mobile Account tab or from /account/delete on the web. Deletion removes the auth account, private saved/watched/vote state, and contributor profile. Public resources previously submitted by the account may remain in the catalog without the deleted profile attached, so learners do not lose reviewed resources.",
  },
  {
    title: "Changes",
    body: 'We may update this policy as the app changes. The updated policy will include a new "Last updated" date.',
  },
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 pb-20 pt-10">
      <p className="text-sm font-semibold uppercase tracking-wide text-muted">Last updated June 25, 2026</p>
      <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-ink md:text-5xl">
        Privacy Policy
      </h1>
      <p className="mt-5 text-base leading-7 text-muted md:text-lg">
        Subskills helps people discover and save sport learning resources. This policy
        explains what data the app uses and how it is handled.
      </p>

      <div className="mt-10 space-y-8">
        {sections.map((section) => (
          <section key={section.title}>
            <h2 className="text-xl font-bold text-ink">{section.title}</h2>
            <p className="mt-3 text-base leading-7 text-muted">{section.body}</p>
          </section>
        ))}
      </div>

      <section className="mt-8">
        <h2 className="text-xl font-bold text-ink">Contact</h2>
        <p className="mt-3 text-base leading-7 text-muted">
          For privacy questions, open an issue at{" "}
          <a
            className="focus-ring font-semibold text-ink underline decoration-divider underline-offset-4 transition hover:decoration-ink"
            href="https://github.com/ihvou/skillsaggregator/issues"
          >
            github.com/ihvou/skillsaggregator/issues
          </a>
          .
          {" "}For account deletion, use{" "}
          <Link
            className="focus-ring font-semibold text-ink underline decoration-divider underline-offset-4 transition hover:decoration-ink"
            href="/account/delete"
          >
            subskills.xyz/account/delete
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
