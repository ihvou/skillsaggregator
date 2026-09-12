import { useCallback, useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useRootNavigationState, useRouter } from "expo-router";
import { drainPendingSharedUrls } from "@/modules/shared-inbox";
import { track } from "./analytics";

/**
 * Collects whatever the iOS share extension queued and routes it into
 * /suggest, which is exactly where Android's share target already lands.
 *
 * Android opens the app directly with a `subskills://suggest?url=` intent. iOS
 * cannot: Apple allows only Today widgets to launch their containing app, and
 * since iOS 18 the responder-chain workaround force-returns false. So the
 * extension writes to the App Group container and the app collects on
 * foreground — the same crossing Telegram's share extension makes.
 *
 * Draining and presenting are deliberately separate. Draining is safe whenever
 * the app is alive and must not be skipped, because the queue is cleared as it
 * is read. Presenting needs a mounted navigator, and on a cold start there
 * isn't one yet: the first version pushed straight from the mount effect and
 * raced the router, so sharing into a closed app either worked or crashed
 * depending on who won. Found on device, TestFlight build 12.
 */
export function useSharedInbox() {
  const router = useRouter();
  // `key` is undefined until the root navigator has mounted. This is the
  // documented way to know a push will land somewhere.
  const rootState = useRootNavigationState();
  const navigatorReady = Boolean(rootState?.key);

  // Extras are held rather than dropped: someone can share three videos in a
  // row before opening the app, and only one can be on screen at a time.
  const queued = useRef<string[]>([]);
  const appState = useRef<AppStateStatus>(AppState.currentState);

  /** Move anything the extension left into our own queue. Safe at any time. */
  const collect = useCallback(() => {
    const pending = drainPendingSharedUrls();
    if (pending.length > 0) queued.current.push(...pending);
  }, []);

  /** Show the next queued link, but only once there is a navigator to show it in. */
  const present = useCallback(() => {
    if (!navigatorReady) return;
    const next = queued.current.shift();
    if (!next) return;
    try {
      track("resource_shared_in", { queued_behind: queued.current.length });
      router.push({ pathname: "/suggest", params: { url: next } });
    } catch (error) {
      // Put it back rather than losing it, and never take the app down over a
      // share — the queue has already been cleared on the native side, so a
      // throw here is the last chance to keep the URL.
      queued.current.unshift(next);
      console.warn("[shared-inbox] could not present shared link", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [navigatorReady, router]);

  // Collect on mount and on every resume. Separate from presenting so a share
  // that arrives before the navigator is never left sitting in the container.
  useEffect(() => {
    collect();
    const subscription = AppState.addEventListener("change", (nextState) => {
      const wasBackground = /inactive|background/.test(appState.current);
      appState.current = nextState;
      if (wasBackground && nextState === "active") {
        collect();
        present();
      }
    });
    return () => subscription.remove();
  }, [collect, present]);

  // And present as soon as there is somewhere to present into. On a cold start
  // this is what actually delivers the link, one render after the navigator
  // appears.
  useEffect(() => {
    present();
  }, [present]);
}
