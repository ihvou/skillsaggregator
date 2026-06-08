import { useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { Mail } from "lucide-react-native";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { useAuth } from "@/lib/auth";
import { setOnboardingCompleted } from "@/lib/localState";
import { useOnboardingGate } from "@/lib/useOnboardingGate";
import { colors, radius, spacing, typography } from "@/lib/theme";

const WEB_BASE_URL = process.env.EXPO_PUBLIC_WEB_BASE_URL ?? "http://localhost:3000";

export default function AccountScreen() {
  const router = useRouter();
  useOnboardingGate();
  const { profile, user, signInWithMagicLink, signInWithGoogle, signOut, isLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function sendMagicLink() {
    if (!email.trim()) return;
    setIsSubmitting(true);
    try {
      const message = await signInWithMagicLink(email.trim());
      Alert.alert("Check your email", message);
    } catch (error) {
      Alert.alert("Sign in failed", error instanceof Error ? error.message : String(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function googleSignIn() {
    try {
      await signInWithGoogle();
    } catch (error) {
      Alert.alert("Google sign in failed", error instanceof Error ? error.message : String(error));
    }
  }

  async function openPublicProfile() {
    if (!profile) return;
    await Linking.openURL(`${WEB_BASE_URL.replace(/\/+$/, "")}/contributors/${profile.slug}`);
  }

  function replayIntro() {
    setOnboardingCompleted(false);
    router.push("/onboarding");
  }

  return (
    <Screen edges={["top"]}>
      <PageHeader
        title={user ? "Account" : "Sign in"}
        subtitle={user ? "Contributor profile and suggestion credit." : "Get credit for accepted suggestions."}
      />

      {user ? (
        <View style={styles.card}>
          <Text style={styles.name}>{profile?.display_name ?? user.email ?? "Contributor"}</Text>
          <Text style={styles.meta}>{profile ? `@${profile.slug}` : user.email}</Text>
          <Text style={styles.accepted}>{profile?.accepted_count ?? 0} accepted suggestions</Text>
          <View style={styles.buttonRow}>
            <Pressable
              onPress={openPublicProfile}
              disabled={!profile}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, !profile && styles.disabled]}
              accessibilityRole="button"
            >
              <Text style={styles.primaryButtonText}>Public profile</Text>
            </Pressable>
            <Pressable
              onPress={signOut}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryButtonText}>Sign out</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            placeholder="you@example.com"
            placeholderTextColor={colors.faint}
            style={styles.input}
          />
          <Pressable
            onPress={sendMagicLink}
            disabled={isSubmitting || isLoading}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, (isSubmitting || isLoading) && styles.disabled]}
            accessibilityRole="button"
          >
            <Mail size={17} color={colors.surface} />
            <Text style={styles.primaryButtonText}>
              {isSubmitting ? "Sending..." : "Send magic link"}
            </Text>
          </Pressable>
          <Pressable
            onPress={googleSignIn}
            disabled={isLoading}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed, isLoading && styles.disabled]}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryButtonText}>Continue with Google</Text>
          </Pressable>
        </View>
      )}

      <View style={[styles.card, styles.secondaryCard]}>
        <Text style={styles.label}>Intro</Text>
        <Pressable
          onPress={replayIntro}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryButtonText}>Replay intro</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  secondaryCard: {
    marginTop: spacing.md,
  },
  label: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.ink,
  },
  input: {
    minHeight: 46,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.divider,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    color: colors.ink,
    fontSize: 16,
    backgroundColor: colors.bg,
  },
  name: {
    ...typography.pageTitle,
    fontSize: 28,
  },
  meta: {
    ...typography.meta,
    color: colors.muted,
  },
  accepted: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.accent,
  },
  buttonRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  primaryButton: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.ink,
  },
  primaryButtonText: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: "800",
  },
  secondaryButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.divider,
    backgroundColor: colors.bg,
  },
  secondaryButtonText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "800",
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.5,
  },
});
