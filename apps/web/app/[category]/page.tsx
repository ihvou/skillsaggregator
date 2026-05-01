import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SkillGrid } from "@/components/SkillGrid";
import { getCatalog } from "@/lib/data";
import { getBaseUrl } from "@/lib/env";

export const revalidate = 3600;

export async function generateStaticParams() {
  const { category } = await getCatalog();
  return [{ category: category.slug }];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category: slug } = await params;
  const { category } = await getCatalog();
  if (category.slug !== slug) return {};
  return {
    title: category.name,
    description: category.description ?? "Badminton skill resources.",
    alternates: { canonical: `${getBaseUrl()}/${category.slug}` },
  };
}

export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category: slug } = await params;
  const { category, skills } = await getCatalog();
  if (slug !== category.slug) notFound();

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <nav className="text-sm text-graphite">
        <Link className="focus-ring hover:text-court" href="/">
          Home
        </Link>
        <span className="px-2">/</span>
        <span>{category.name}</span>
      </nav>
      <div className="mt-8 max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-court">Category</p>
        <h1 className="mt-3 text-4xl font-bold text-ink">{category.name}</h1>
        <p className="mt-4 text-lg leading-8 text-graphite">{category.description}</p>
      </div>
      <div className="mt-8">
        <SkillGrid category={category} skills={skills} />
      </div>
    </div>
  );
}
