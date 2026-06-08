import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { BookmarkCheck, Compass, ListFilter } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { getCategories } from "@/lib/data";
import {
  setOnboardingCompleted,
  setOnboardingInterests,
} from "@/lib/localState";
import { colors, radius, spacing, typography } from "@/lib/theme";

const slides = [
  {
    title: "Curated sport learning",
    body: "Find human-moderated tutorials and lessons grouped by sport, skill, and level.",
    icon: Compass,
  },
  {
    title: "Practice with intent",
    body: "Filter for beginner, intermediate, or advanced resources, then save the ones worth revisiting.",
    icon: ListFilter,
  },
  {
    title: "Build your library",
    body: "Pick the sports you care about first. You can still browse every category later.",
    icon: BookmarkCheck,
  },
] as const;

export default function OnboardingScreen() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [interests, setInterests] = useState<string[]>([]);
  const categoriesQuery = useQuery({
    queryKey: ["onboarding-categories"],
    queryFn: getCategories,
    staleTime: 300000,
  });
  const slide = slides[index] ?? slides[0]!;
  const Icon = slide.icon;
  const isLast = index === slides.length - 1;

  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);

  function toggleInterest(slug: string) {
    setInterests((current) =>
      current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug],
    );
  }

  function finish(nextInterests = interests) {
    setOnboardingInterests(nextInterests);
    setOnboardingCompleted(true);
    router.replace("/");
  }

  return (
    <Screen edges={["top"]}>
      <View style={styles.topRow}>
        <Text style={styles.step}>{index + 1} / {slides.length}</Text>
        <Pressable
          onPress={() => finish([])}
          style={({ pressed }) => [styles.skipButton, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.iconWrap}>
          <Icon size={34} color={colors.surface} strokeWidth={2.4} />
        </View>
        <Text style={styles.title}>{slide.title}</Text>
        <Text style={styles.body}>{slide.body}</Text>

        {isLast ? (
          <View style={styles.interests}>
            {categories.map((category) => {
              const selected = interests.includes(category.slug);
              return (
                <Pressable
                  key={category.id}
                  onPress={() => toggleInterest(category.slug)}
                  style={[styles.chip, selected && styles.chipActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                    {category.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {slides.map((item, dotIndex) => (
            <View
              key={item.title}
              style={[styles.dot, dotIndex === index && styles.dotActive]}
            />
          ))}
        </View>
        <Pressable
          onPress={() => {
            if (isLast) finish();
            else setIndex((current) => Math.min(current + 1, slides.length - 1));
          }}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Text style={styles.primaryButtonText}>{isLast ? "Get started" : "Continue"}</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  step: {
    ...typography.meta,
    color: colors.muted,
  },
  skipButton: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  skipText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "800",
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingVertical: spacing.xxl,
  },
  iconWrap: {
    width: 72,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 36,
    backgroundColor: colors.ink,
  },
  title: {
    marginTop: spacing.xl,
    ...typography.pageTitle,
  },
  body: {
    marginTop: spacing.md,
    maxWidth: 330,
    ...typography.body,
    fontSize: 17,
    lineHeight: 24,
  },
  interests: {
    marginTop: spacing.xl,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  chip: {
    minHeight: 38,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.divider,
    backgroundColor: colors.surface,
  },
  chipActive: {
    borderColor: colors.ink,
    backgroundColor: colors.ink,
  },
  chipText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
  },
  chipTextActive: {
    color: colors.surface,
  },
  footer: {
    gap: spacing.md,
    paddingBottom: spacing.md,
  },
  dots: {
    flexDirection: "row",
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.divider,
  },
  dotActive: {
    width: 22,
    backgroundColor: colors.ink,
  },
  primaryButton: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    backgroundColor: colors.ink,
  },
  primaryButtonText: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: "800",
  },
  pressed: {
    opacity: 0.7,
  },
});
