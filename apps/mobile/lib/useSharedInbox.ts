import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useRouter } from "expo-router";
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
 * The result is that both platforms converge on one screen with the URL
 * prefilled, rather than two share pipelines that drift apart.
 */
export function useSharedInbox() {
  const router = useRouter();
  // Extras are held rather than dropped: someone can share three videos in a
  // row before opening the app, and only one can be on screen at a time.
  const queued = useRef<string[]>([]);
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    function present() {
      const next = queued.current.shift();
      if (!next) return;
      track("resource_shared_in", { queued_behind: queued.current.length });
      router.push({ pathname: "/suggest", params: { url: next } });
    }

    function collect() {
      const pending = drainPendingSharedUrls();
      if (pending.length === 0) return;
      queued.current.push(...pending);
      present();
    }

    // On cold start the extension may have queued something while the app was
    // not running at all, so drain immediately as well as on resume.
    collect();

    const subscription = AppState.addEventListener("change", (nextState) => {
      const wasBackground = appState.current.match(/inactive|background/);
      appState.current = nextState;
      if (wasBackground && nextState === "active") collect();
    });

    return () => subscription.remove();
  }, [router]);
}
