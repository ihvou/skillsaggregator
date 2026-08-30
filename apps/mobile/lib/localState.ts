import { MMKV } from "react-native-mmkv";

let storage: MMKV | null = null;
const memory = new Map<string, string>();
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
