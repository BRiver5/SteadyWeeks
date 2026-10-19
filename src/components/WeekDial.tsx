import { useEffect } from "react";
import { Text, View } from "react-native";
import Svg, { Circle, G } from "react-native-svg";
import Animated, { Easing, useAnimatedProps, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { useTheme } from "../theme";
import { AnimatedCounter } from "./AnimatedCounter";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Hero-виджет: дуга 270°, разрезанная на 7 дней недели. Каждый сегмент
// заполняется долей сделанных заходов этого дня, сегодняшний — темнее,
// будущие показывают только дорожку с точкой нагрузки. В центре — ожидаемое
// число закрытых квот, накручивается счётчиком.
const SWEEP = 270;
const GAP_DEG = 5;

function Segment({ cx, r, stroke, color, startDeg, lenDeg, fill, delay }: { cx: number; r: number; stroke: number; color: string; startDeg: number; lenDeg: number; fill: number; delay: number }) {
  const C = 2 * Math.PI * r;
  const len = (lenDeg / 360) * C;
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = 0;
    progress.value = withDelay(delay, withTiming(fill, { duration: 650, easing: Easing.out(Easing.cubic) }));
  }, [fill, delay]);
  const props = useAnimatedProps(() => ({ strokeDasharray: `${len * progress.value} ${C}` }));
  return (
    <G rotation={startDeg} originX={cx} originY={cx}>
      <AnimatedCircle cx={cx} cy={cx} r={r} stroke={color} strokeWidth={stroke} strokeLinecap="round" fill="none" animatedProps={props} />
    </G>
  );
}

export type DialDay = { label: string; slots: number; done: number; isToday: boolean; isPast: boolean };

export function WeekDial({ days, expected, total, size = 220 }: { days: DialDay[]; expected: number; total: number; size?: number }) {
  const t = useTheme();
  const stroke = 16;
  const cx = size / 2;
  const r = (size - stroke) / 2 - 6;
  const C = 2 * Math.PI * r;
  const segDeg = (SWEEP - GAP_DEG * 6) / 7;
  const start = 135; // от левого нижнего края по часовой

  return (
    <View style={{ width: size, height: size * 0.86, alignItems: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute", top: 0 }}>
        {days.map((d, i) => {
          const s = start + i * (segDeg + GAP_DEG);
          const trackLen = (segDeg / 360) * C;
          return (
            <G key={`t${i}`} rotation={s} originX={cx} originY={cx}>
              <Circle cx={cx} cy={cx} r={r} stroke={d.isToday ? t.colors.accentSoft : t.colors.backgroundAlt} strokeWidth={stroke} strokeLinecap="round" fill="none" strokeDasharray={`${trackLen} ${C}`} />
            </G>
          );
        })}
        {days.map((d, i) => {
          const s = start + i * (segDeg + GAP_DEG);
          const fill = d.slots + d.done === 0 ? 0 : d.done / Math.max(d.slots, d.done);
          return <Segment key={`f${i}`} cx={cx} r={r} stroke={stroke} color={d.isToday ? t.colors.accentDeep : t.colors.accent} startDeg={s} lenDeg={segDeg} fill={fill} delay={i * 70} />;
        })}
        {days.map((d, i) => {
          // Точка нагрузки будущего дня: чем больше слотов, тем крупнее.
          if (d.isPast || d.slots === 0 || d.done >= d.slots) return null;
          const mid = ((start + i * (segDeg + GAP_DEG) + segDeg / 2) * Math.PI) / 180;
          const rr = r - stroke - 6;
          return <Circle key={`d${i}`} cx={cx + rr * Math.cos(mid)} cy={cx + rr * Math.sin(mid)} r={2 + Math.min(3, d.slots)} fill={t.colors.pin} opacity={0.8} />;
        })}
      </Svg>
      {days.map((d, i) => {
        const mid = ((start + i * (segDeg + GAP_DEG) + segDeg / 2) * Math.PI) / 180;
        const rr = r + stroke / 2 + 2;
        const x = cx + rr * Math.cos(mid);
        const y = cx + rr * Math.sin(mid);
        return (
          <Text
            key={`l${i}`}
            style={{ position: "absolute", left: x - 8, top: y - 7, width: 16, textAlign: "center", fontSize: 10, fontWeight: "700", color: d.isToday ? t.colors.accentDeep : t.colors.inkFaint }}
          >
            {d.label}
          </Text>
        );
      })}
      <View style={{ position: "absolute", top: size * 0.3, alignItems: "center" }}>
        <AnimatedCounter
          value={expected}
          formatter={(v) => {
            "worklet";
            return v.toFixed(1);
          }}
          style={{ fontSize: 46, fontWeight: "800", color: t.colors.ink, padding: 0, textAlign: "center", minWidth: 110 }}
        />
        <Text style={{ ...t.typography.caption, color: t.colors.inkMuted, marginTop: -4 }}>of {total} quotas likely</Text>
      </View>
    </View>
  );
}
