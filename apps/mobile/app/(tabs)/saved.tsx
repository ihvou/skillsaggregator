import { useCallback, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { FlashList } from "@shopify/flash-list";
import { useFocusEffect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Screen } from "@/components/Screen";
import { getLinksByIds, type SavedLinkResource } from "@/lib/data";
import { getKeys } from "@/lib/localState";
import { colors } from "@/lib/theme";

export default function SavedTab() {
  const [savedIds, setSavedIds] = useState<string[]>([]);
  useFocusEffect(
    useCallback(() => {
      setSavedIds(getKeys("saved:").map((key) => key.replace("saved:", "")));
    }, []),
  );

  const query = useQuery({
    queryKey: ["saved", savedIds],
    queryFn: () => getLinksByIds(savedIds),
    enabled: savedIds.length > 0,
    staleTime: 600000,
  });

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Saved</Text>
        <Text style={styles.title}>Resources</Text>
      </View>
      <FlashList<SavedLinkResource>
        data={query.data ?? []}
        style={styles.list}
        estimatedItemSize={96}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.empty}>Saved resources will appear here.</Text>}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => Linking.openURL(item.url)}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
          >
            {item.thumbnail_url ? (
              <Image source={item.thumbnail_url} style={styles.thumb} contentFit="cover" />
            ) : (
              <View style={styles.thumb} />
            )}
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle} numberOfLines={2}>
                {item.title ?? item.url}
              </Text>
              {item.primary_skill ? (
                <Text style={styles.context} numberOfLines={1}>
                  {item.primary_skill.category_name} / {item.primary_skill.name}
                </Text>
              ) : null}
              <Text style={styles.domain}>{item.domain}</Text>
            </View>
          </Pressable>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 16,
  },
  eyebrow: {
    color: colors.court,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  title: {
    marginTop: 6,
    color: colors.ink,
    fontSize: 34,
    fontWeight: "800",
  },
  empty: {
    marginTop: 20,
    color: colors.graphite,
    fontSize: 15,
  },
  list: {
    flex: 1,
  },
  row: {
    minHeight: 94,
    flexDirection: "row",
    gap: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    padding: 10,
  },
  thumb: {
    width: 96,
    height: 72,
    borderRadius: 6,
    backgroundColor: "rgba(16,32,38,0.08)",
  },
  rowBody: {
    flex: 1,
    justifyContent: "center",
  },
  rowTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 21,
  },
  domain: {
    marginTop: 6,
    color: colors.graphite,
    fontSize: 12,
    fontWeight: "700",
  },
  context: {
    marginTop: 5,
    color: colors.court,
    fontSize: 12,
    fontWeight: "800",
  },
});
