import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";
import { Screen } from "@/components/Screen";
import { getCategories } from "@/lib/data";
import {
  setOnboardingCompleted,
  setOnboardingInterests,
} from "@/lib/localState";
import { colors, radius, spacing, typography } from "@/lib/theme";

const slides = [
  {
    title: "Pick your sports",
    body: "Choose what should appear first on Discover. You can still browse every sport later.",
    kind: "sports",
  },
  {
    title: "Find the exact sub-skill",
    body: "Skip the giant sport playlist. Open the backhand clear, the low serve, the pop-up, or squat depth.",
    kind: "subskills",
  },
  {
    title: "Build your Watch later",
    body: "Save tutorials into a queue, open them, then tick them off as you learn.",
    kind: "watch",
  },
  {
    title: "Add outside videos",
    body: "Bring in useful YouTube, TikTok, or Instagram links so they live with the rest of your training.",
    kind: "add",
  },
] as const;

type SlideKind = (typeof slides)[number]["kind"];

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
        <OnboardingDiagram kind={slide.kind} />
        <Text style={styles.title}>{slide.title}</Text>
        <Text style={styles.body}>{slide.body}</Text>

        {slide.kind === "sports" ? (
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

function OnboardingDiagram({ kind }: { kind: SlideKind }) {
  if (kind === "sports") {
    return (
      <Svg width="100%" height={148} viewBox="0 0 280 148" accessibilityLabel="Sport cards">
        <Rect x={24} y={24} width={76} height={92} rx={10} fill={colors.ink} />
        <Circle cx={62} cy={58} r={20} fill={colors.surface} opacity={0.92} />
        <Path d="M54 58h16M62 50v16" stroke={colors.ink} strokeWidth={5} strokeLinecap="round" />
        <Line x1={100} y1={70} x2={152} y2={42} stroke={colors.muted} strokeWidth={3} strokeLinecap="round" />
        <Line x1={100} y1={70} x2={152} y2={74} stroke={colors.muted} strokeWidth={3} strokeLinecap="round" />
        <Line x1={100} y1={70} x2={152} y2={106} stroke={colors.muted} strokeWidth={3} strokeLinecap="round" />
        <Rect x={154} y={28} width={94} height={28} rx={14} fill={colors.bgGroup} />
        <Rect x={154} y={60} width={110} height={28} rx={14} fill={colors.bgGroup} />
        <Rect x={154} y={92} width={82} height={28} rx={14} fill={colors.bgGroup} />
      </Svg>
    );
  }
  if (kind === "subskills") {
    return (
      <Svg width="100%" height={148} viewBox="0 0 280 148" accessibilityLabel="Sub-skill branches">
        <Rect x={24} y={34} width={84} height={80} rx={10} fill={colors.bgGroup} />
        <Circle cx={66} cy={74} r={23} fill={colors.ink} />
        <Path d="M56 76c10-18 28-18 38-2" stroke={colors.surface} strokeWidth={5} strokeLinecap="round" fill="none" />
        <Line x1={108} y1={74} x2={156} y2={44} stroke={colors.muted} strokeWidth={3} strokeLinecap="round" />
        <Line x1={108} y1={74} x2={156} y2={74} stroke={colors.muted} strokeWidth={3} strokeLinecap="round" />
        <Line x1={108} y1={74} x2={156} y2={104} stroke={colors.muted} strokeWidth={3} strokeLinecap="round" />
        <Rect x={158} y={30} width={82} height={28} rx={8} fill={colors.surface} stroke={colors.divider} />
        <Rect x={158} y={60} width={98} height={28} rx={8} fill={colors.surface} stroke={colors.divider} />
        <Rect x={158} y={90} width={72} height={28} rx={8} fill={colors.surface} stroke={colors.divider} />
      </Svg>
    );
  }
  if (kind === "watch") {
    return (
      <Svg width="100%" height={148} viewBox="0 0 280 148" accessibilityLabel="Watch later stack">
        <Rect x={54} y={26} width={150} height={74} rx={10} fill={colors.bgGroup} />
        <Rect x={66} y={38} width={150} height={74} rx={10} fill={colors.surface} stroke={colors.divider} />
        <Rect x={78} y={50} width={150} height={74} rx={10} fill={colors.ink} />
        <Circle cx={112} cy={87} r={19} fill={colors.surface} />
        <Path d="M103 87l7 7 15-18" stroke={colors.accent} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <Rect x={142} y={72} width={58} height={8} rx={4} fill={colors.surface} opacity={0.9} />
        <Rect x={142} y={90} width={42} height={8} rx={4} fill={colors.surface} opacity={0.65} />
      </Svg>
    );
  }
  return (
    <Svg width="100%" height={148} viewBox="0 0 280 148" accessibilityLabel="External video sources flowing into one list">
      <Circle cx={52} cy={42} r={22} fill="#ff0000" />
      <Path d="M46 32l18 10-18 10z" fill={colors.surface} />
      <Circle cx={52} cy={104} r={22} fill={colors.ink} />
      <Path d="M45 112c14 3 25-5 25-18" stroke={colors.surface} strokeWidth={5} strokeLinecap="round" fill="none" />
      <Circle cx={112} cy={74} r={22} fill="#c13584" />
      <Circle cx={112} cy={74} r={9} fill="none" stroke={colors.surface} strokeWidth={5} />
      <Line x1={74} y1={42} x2={174} y2={56} stroke={colors.muted} strokeWidth={3} strokeLinecap="round" />
      <Line x1={74} y1={104} x2={174} y2={92} stroke={colors.muted} strokeWidth={3} strokeLinecap="round" />
      <Line x1={134} y1={74} x2={174} y2={74} stroke={colors.muted} strokeWidth={3} strokeLinecap="round" />
      <Rect x={176} y={42} width={72} height={64} rx={10} fill={colors.bgGroup} stroke={colors.divider} />
      <Rect x={190} y={58} width={44} height={8} rx={4} fill={colors.ink} />
      <Rect x={190} y={74} width={32} height={8} rx={4} fill={colors.muted} />
      <Rect x={190} y={90} width={38} height={8} rx={4} fill={colors.muted} />
    </Svg>
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
