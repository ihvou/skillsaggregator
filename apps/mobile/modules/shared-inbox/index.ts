import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";

/**
 * The iOS half of share-in.
 *
 * Android does not use this: its share target launches the app with a
 * `subskills://` intent, which is a path iOS share extensions are not allowed
 * to take (see modules/shared-inbox/ios/SharedInboxModule.swift). So on Android
 * — and in Expo Go, and anywhere the native module is missing — this resolves
 * to nothing rather than throwing.
 */
type SharedInboxNativeModule = {
  drainPendingSharedUrls: () => string[];
};

const native = requireOptionalNativeModule<SharedInboxNativeModule>("SharedInbox");

/**
 * Everything the share extension queued since the last call, cleared as it is
 * read. Safe to call on every foreground; returns [] when there is nothing.
 */
export function drainPendingSharedUrls(): string[] {
  if (Platform.OS !== "ios" || !native) return [];
  try {
    return native.drainPendingSharedUrls();
  } catch (error) {
    // Never let the inbox break a foreground. A share that fails to arrive is
    // a bug; an app that cannot resume is worse.
    console.warn("[shared-inbox] drain failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}
