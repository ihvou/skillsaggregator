import { MMKV } from "react-native-mmkv";
import type { SkillResource } from "@skillsaggregator/shared";

let storage: MMKV | null = null;
const memory = new Map<string, string>();
const SAVED_RESOURCE_PREFIX = "saved-resource:";
const ONBOARDING_COMPLETED_KEY = "onboarding_completed";
const ONBOARDING_INTERESTS_KEY = "onboarding_interests";

try {
  storage = new MMKV({ id: "skillsaggregator" });
} catch (_error) {
  storage = null;
}

export function setFlag(key: string, value: boolean) {
  if (storage) storage.set(key, value ? "1" : "0");
  else if (value) memory.set(key, "1");
  else memory.delete(key);
}

export function getFlag(key: string) {
  return storage ? storage.getString(key) === "1" : memory.get(key) === "1";
}

export function getKeys(prefix: string) {
  const keys = storage ? storage.getAllKeys() : [...memory.keys()];
  return keys.filter((key) => key.startsWith(prefix) && getFlag(key));
}

function setString(key: string, value: string) {
  if (storage) storage.set(key, value);
  else memory.set(key, value);
}

function getString(key: string) {
  return storage ? storage.getString(key) : memory.get(key);
}

function deleteKey(key: string) {
  if (storage) storage.delete(key);
  else memory.delete(key);
}

export function setStoredString(key: string, value: string | null) {
  if (value === null) deleteKey(key);
  else setString(key, value);
}

export function getStoredString(key: string) {
  return getString(key) ?? null;
}

function snapshotKey(linkId: string) {
  return `${SAVED_RESOURCE_PREFIX}${linkId}`;
}

function parseSavedResourceSnapshot(linkId: string, raw: string | undefined): SkillResource | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SkillResource;
    if (!parsed?.id || parsed.link?.id !== linkId || !parsed.link?.url) {
      console.warn("[saved-library] Ignoring malformed saved resource snapshot", {
        linkId,
        relationId: parsed?.id,
        snapshotLinkId: parsed?.link?.id,
      });
      return null;
    }
    return parsed;
  } catch (error) {
    console.warn("[saved-library] Failed to parse saved resource snapshot", { linkId, error });
    deleteKey(snapshotKey(linkId));
    return null;
  }
}

export function setSavedResourceSnapshot(resource: SkillResource) {
  const linkId = resource.link.id;
  setString(snapshotKey(linkId), JSON.stringify(resource));
  console.info("[saved-library] Stored saved resource snapshot", {
    linkId,
    relationId: resource.id,
    title: resource.link.title,
  });
}

export function removeSavedResourceSnapshot(linkId: string) {
  deleteKey(snapshotKey(linkId));
  console.info("[saved-library] Removed saved resource snapshot", { linkId });
}

export function getSavedResourceSnapshot(linkId: string) {
  return parseSavedResourceSnapshot(linkId, getString(snapshotKey(linkId)));
}

export function getSavedResourceSnapshots(linkIds: string[]) {
  return linkIds
    .map((linkId) => getSavedResourceSnapshot(linkId))
    .filter((resource): resource is SkillResource => Boolean(resource));
}

export function reconcileSavedResourceSnapshots(linkIds: string[], resources: SkillResource[]) {
  for (const resource of resources) {
    setSavedResourceSnapshot(resource);
  }

  // A refresh only UPDATES snapshots for resources the server returned. We do
  // NOT clear saves for linkIds missing from this refresh: getSavedResources
  // filters by is_active/links.is_active, so an absent link is ambiguous
  // (soft-disabled, briefly filtered, or a partial response) — never proof the
  // user unsaved it. Auto-removing here caused silent, irreversible bookmark
  // loss; saves are now cleared only by explicit user action (the bookmark
  // toggle in ResourceCard).
  const refreshedLinkIds = new Set(resources.map((resource) => resource.link.id));
  const keptMissing = linkIds.filter((linkId) => !refreshedLinkIds.has(linkId));
  if (keptMissing.length > 0) {
    console.info("[saved-library] Preserved saved ids absent from server refresh", {
      keptCount: keptMissing.length,
    });
  }
}

export function hasCompletedOnboarding() {
  return getFlag(ONBOARDING_COMPLETED_KEY);
}

export function setOnboardingCompleted(value: boolean) {
  setFlag(ONBOARDING_COMPLETED_KEY, value);
}

export function getOnboardingInterests() {
  const raw = getString(ONBOARDING_INTERESTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch (error) {
    console.warn("[onboarding] Failed to parse saved interests", { error });
    deleteKey(ONBOARDING_INTERESTS_KEY);
    return [];
  }
}

export function setOnboardingInterests(categorySlugs: string[]) {
  setString(ONBOARDING_INTERESTS_KEY, JSON.stringify([...new Set(categorySlugs)]));
}

export function setLastSeenSkill(skillId: string) {
  if (storage) storage.set("last_seen_skill", skillId);
  else memory.set("last_seen_skill", skillId);
}
