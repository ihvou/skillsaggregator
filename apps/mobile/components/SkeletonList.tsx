import { StyleSheet, View } from "react-native";

interface SkeletonListProps {
  count?: number;
}

export function SkeletonList({ count = 4 }: SkeletonListProps) {
  return (
    <View style={styles.wrap}>
      {Array.from({ length: count }).map((_, index) => (
        <View key={index} style={styles.card}>
          <View style={styles.thumb} />
          <View style={styles.body}>
            <View style={styles.lineWide} />
            <View style={styles.lineMedium} />
            <View style={styles.lineShort} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
  },
  card: {
    minHeight: 118,
    flexDirection: "row",
    gap: 12,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.8)",
    padding: 10,
  },
  thumb: {
    width: 92,
    borderRadius: 7,
    backgroundColor: "rgba(16,32,38,0.08)",
  },
  body: {
    flex: 1,
    justifyContent: "center",
    gap: 10,
  },
  lineWide: {
    height: 16,
    borderRadius: 8,
    backgroundColor: "rgba(16,32,38,0.10)",
  },
  lineMedium: {
    width: "72%",
    height: 14,
    borderRadius: 7,
    backgroundColor: "rgba(16,32,38,0.08)",
  },
  lineShort: {
    width: "42%",
    height: 12,
    borderRadius: 6,
    backgroundColor: "rgba(16,32,38,0.07)",
  },
});
