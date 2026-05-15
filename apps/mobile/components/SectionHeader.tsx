import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { colors, spacing, typography } from "@/lib/theme";

interface SectionHeaderProps {
  title: string;
  subtitle?: string | undefined;
  onPress?: () => void;
  showChevron?: boolean;
}

/**
 * Apple Podcasts-style section header.
 *  - Big bold title on the left with optional chevron after
 *  - Optional small muted subtitle beneath
 *  - When `onPress` is provided, the whole header is a tap target
 */
export function SectionHeader({
  title,
  subtitle,
  onPress,
  showChevron = true,
}: SectionHeaderProps) {
  const content = (
    <View style={styles.wrap}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{title}</Text>
        {onPress && showChevron ? (
          <ChevronRight size={22} color={colors.ink} strokeWidth={3} />
        ) : null}
      </View>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`Open ${title}`}
      >
        {content}
      </Pressable>
    );
  }
  return content;
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.page,
    marginBottom: spacing.md,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  title: {
    ...typography.sectionTitle,
  },
  subtitle: {
    marginTop: spacing.xxs,
    ...typography.meta,
  },
  pressed: {
    opacity: 0.6,
  },
});
