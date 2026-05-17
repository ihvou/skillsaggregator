"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Browser-only per-key boolean flag persisted to localStorage. Mirrors the
 * mobile `getFlag`/`setFlag` so save / completed / upvote / downvote state
 * carries across page loads on the same device.
 *
 * Renders `false` on the server to avoid hydration mismatch — the real value
 * snaps in on the first client effect.
 */
export function useLocalFlag(key: string): readonly [boolean, () => void, (next: boolean) => void] {
  const [value, setValue] = useState(false);

  useEffect(() => {
    try {
      setValue(window.localStorage.getItem(key) === "1");
    } catch {
      // localStorage unavailable (e.g. private mode quota); silently treat as false.
    }
  }, [key]);

  const set = useCallback(
    (next: boolean) => {
      setValue(next);
      try {
        if (next) window.localStorage.setItem(key, "1");
        else window.localStorage.removeItem(key);
      } catch {
        // ignore quota / private-mode errors
      }
    },
    [key],
  );

  const toggle = useCallback(() => set(!value), [set, value]);

  return [value, toggle, set] as const;
}
