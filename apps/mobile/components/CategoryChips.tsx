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
    gap: 8,
    paddingRight: 4,
  },
  chip: {
    minHeight: 38,
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
  },
  active: {
    borderColor: colors.court,
    backgroundColor: colors.court,
  },
  pressed: {
    opacity: 0.72,
  },
  label: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "800",
  },
  activeLabel: {
    color: colors.white,
  },
});
