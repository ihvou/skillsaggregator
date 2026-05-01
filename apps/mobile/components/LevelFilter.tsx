import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "@/lib/theme";

export type LevelFilterValue = "all" | "beginner" | "intermediate" | "advanced";

const levels: LevelFilterValue[] = ["all", "beginner", "intermediate", "advanced"];

interface LevelFilterProps {
  value: LevelFilterValue;
  onChange: (value: LevelFilterValue) => void;
}

export function LevelFilter({ value, onChange }: LevelFilterProps) {
  return (
    <View style={styles.wrap} accessibilityRole="tablist">
      {levels.map((level) => {
        const selected = value === level;
        return (
          <Pressable
            key={level}
            onPress={() => onChange(level)}
            style={[styles.item, selected && styles.selected]}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
          >
            <Text style={[styles.label, selected && styles.selectedLabel]}>{level}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    gap: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    padding: 4,
  },
  item: {
    minHeight: 36,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    paddingHorizontal: 4,
  },
  selected: {
    backgroundColor: colors.court,
  },
  label: {
    color: colors.graphite,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  selectedLabel: {
    color: colors.white,
  },
});
