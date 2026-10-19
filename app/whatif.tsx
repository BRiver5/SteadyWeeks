import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { ArrowRight, ChevronLeft } from "lucide-react-native";
import { useTheme } from "../src/theme";
import { staggerDelay } from "../src/theme/motion";
import { useApp, useSnapshot } from "../src/store/appStore";
import { Segmented } from "../src/components/Segmented";
import { Chip, IconButton, SectionTitle, Stepper } from "../src/components/Bits";
import { PrimaryButton } from "../src/components/PrimaryButton";
import { SuccessBurst } from "../src/components/SuccessBurst";
import { AnimatedCounter } from "../src/components/AnimatedCounter";
import { HabitIcon } from "../src/ui/habitIcons";
import { shortDays } from "../src/ui/selectors";
import { whatIf, describeChange, type Change } from "../src/lib/changes";
import { weekdayIndex } from "../src/lib/time";
import { WEEKDAYS } from "../src/lib/types";
import { pct } from "../src/ui/format";
import { haptics } from "../src/services/haptics";

type Mode = "limit" | "busy" | "quota" | "session";

export default function WhatIfScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const app = useApp();
  const snap = useSnapshot();
  const [mode, setMode] = useState<Mode>("limit");
  const openDays = snap ? snap.plan.days.map(weekdayIndex) : [];
  const [weekday, setWeekday] = useState(openDays[1] ?? openDays[0] ?? 0);
  const [habitId, setHabitId] = useState(snap?.habits[0]?.id ?? "");
  const habit = snap?.habits.find((h) => h.id === habitId);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const [session, setSession] = useState<number | null>(null);
  const [burst, setBurst] = useState(false);

  const limitValue = minutes ?? snap?.capacity[weekday] ?? 60;
  const targetValue = target ?? snap?.plan.habits.find((h) => h.habitId === habitId)?.target ?? 3;
  const sessionValue = session ?? habit?.minutes ?? 30;

  const change: Change | null =
    mode === "limit"
      ? { kind: "capacity", weekday, minutes: limitValue }
      : mode === "busy"
        ? { kind: "busy", weekday }
        : !habit
          ? null
          : mode === "quota"
            ? { kind: "target", habitId, target: targetValue }
            : { kind: "minutes", habitId, minutes: sessionValue };

  const cmp = useMemo(() => {
    if (!app.input || !app.plan || !change) return null;
    return whatIf(app.input, [change], app.plan);
  }, [app.version, JSON.stringify(change)]);

  if (!snap) return null;
  const name = (id: string) => snap.habits.find((h) => h.id === id)?.name ?? "";
  const unchanged = !cmp || (Math.abs(cmp.delta) < 0.0005 && cmp.rows.every((r) => !r.moved));

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + t.spacing.sm, paddingBottom: insets.bottom + 40, paddingHorizontal: t.spacing.lg, gap: t.spacing.lg }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <IconButton label="Back" onPress={() => router.back()}>
            <ChevronLeft size={20} color={t.colors.ink} />
          </IconButton>
          <View style={{ flex: 1 }}>
            <Text style={{ ...t.typography.subtitle, color: t.colors.ink }}>What if…</Text>
            <Text style={{ ...t.typography.caption, color: t.colors.inkMuted }}>Re-plans the rest of this week with one change</Text>
          </View>
        </View>

        <Segmented
          items={[
            { key: "limit", label: "Day limit" },
            { key: "busy", label: "Busy" },
            { key: "quota", label: "Quota" },
            { key: "session", label: "Session" },
          ]}
          value={mode}
          onChange={(k) => setMode(k as Mode)}
        />

        <View style={[styles.card, { backgroundColor: t.colors.surface, borderColor: t.colors.border, gap: 14 }]}>
          {mode === "limit" || mode === "busy" ? (
            <>
              <SectionTitle title="Day" />
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {openDays.map((wd) => (
                  <Chip key={wd} label={WEEKDAYS[wd]} active={wd === weekday} onPress={() => { setWeekday(wd); setMinutes(null); }} />
                ))}
              </View>
              {mode === "limit" ? (
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={{ ...t.typography.body, color: t.colors.inkMuted }}>Time for habits</Text>
                  <Stepper value={limitValue} min={0} max={300} step={15} onChange={setMinutes} format={(v) => `${v}m`} />
                </View>
              ) : (
                <Text style={{ ...t.typography.caption, color: t.colors.inkMuted }}>Nothing can be planned on {WEEKDAYS[weekday]}; other days absorb what they can.</Text>
              )}
            </>
          ) : (
            <>
              <SectionTitle title="Habit" />
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {snap.habits.map((h) => (
                  <Chip key={h.id} label={h.name} active={h.id === habitId} color={h.color} onPress={() => { setHabitId(h.id); setTarget(null); setSession(null); }} />
                ))}
              </View>
              {habit ? (
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={{ ...t.typography.body, color: t.colors.inkMuted }}>{mode === "quota" ? "Times this week" : "Session length"}</Text>
                  {mode === "quota" ? (
                    <Stepper value={targetValue} min={0} max={7} onChange={setTarget} format={(v) => `${v}×`} />
                  ) : (
                    <Stepper value={sessionValue} min={5} max={180} step={5} onChange={setSession} format={(v) => `${v}m`} />
                  )}
                </View>
              ) : (
                <Text style={{ ...t.typography.caption, color: t.colors.inkMuted }}>Add a habit first.</Text>
              )}
            </>
          )}
        </View>

        {cmp ? (
          <>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Column title="Now" value={cmp.before.expectedHits} minutes={cmp.minutesBefore} />
              <View style={{ justifyContent: "center" }}>
                <ArrowRight size={18} color={t.colors.inkFaint} />
              </View>
              <Column title="If" value={cmp.after.expectedHits} minutes={cmp.minutesAfter} delta={cmp.delta} />
            </View>

            <SectionTitle title="Per habit" />
            {cmp.rows.map((r, i) => {
              const h = snap.habits.find((x) => x.id === r.habitId)!;
              const d = r.after - r.before;
              return (
                <Animated.View key={r.habitId} entering={FadeInDown.delay(staggerDelay(i)).duration(340)} style={[styles.row, { backgroundColor: t.colors.surface, borderColor: r.moved || Math.abs(d) > 0.005 ? t.colors.accent : t.colors.border }]}>
                  <HabitIcon name={h.icon} color={h.color} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ ...t.typography.label, color: t.colors.ink }}>{h.name}</Text>
                    <Text numberOfLines={1} style={{ ...t.typography.caption, color: t.colors.inkMuted }}>
                      {shortDays(r.daysBefore)}
                    </Text>
                    {r.moved ? (
                      <Text numberOfLines={1} style={{ ...t.typography.caption, color: t.colors.accentDeep }}>
                        → {shortDays(r.daysAfter)}
                      </Text>
                    ) : null}
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ ...t.typography.label, color: t.colors.inkMuted }}>
                      {pct(r.before)} → <Text style={{ color: t.colors.ink, fontWeight: "800" }}>{pct(r.after)}</Text>
                    </Text>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: d > 0.005 ? t.colors.accentDeep : d < -0.005 ? t.colors.danger : t.colors.inkFaint }}>
                      {Math.abs(d) < 0.005 ? "same" : `${d > 0 ? "+" : "−"}${Math.round(Math.abs(d) * 100)} pts`}
                    </Text>
                  </View>
                </Animated.View>
              );
            })}

            {change && change.kind !== "busy" ? (
              <PrimaryButton
                label={unchanged ? "Nothing changes" : `Apply: ${describeChange(change, name)}`}
                disabled={unchanged}
                onPress={async () => {
                  await app.applyChange(change);
                  setMinutes(null);
                  setTarget(null);
                  setSession(null);
                  haptics.success();
                  setBurst(true);
                }}
              />
            ) : change ? (
              <PrimaryButton
                label={snap.busy.includes(weekday) ? `${WEEKDAYS[weekday]} is already busy` : `Mark ${WEEKDAYS[weekday]} busy this week`}
                disabled={snap.busy.includes(weekday)}
                onPress={async () => {
                  await app.toggleBusy(weekday);
                  haptics.success();
                  setBurst(true);
                }}
              />
            ) : null}
          </>
        ) : null}
      </ScrollView>
      {burst ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
          <SuccessBurst visible size={110} onDone={() => setTimeout(() => setBurst(false), 250)} />
        </View>
      ) : null}
    </View>
  );
}

function Column({ title, value, minutes, delta }: { title: string; value: number; minutes: number; delta?: number }) {
  const t = useTheme();
  const tone = delta === undefined || Math.abs(delta) < 0.005 ? t.colors.inkFaint : delta > 0 ? t.colors.accentDeep : t.colors.danger;
  return (
    <View style={[styles.card, { flex: 1, backgroundColor: delta === undefined ? t.colors.surfaceAlt : t.colors.surface, borderColor: t.colors.border }]}>
      <Text style={{ ...t.typography.overline, color: t.colors.inkMuted }}>{title}</Text>
      <AnimatedCounter
        value={value}
        formatter={(v) => {
          "worklet";
          return v.toFixed(2);
        }}
        style={{ fontSize: 30, fontWeight: "800", color: t.colors.ink, padding: 0 }}
      />
      <Text style={{ ...t.typography.caption, color: t.colors.inkMuted }}>quotas expected</Text>
      <Text style={{ ...t.typography.caption, color: t.colors.inkFaint, marginTop: 4 }}>{minutes} min planned</Text>
      {delta !== undefined ? <Text style={{ ...t.typography.label, color: tone, marginTop: 4 }}>{Math.abs(delta) < 0.005 ? "no change" : `${delta > 0 ? "+" : "−"}${Math.abs(delta).toFixed(2)}`}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, borderRadius: 22, borderWidth: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 18, borderWidth: 1 },
});
