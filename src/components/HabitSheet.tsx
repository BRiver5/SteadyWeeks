import { useEffect, useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { useTheme } from "../theme";
import { Field, Sheet, inputStyle } from "./Sheet";
import { Chip, Stepper } from "./Bits";
import { PrimaryButton } from "./PrimaryButton";
import { PressableScale } from "./PressableScale";
import { HABIT_ICONS, HabitIcon, PRESETS } from "../ui/habitIcons";
import { WEEKDAYS, type Habit } from "../lib/types";
import type { HabitDraft } from "../data/repo";
import { haptics } from "../services/haptics";

// Шторка новой/редактируемой привычки. Пресеты заполняют все поля одним тапом.
export function HabitSheet({ visible, onClose, initial, onSave, usedColors }: { visible: boolean; onClose: () => void; initial?: Habit | null; onSave: (d: HabitDraft) => void; usedColors: string[] }) {
  const t = useTheme();
  const freeColor = t.colors.habit.find((c) => !usedColors.includes(c)) ?? t.colors.habit[0];
  const blank: HabitDraft = { name: "", target: 3, minutes: 30, days: 0b1111111, color: freeColor, icon: "leaf" };
  const [d, setD] = useState<HabitDraft>(blank);

  useEffect(() => {
    if (visible) setD(initial ? { name: initial.name, target: initial.target, minutes: initial.minutes, days: initial.days, color: initial.color, icon: initial.icon } : blank);
  }, [visible, initial?.id]);

  const allowed = WEEKDAYS.filter((_, i) => d.days & (1 << i)).length;
  const valid = d.name.trim().length > 0 && allowed > 0;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={initial ? "Edit habit" : "New habit"}
      subtitle="A weekly quota, not a daily chain."
      footer={<PrimaryButton label={initial ? "Save changes" : "Add habit"} disabled={!valid} onPress={() => onSave({ ...d, name: d.name.trim(), target: Math.min(d.target, allowed) })} />}
    >
      {!initial ? (
        <Field label="Presets">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {PRESETS.map((p) => (
              <Chip
                key={p.name}
                label={p.name}
                active={d.name === p.name}
                icon={<HabitIcon name={p.icon} size={14} color={d.name === p.name ? t.colors.onAccent : t.colors.inkMuted} />}
                onPress={() => setD({ ...d, name: p.name, icon: p.icon, target: p.target, minutes: p.minutes, days: p.days })}
              />
            ))}
          </ScrollView>
        </Field>
      ) : null}
      <Field label="Name">
        <TextInput value={d.name} onChangeText={(name) => setD({ ...d, name })} placeholder="e.g. Morning run" placeholderTextColor={t.colors.inkFaint} style={inputStyle(t)} maxLength={28} />
      </Field>
      <Field label="Icon and colour">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {Object.keys(HABIT_ICONS).map((k) => (
            <PressableScale
              key={k}
              accessibilityLabel={`icon ${k}`}
              onPress={() => {
                haptics.tick();
                setD({ ...d, icon: k });
              }}
              style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: d.icon === k ? d.color : t.colors.surfaceAlt }}
            >
              <HabitIcon name={k} size={18} color={d.icon === k ? t.colors.onAccent : t.colors.inkMuted} />
            </PressableScale>
          ))}
        </View>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
          {t.colors.habit.map((c) => (
            <PressableScale
              key={c}
              accessibilityLabel={`colour ${c}`}
              onPress={() => {
                haptics.tick();
                setD({ ...d, color: c });
              }}
              style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c, borderWidth: d.color === c ? 3 : 0, borderColor: t.colors.ink }}
            />
          ))}
        </View>
      </Field>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
        <Field label="Times per week">
          <Stepper value={d.target} min={1} max={7} onChange={(target) => setD({ ...d, target })} format={(v) => `${v}×`} />
        </Field>
        <Field label="Session">
          <Stepper value={d.minutes} min={5} max={180} step={5} onChange={(minutes) => setD({ ...d, minutes })} format={(v) => `${v}m`} />
        </Field>
      </View>
      <Field label="Allowed days" hint={d.target > allowed ? `Only ${allowed} allowed days — the quota will be capped at ${allowed}.` : "The planner only uses these days unless you pin another."}>
        <View style={{ flexDirection: "row", gap: 6 }}>
          {WEEKDAYS.map((w, i) => {
            const on = (d.days & (1 << i)) !== 0;
            return (
              <PressableScale
                key={w}
                accessibilityLabel={`allow ${w}`}
                onPress={() => {
                  haptics.tick();
                  setD({ ...d, days: d.days ^ (1 << i) });
                }}
                style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: "center", backgroundColor: on ? t.colors.accentSoft : t.colors.surfaceAlt, borderWidth: 1, borderColor: on ? t.colors.accent : t.colors.border }}
              >
                <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: "700", color: on ? t.colors.accentDeep : t.colors.inkFaint }}>
                  {w.slice(0, 2)}
                </Text>
              </PressableScale>
            );
          })}
        </View>
      </Field>
    </Sheet>
  );
}
