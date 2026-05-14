import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { Link } from "expo-router";
import type { CategorySummary } from "@skillsaggregator/shared";
import { colors } from "@/lib/theme";

interface CategoryChipsProps {
  categories: CategorySummary[];
  activeSlug?: string | null | undefined;
}

export function CategoryChips({ categories, activeSlug }: CategoryChipsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.wrap}
      accessibilityRole="tablist"
    >
      {categories.map((category) => {
        const active = category.slug === activeSlug;
        return (
          <Link key={category.id} href={`/${category.slug}`} asChild>
            <Pressable style={({ pressed }) => [styles.chip, active && styles.active, pressed && styles.pressed]}>
              <Text style={[styles.label, active && styles.activeLabel]}>{category.name}</Text>
            </Pressable>
          </Link>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
    paddingHorizontal: 4,
  },
  chip: {
    minHeight: 36,
    justifyContent: "center",
    borderRadius: 999,
    paddingHorizontal: 14,
    backgroundColor: "transparent",
  },
  active: {
    backgroundColor: colors.ink,
  },
  pressed: {
    opacity: 0.7,
  },
  label: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "600",
  },
  activeLabel: {
    color: colors.white,
    fontWeight: "700",
  },
});
