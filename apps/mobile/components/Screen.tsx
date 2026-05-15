import type { PropsWithChildren } from "react";
import { SafeAreaView, StyleSheet, View } from "react-native";
import { colors, spacing } from "@/lib/theme";

interface ScreenProps extends PropsWithChildren {
  /**
   * Which safe-area edges to apply. Defaults to all. Set to `["top"]` for
   * scroll-driven pages that should run their content edge-to-edge horizontally.
   */
  edges?: Array<"top" | "right" | "bottom" | "left">;
  /** When false, drops the standard horizontal page padding (caller manages it). */
  padded?: boolean;
}

export function Screen({ children, edges, padded = true }: ScreenProps) {
  const allEdges = edges ?? ["top", "right", "bottom", "left"];
  return (
    <SafeAreaView
      style={[
        styles.safe,
        !allEdges.includes("top") && { paddingTop: 0 },
        !allEdges.includes("bottom") && { paddingBottom: 0 },
      ]}
    >
      <View style={[styles.content, !padded && styles.flush]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bgGroup,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.page,
    paddingTop: spacing.sm,
  },
  flush: {
    paddingHorizontal: 0,
    paddingTop: 0,
  },
});
