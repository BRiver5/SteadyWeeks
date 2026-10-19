import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { useTheme } from "../theme";
import { haptics } from "../services/haptics";
import { WEEKDAYS } from "../lib/types";

export type WeekdayOdd = { mean: number; lo: number; hi: number; allowed: boolean };

function Band({ lo, hi, mean, height, color, soft, surface, delay }: { lo: number; hi: number; mean: number; height: number; color: string; soft: string; surface: string; delay: number }) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = 0;
    v.value = withDelay(delay, withTiming(1, { duration: 560, easing: Easing.out(Easing.cubic) }));
  }, [lo, hi, mean, delay]);
  const band = useAnimatedStyle(() => ({ bottom: lo * height * v.value, height: Math.max(4, (hi - lo) * height * v.value) }));
  const dot = useAnimatedStyle(() => ({ bottom: mean * height * v.value - 6 }));
  return (
    <View style={{ height, width: "100%", alignItems: "center" }}>
      <View style={{ position: "absolute", top: 0, bottom: 0, width: 2, backgroundColor: soft }} />
      <Animated.View style={[{ position: "absolute", width: 14, borderRadius: 7, backgroundColor: soft }, band]} />
      <Animated.View style={[{ position: "absolute", width: 12, height: 12, borderRadius: 6, backgroundColor: color, borderWidth: 2, borderColor: surface }, dot]} />
    </View>
  );
}

// Надёжность по дням недели: точка — оценка модели, полоса — 90% интервал.
// Тап по дню выбирает его (детальный экран показывает разложение оценки).
export function WeekdayOdds({ odds, selected, onSelect, color, height = 120 }: { odds: WeekdayOdd[]; selected: number; onSelect: (wd: number) => void; color: string; height?: number }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 4 }}>
      {odds.map((o, i) => (
        <Pressable
          key={i}
          accessibilityLabel={`${WEEKDAYS[i]} odds`}
          onPress={() => {
            haptics.tick();
            onSelect(i);
          }}
          style={{ flex: 1, alignItems: "center", paddingVertical: 6, borderRadius: 12, backgroundColor: i === selected ? t.colors.surfaceAlt : "transparent", opacity: o.allowed ? 1 : 0.4 }}
        >
          <Text style={{ fontSize: 11, fontWeight: "700", color: t.colors.ink, marginBottom: 6 }}>{Math.round(o.mean * 100)}</Text>
          <Band lo={o.lo} hi={o.hi} mean={o.mean} height={height} color={color} soft={t.colors.backgroundAlt} surface={t.colors.surface} delay={i * 50} />
          <Text style={{ fontSize: 11, fontWeight: i === selected ? "800" : "500", color: i === selected ? t.colors.ink : t.colors.inkFaint, marginTop: 6 }}>{WEEKDAYS[i]}</Text>
        </Pressable>
      ))}
    </View>
  );
}
