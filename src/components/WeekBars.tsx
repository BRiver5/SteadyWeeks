import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { useTheme } from "../theme";
import { haptics } from "../services/haptics";

function Stack({ hit, total, height, color, dim, delay }: { hit: number; total: number; height: number; color: string; dim: boolean; delay: number }) {
  const t = useTheme();
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = 0;
    v.value = withDelay(delay, withTiming(1, { duration: 560, easing: Easing.out(Easing.cubic) }));
  }, [hit, total, delay]);
  const frac = total > 0 ? hit / total : 0;
  const fillStyle = useAnimatedStyle(() => ({ height: Math.max(total > 0 ? 3 : 0, frac * height * v.value) }));
  return (
    <View style={{ height, width: "100%", justifyContent: "flex-end", borderRadius: 7, backgroundColor: t.colors.backgroundAlt, overflow: "hidden", opacity: dim ? 0.35 : 1 }}>
      <Animated.View style={[{ width: "100%", backgroundColor: color, borderRadius: 7 }, fillStyle]} />
    </View>
  );
}

// Доля закрытых квот по неделям. Тап по столбцу выбирает неделю — экран Stats
// перестраивает остальные секции под неё; повторный тап снимает выбор.
export function WeekBars({ weeks, selected, onSelect, height = 120 }: { weeks: { key: string; label: string; hit: number; total: number; current: boolean }[]; selected: string | null; onSelect: (k: string | null) => void; height?: number }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 5 }}>
      {weeks.map((w, i) => (
        <Pressable
          key={w.key}
          accessibilityLabel={`week ${w.label}`}
          onPress={() => {
            haptics.tick();
            onSelect(selected === w.key ? null : w.key);
          }}
          style={{ flex: 1, alignItems: "center" }}
        >
          <Stack hit={w.hit} total={w.total} height={height} color={w.current ? t.colors.pin : t.colors.accent} dim={selected !== null && selected !== w.key} delay={i * 45} />
          <Text numberOfLines={1} style={{ fontSize: 9, marginTop: 4, fontWeight: selected === w.key ? "800" : "500", color: selected === w.key ? t.colors.ink : t.colors.inkFaint }}>
            {w.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
