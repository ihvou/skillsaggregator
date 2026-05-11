import type { SkillLevel } from "@skillsaggregator/shared";
import type { ResourceSort } from "./data";

export type PageSearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function parseLevel(searchParams: PageSearchParams): SkillLevel | null {
  const value = first(searchParams.level);
  return value === "beginner" || value === "intermediate" || value === "advanced"
    ? value
    : null;
}

export function parseSort(searchParams: PageSearchParams): ResourceSort {
  return first(searchParams.sort) === "popular" ? "popular" : "newest";
}

export function parsePage(searchParams: PageSearchParams) {
  const page = Number(first(searchParams.page));
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}
