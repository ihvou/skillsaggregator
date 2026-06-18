#!/usr/bin/env node
/**
 * Re-runnable M79 routine for assigning pedagogical Learning Path order.
 *
 * Usage:
 *   node scripts/populate-subskill-learning-order.mjs --dry-run
 *   node scripts/populate-subskill-learning-order.mjs --category badminton
 */
import { createServiceRoleSupabaseClient } from "./_lib/link-transcripts.mjs";
import {
  CURATED_SUBSKILL_ORDERS,
  itemsForCategory,
} from "./_lib/subskill-learning-order.mjs";

function parseArgs(argv) {
  const options = {
    dryRun: false,
    category: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--category") {
      options.category = argv[index + 1] ?? null;
      index += 1;
    } else if (arg.startsWith("--category=")) {
      options.category = arg.slice("--category=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function log(event, metadata = {}) {
  console.log(JSON.stringify({
    event,
    ts: new Date().toISOString(),
    ...metadata,
  }));
}

async function loadActiveSkills(supabase) {
  const { data, error } = await supabase
    .from("skills")
    .select("id, slug, name, subskill_difficulty, learning_order, categories!inner(slug)")
    .eq("is_active", true)
    .order("name");
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    subskill_difficulty: row.subskill_difficulty,
    learning_order: row.learning_order,
    category_slug: Array.isArray(row.categories)
      ? row.categories[0]?.slug
      : row.categories?.slug,
  })).filter((row) => row.category_slug);
}

function groupByCategory(skills) {
  const byCategory = new Map();
  for (const skill of skills) {
    const bucket = byCategory.get(skill.category_slug) ?? [];
    bucket.push(skill);
    byCategory.set(skill.category_slug, bucket);
  }
  return byCategory;
}

async function applyCuratedOrder(supabase, categorySlug, dryRun) {
  const items = itemsForCategory(categorySlug);
  if (items.length === 0) return { updated_count: 0, skipped: "no_curated_order" };
  if (dryRun) return { dry_run: true, updated_count: items.length, items };

  const { data, error } = await supabase.rpc("set_skill_learning_order", {
    p_category_slug: categorySlug,
    p_items: items,
  });
  if (error) throw error;
  return data;
}

async function applyFallbacks(supabase, skills, dryRun) {
  const missing = skills
    .filter((skill) => skill.subskill_difficulty === null || skill.learning_order === null)
    .sort((a, b) =>
      a.category_slug.localeCompare(b.category_slug) ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id),
    );

  if (dryRun || missing.length === 0) {
    return { missing_count: missing.length, dry_run: dryRun, skills: missing };
  }

  for (const [index, skill] of missing.entries()) {
    const { error } = await supabase
      .from("skills")
      .update({
        subskill_difficulty: skill.subskill_difficulty ?? 3,
        learning_order: skill.learning_order ?? 900 + index + 1,
      })
      .eq("id", skill.id);
    if (error) throw error;
  }

  return { missing_count: missing.length, updated_count: missing.length };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const supabase = createServiceRoleSupabaseClient();
  const activeSkills = await loadActiveSkills(supabase);
  const byCategory = groupByCategory(activeSkills);
  const categorySlugs = options.category
    ? [options.category]
    : [...new Set([
        ...Object.keys(CURATED_SUBSKILL_ORDERS),
        ...byCategory.keys(),
      ])].sort();

  log("subskill_learning_order_started", {
    dry_run: options.dryRun,
    category_count: categorySlugs.length,
    active_skill_count: activeSkills.length,
  });

  const results = [];
  for (const categorySlug of categorySlugs) {
    const categorySkills = byCategory.get(categorySlug) ?? [];
    const curated = new Set(CURATED_SUBSKILL_ORDERS[categorySlug] ?? []);
    const unmapped = categorySkills
      .filter((skill) => !curated.has(skill.slug))
      .map((skill) => ({ slug: skill.slug, name: skill.name }));
    const result = await applyCuratedOrder(supabase, categorySlug, options.dryRun);
    results.push({ category_slug: categorySlug, ...result, unmapped });
    log("subskill_learning_order_category", {
      category_slug: categorySlug,
      active_skill_count: categorySkills.length,
      curated_count: curated.size,
      unmapped_count: unmapped.length,
      result,
      unmapped,
    });
  }

  const refreshedSkills = options.dryRun ? activeSkills : await loadActiveSkills(supabase);
  const fallbackResult = await applyFallbacks(supabase, refreshedSkills, options.dryRun);
  log("subskill_learning_order_finished", {
    dry_run: options.dryRun,
    categories: results.length,
    fallback: fallbackResult,
  });
}

main().catch((error) => {
  log("subskill_learning_order_failed", {
    message: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
