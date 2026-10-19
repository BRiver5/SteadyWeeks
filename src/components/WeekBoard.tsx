import { useRef, useState } from "react";
import { Text, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { FadeIn, runOnJS, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { Check, Pin } from "lucide-react-native";
import { useTheme } from "../theme";
import { spring } from "../theme/motion";
import { haptics } from "../services/haptics";
import { HabitIcon } from "../ui/habitIcons";

export type BoardChip = { habitId: string; icon: string; color: string; pinned: boolean; done: boolean; p?: number };
export type BoardDay = { day: string; label: string; date: number; load: number; capacity: number; isToday: boolean; isPast: boolean; busy: boolean; chips: BoardChip[] };

const CHIP = 34;

// Доска недели: 7 колонок, в каждой — фишки привычек этого дня.
// Тап — выбрать привычку; удержание — закрепить/открепить; удержание и
// перетаскивание в другую колонку — закрепить на том дне. Состояние жеста —
// в shared values/ref (обработчики из UI-потока видят замыкание старого рендера).
function Chip({
  chip,
  colW,
  colIndex,
  firstOpen,
  selected,
  onTap,
  onTogglePin,
  onMove,
}: {
  chip: BoardChip;
  colW: number;
  colIndex: number;
  firstOpen: number;
  selected: boolean;
  onTap: () => void;
  onTogglePin: () => void;
  onMove: (toIndex: number) => void;
}) {
  const t = useTheme();
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const lifted = useSharedValue(0);

  const lift = () => haptics.press();
  const drop = (dx: number, dy: number) => {
    const shift = Math.round(dx / colW);
    const target = Math.min(6, Math.max(firstOpen, colIndex + shift));
    if (Math.abs(dx) < colW / 2 && Math.abs(dy) < 30) onTogglePin();
    else if (target !== colIndex) onMove(target);
    else haptics.tick();
  };

  const pan = Gesture.Pan()
    .enabled(!chip.done)
    .activateAfterLongPress(280)
    .onStart(() => {
      lifted.value = withSpring(1, spring.snappy);
      runOnJS(lift)();
    })
    .onUpdate((e) => {
      x.value = e.translationX;
      y.value = e.translationY;
    })
    .onFinalize((e, success) => {
      if (success) runOnJS(drop)(e.translationX, e.translationY);
      x.value = withSpring(0, spring.snappy);
      y.value = withSpring(0, spring.snappy);
      lifted.value = withSpring(0, spring.gentle);
    });
  const tap = Gesture.Tap().onEnd((_e, success) => {
    if (success) runOnJS(onTap)();
  });

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: 1 + lifted.value * 0.18 }],
    zIndex: lifted.value > 0.01 ? 20 : 1,
    elevation: lifted.value > 0.01 ? 8 : 0,
  }));

  const bg = chip.done ? chip.color : t.colors.surface;
  return (
    <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
      <Animated.View
        accessibilityLabel={`chip ${chip.habitId}`}
        style={[
          {
            width: CHIP,
            height: CHIP,
            borderRadius: CHIP / 2,
            backgroundColor: bg,
            borderWidth: 2,
            borderColor: chip.pinned ? t.colors.pin : chip.color,
            alignItems: "center",
            justifyContent: "center",
            opacity: chip.done || chip.p === undefined ? 1 : 0.45 + 0.55 * chip.p,
          },
          selected ? { borderWidth: 3, borderColor: t.colors.ink } : null,
          style,
        ]}
      >
        {chip.done ? <Check size={16} color={t.colors.onAccent} strokeWidth={3} /> : <HabitIcon name={chip.icon} size={15} color={chip.color} />}
        {chip.pinned && !chip.done ? (
          <View style={{ position: "absolute", top: -5, right: -5, width: 16, height: 16, borderRadius: 8, backgroundColor: t.colors.pin, alignItems: "center", justifyContent: "center" }}>
            <Pin size={9} color={t.colors.onAccent} />
          </View>
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
}

export function WeekBoard({
  days,
  selectedHabit,
  onSelectHabit,
  onTogglePin,
  onMove,
  onDayPress,
}: {
  days: BoardDay[];
  selectedHabit: string | null;
  onSelectHabit: (id: string) => void;
  onTogglePin: (habitId: string, day: string) => void;
  onMove: (habitId: string, from: string, to: string, wasPinned: boolean) => void;
  onDayPress?: (day: string) => void;
}) {
  const t = useTheme();
  const [colW, setColW] = useState(0);
  const layoutRef = useRef(0);
  const firstOpen = Math.max(0, days.findIndex((d) => !d.isPast));

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => {
        const w = Math.floor(e.nativeEvent.layout.width / 7);
        if (w !== layoutRef.current) {
          layoutRef.current = w;
          setColW(w);
        }
      }}
      style={{ flexDirection: "row" }}
    >
      {colW > 0
        ? days.map((d, ci) => {
            const ratio = d.capacity > 0 ? Math.min(1, d.load / d.capacity) : d.load > 0 ? 1 : 0;
            const over = d.load > d.capacity;
            return (
              <View key={d.day} style={{ width: colW, alignItems: "center", opacity: d.isPast ? 0.55 : 1 }}>
                <Text
                  onPress={onDayPress && !d.isPast ? () => onDayPress(d.day) : undefined}
                  style={{ fontSize: 11, fontWeight: "800", color: d.isToday ? t.colors.accent : t.colors.inkMuted, letterSpacing: 0.6 }}
                >
                  {d.label.toUpperCase()}
                </Text>
                <View
                  style={{
                    marginTop: 4,
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: d.isToday ? t.colors.accent : "transparent",
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: "700", color: d.isToday ? t.colors.onAccent : t.colors.ink }}>{d.date}</Text>
                </View>
                <View style={{ marginTop: 8, width: colW - 14, height: 5, borderRadius: 3, backgroundColor: d.busy ? t.colors.dangerSoft : t.colors.backgroundAlt, overflow: "hidden" }}>
                  <Animated.View entering={FadeIn.delay(ci * 40)} style={{ width: `${ratio * 100}%`, height: 5, backgroundColor: over ? t.colors.danger : t.colors.accent }} />
                </View>
                <Text style={{ fontSize: 10, color: over ? t.colors.danger : t.colors.inkFaint, marginTop: 3 }}>{d.busy ? "busy" : `${d.load}/${d.capacity}`}</Text>
                <View style={{ marginTop: 10, gap: 8, alignItems: "center", minHeight: 150 }}>
                  {d.chips.map((c) => (
                    <Chip
                      key={c.habitId}
                      chip={c}
                      colW={colW}
                      colIndex={ci}
                      firstOpen={firstOpen}
                      selected={selectedHabit === c.habitId}
                      onTap={() => {
                        haptics.tick();
                        onSelectHabit(c.habitId);
                      }}
                      onTogglePin={() => onTogglePin(c.habitId, d.day)}
                      onMove={(to) => onMove(c.habitId, d.day, days[to].day, c.pinned)}
                    />
                  ))}
                </View>
              </View>
            );
          })
        : null}
    </View>
  );
}
