import { View } from "react-native";
import Animated, { ZoomIn } from "react-native-reanimated";
import { useTheme } from "../theme";

// Квота недели одной строкой: заполненные — сделано, обведённые — стоят в
// плане (прозрачность = вероятность), пустые — не запланированы.
export function QuotaPips({ target, done, planned, color, size = 12 }: { target: number; done: number; planned: number[]; color: string; size?: number }) {
  const t = useTheme();
  const n = Math.max(target, done + planned.length);
  return (
    <View style={{ flexDirection: "row", gap: 4, flexWrap: "wrap" }}>
      {Array.from({ length: n }, (_, i) => {
        const isDone = i < done;
        const p = !isDone ? planned[i - done] : undefined;
        const extra = i >= target;
        return (
          <Animated.View
            key={i}
            entering={ZoomIn.delay(i * 40).duration(260)}
            style={{
              width: size,
              height: size,
              borderRadius: extra ? 3 : size / 2,
              backgroundColor: isDone ? color : "transparent",
              borderWidth: isDone ? 0 : 2,
              borderColor: p !== undefined ? color : t.colors.border,
              opacity: p !== undefined ? 0.35 + 0.65 * p : 1,
            }}
          />
        );
      })}
    </View>
  );
}
