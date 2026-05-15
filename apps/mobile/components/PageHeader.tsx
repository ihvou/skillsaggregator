import { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MoreHorizontal } from "lucide-react-native";
import { BackPillButton } from "./BackPillButton";
import { colors, spacing, typography } from "@/lib/theme";

interface PageHeaderProps {
  title: string;
  subtitle?: string | undefined;
  showBack?: boolean;
  showMenu?: boolean;
  onMenuPress?: () => void;
  rightAccessory?: ReactNode;
}

/**
 * Apple Podcasts-style page header.
 *  - Optional round back pill button on the top-left
 *  - Optional round overflow menu on the top-right
 *  - Big bold left-aligned title underneath
 *  - Optional subtitle (small, muted)
 */
export function PageHeader({
  title,
  subtitle,
  showBack = false,
  showMenu = false,
  onMenuPress,
  rightAccessory,
}: PageHeaderProps) {
  return (
    <View style={styles.wrap}>
      {(showBack || showMenu || rightAccessory) && (
        <View style={styles.controlsRow}>
          <View>{showBack ? <BackPillButton /> : null}</View>
          <View style={styles.rightControls}>
            {rightAccessory}
            {showMenu ? (
              <Pressable
                onPress={onMenuPress}
                style={({ pressed }) => [styles.menuButton, pressed && styles.pressed]}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                accessibilityRole="button"
                accessibilityLabel="More options"
              >
                <MoreHorizontal size={20} color={colors.ink} />
              </Pressable>
            ) : null}
          </View>
        </View>
      )}
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingBottom: spacing.md,
  },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 36,
    marginBottom: spacing.md,
  },
  rightControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  menuButton: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  pressed: {
    opacity: 0.7,
  },
  title: {
    ...typography.pageTitle,
  },
  subtitle: {
    marginTop: spacing.xs,
    ...typography.body,
  },
});
