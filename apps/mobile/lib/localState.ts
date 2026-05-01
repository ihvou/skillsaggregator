import { MMKV } from "react-native-mmkv";

let storage: MMKV | null = null;
const memory = new Map<string, string>();

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
  return keys.filter((key) => key.startsWith(prefix));
}

export function setLastSeenSkill(skillId: string) {
  if (storage) storage.set("last_seen_skill", skillId);
  else memory.set("last_seen_skill", skillId);
}
