import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import type { SkillLevel } from "@skillsaggregator/shared";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { SkeletonList } from "@/components/SkeletonList";
import { getCategories, getSkillsForCategory } from "@/lib/data";
import { useAuth } from "@/lib/auth";
import { colors, radius, spacing, typography } from "@/lib/theme";

const LEVELS: Array<{ value: SkillLevel; label: string }> = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

export default function SuggestScreen() {
  const router = useRouter();
  const { category, skill } = useLocalSearchParams<{ category?: string; skill?: string }>();
  const { session, profile } = useAuth();
  const [categorySlug, setCategorySlug] = useState(category ?? "badminton");
  const [skillId, setSkillId] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [level, setLevel] = useState<SkillLevel | "">("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const categoriesQuery = useQuery({
    queryKey: ["suggest-categories"],
    queryFn: getCategories,
    staleTime: 300000,
  });
  const skillsQuery = useQuery({
    queryKey: ["suggest-skills", categorySlug],
    queryFn: () => getSkillsForCategory(categorySlug),
    staleTime: 300000,
  });

  const selectedCategory = useMemo(
    () => categoriesQuery.data?.find((item) => item.slug === categorySlug) ?? null,
    [categoriesQuery.data, categorySlug],
  );
  const skills = skillsQuery.data?.skills ?? [];

  useEffect(() => {
    const initialSkill = skills.find((item) => item.slug === skill) ?? skills[0];
    setSkillId(initialSkill?.id ?? "");
  }, [skill, skills]);

  async function submit() {
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
    const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) {
      Alert.alert("Suggestions unavailable", "Supabase is not configured for this build.");
      return;
    }
    if (!selectedCategory || !skillId || !url.trim()) {
      Alert.alert("Missing details", "Add a URL and choose the target skill.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/submit-suggestion`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey,
          Authorization: `Bearer ${session?.access_token ?? anonKey}`,
        },
        body: JSON.stringify({
          type: "LINK_ADD",
          origin_type: "human",
          origin_name: profile ? `mobile_${profile.slug}` : "mobile_anonymous",
          category_id: selectedCategory.id,
          skill_id: skillId,
          payload_json: {
            url: url.trim(),
            canonical_url: url.trim(),
            target_skill_id: skillId,
            public_note: note.trim() || null,
            skill_level: level || null,
            language: "en",
          },
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Suggestion failed.");
      Alert.alert(
        "Thanks",
        body.duplicate
          ? "already submitted, thanks"
          : "A moderator will review your suggestion within a few days.",
        [{ text: "OK", onPress: () => router.back() }],
      );
    } catch (error) {
      Alert.alert("Suggestion failed", error instanceof Error ? error.message : String(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  const loading = categoriesQuery.isLoading || skillsQuery.isLoading;

  return (
    <Screen edges={["top"]}>
      <PageHeader
        title="Suggest a link"
        subtitle="Send a useful tutorial to the moderation queue."
        showBack
      />
      {loading ? (
        <SkeletonList count={2} />
      ) : (
        <ScrollView contentContainerStyle={styles.form} showsVerticalScrollIndicator={false}>
          {!session ? (
            <Pressable
              onPress={() => router.push("/account")}
              style={({ pressed }) => [styles.signInCallout, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <Text style={styles.signInText}>Sign in to get credit for accepted suggestions</Text>
            </Pressable>
          ) : null}

          <Text style={styles.label}>URL</Text>
          <TextInput
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            keyboardType="url"
            placeholder="https://..."
            placeholderTextColor={colors.faint}
            style={styles.input}
          />

          <Text style={styles.label}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {(categoriesQuery.data ?? []).map((item) => (
              <Pressable
                key={item.id}
                onPress={() => setCategorySlug(item.slug)}
                style={[styles.chip, item.slug === categorySlug && styles.chipActive]}
              >
                <Text style={[styles.chipText, item.slug === categorySlug && styles.chipTextActive]}>
                  {item.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <Text style={styles.label}>Skill</Text>
          <View style={styles.skillGrid}>
            {skills.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => setSkillId(item.id)}
                style={[styles.skillChip, item.id === skillId && styles.chipActive]}
              >
                <Text style={[styles.chipText, item.id === skillId && styles.chipTextActive]}>
                  {item.name}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Level</Text>
          <View style={styles.chips}>
            <Pressable
              onPress={() => setLevel("")}
              style={[styles.chip, level === "" && styles.chipActive]}
            >
              <Text style={[styles.chipText, level === "" && styles.chipTextActive]}>Not sure</Text>
            </Pressable>
            {LEVELS.map((item) => (
              <Pressable
                key={item.value}
                onPress={() => setLevel(item.value)}
                style={[styles.chip, level === item.value && styles.chipActive]}
              >
                <Text style={[styles.chipText, level === item.value && styles.chipTextActive]}>
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Public note</Text>
          <TextInput
            value={note}
            onChangeText={(value) => setNote(value.slice(0, 140))}
            multiline
            maxLength={140}
            placeholder="Why is this useful?"
            placeholderTextColor={colors.faint}
            style={[styles.input, styles.textArea]}
          />
          <Text style={styles.count}>{note.length}/140</Text>

          <Pressable
            onPress={submit}
            disabled={isSubmitting}
            style={({ pressed }) => [styles.submit, pressed && styles.pressed, isSubmitting && styles.disabled]}
          >
            <Text style={styles.submitText}>{isSubmitting ? "Submitting..." : "Submit suggestion"}</Text>
          </Pressable>
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  label: {
    marginTop: spacing.sm,
    fontSize: 13,
    fontWeight: "800",
    color: colors.ink,
  },
  signInCallout: {
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.divider,
  },
  signInText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "800",
  },
  input: {
    minHeight: 46,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.divider,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    color: colors.ink,
    fontSize: 16,
    backgroundColor: colors.surface,
  },
  textArea: {
    minHeight: 96,
    paddingTop: spacing.sm,
    textAlignVertical: "top",
  },
  count: {
    alignSelf: "flex-end",
    ...typography.meta,
    color: colors.faint,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  chip: {
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.divider,
  },
  chipActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.muted,
  },
  chipTextActive: {
    color: colors.surface,
  },
  skillGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  skillChip: {
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.divider,
  },
  submit: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    backgroundColor: colors.ink,
    marginTop: spacing.md,
  },
  submitText: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: "800",
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.5,
  },
});
