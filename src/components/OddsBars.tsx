import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { useTheme } from "../theme";
import { haptics } from "../services/haptics";

function Bar({ h, color, delay }: { h: number; color: string; delay: number }) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = 0;
    v.value = withDelay(delay, withTiming(h, { duration: 520, easing: Easing.out(Easing.cubic) }));
  }, [h, delay]);
  const st = useAnimatedStyle(() => ({ height: v.value }));
  return <Animated.View style={[{ width: "100%", borderRadius: 6, backgroundColor: color }, st]} />;
}

// Распределение "сколько квот закроется" (пуассон-биномиальное по привычкам).
// Тап по столбцу — точная вероятность этого исхода и "не меньше".
export function OddsBars({ dist, height = 96, label = "quotas" }: { dist: number[]; height?: number; label?: string }) {
  const t = useTheme();
  const max = Math.max(...dist, 0.0001);
  const mode = dist.indexOf(max);
  const [sel, setSel] = useState<number | null>(null);
  const k = sel ?? mode;
  const atLeast = dist.slice(k).reduce((s, x) => s + x, 0);
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, height }}>
        {dist.map((p, i) => (
          <Pressable
            key={i}
            accessibilityLabel={`${i} ${label}`}
            onPress={() => {
              haptics.tick();
              setSel(i === sel ? null : i);
            }}
            style={{ flex: 1, height, justifyContent: "flex-end" }}
          >
            <Bar h={Math.max(3, (p / max) * (height - 4))} color={i === k ? t.colors.accent : t.colors.accentSoft} delay={i * 50} />
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {dist.map((_, i) => (
          <Text key={i} style={{ flex: 1, textAlign: "center", fontSize: 11, fontWeight: i === k ? "800" : "500", color: i === k ? t.colors.ink : t.colors.inkFaint }}>
            {i}
          </Text>
        ))}
      </View>
      <Text style={{ ...t.typography.caption, color: t.colors.inkMuted }}>
        Exactly {k} {label}: <Text style={{ fontWeight: "700", color: t.colors.ink }}>{Math.round(dist[k] * 100)}%</Text> · at least {k}:{" "}
        <Text style={{ fontWeight: "700", color: t.colors.ink }}>{Math.round(atLeast * 100)}%</Text>
      </Text>
    </View>
  );
}
