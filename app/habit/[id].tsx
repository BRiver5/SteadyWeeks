import { useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { ChevronLeft, Pencil, Trash } from "lucide-react-native";
import { useTheme } from "../../src/theme";
import { useApp, useSnapshot } from "../../src/store/appStore";
import { IconButton, SectionTitle, Stepper } from "../../src/components/Bits";
import { QuotaPips } from "../../src/components/QuotaPips";
import { WeekdayOdds } from "../../src/components/WeekdayOdds";
import { Heatmap } from "../../src/components/Heatmap";
import { PressableScale } from "../../src/components/PressableScale";
import { HabitSheet } from "../../src/components/HabitSheet";
import { HabitIcon } from "../../src/ui/habitIcons";
import { shortDays, statusLabel } from "../../src/ui/selectors";
import { posterior, evidence } from "../../src/lib/model";
import { explainHabit } from "../../src/lib/explain";
import { addDays, dayLabel, weekdayIndex } from "../../src/lib/time";
import { allowsDay, WEEKDAYS, WEEKDAYS_LONG } from "../../src/lib/types";
import { pct } from "../../src/ui/format";
import { haptics } from "../../src/services/haptics";

const WEEKS = 12;

export default function HabitDetail() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const app = useApp();
  const snap = useSnapshot();
  const habit = snap?.habits.find((h) => h.id === id);
  const [wd, setWd] = useState(weekdayIndex(app.today));
  const [name, setName] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const explanation = useMemo(() => (app.input && app.plan && id ? explainHabit(app.input, app.plan, app.model, id) : null), [app.version, id]);

  if (!snap || !habit) return null;
  const hp = snap.plan.habits.find((h) => h.habitId === habit.id)!;
  const odds = Array.from({ length: 7 }, (_, i) => ({ ...posterior(app.model, habit.id, i), allowed: allowsDay(habit.days, i) }));
  const sel = odds[wd];
  const override = app.overrides.find((o) => o.week === snap.week && o.habitId === habit.id);

  // История 12 недель: колонки — недели, строки — дни недели.
  const firstWeek = addDays(snap.week, -7 * (WEEKS - 1));
  const doneSet = new Set(snap.completions.filter((c) => c.habitId === habit.id).map((c) => c.day));
  const plannedSet = new Set(snap.planned.filter((r) => r.habitId === habit.id).map((r) => r.day));
  const cells = Array.from({ length: 7 * WEEKS }, (_, i) => {
    const day = addDays(firstWeek, (i % WEEKS) * 7 + Math.floor(i / WEEKS));
    const future = day > snap.today;
    return { key: day, intensity: future ? -1 : doneSet.has(day) ? 1 : plannedSet.has(day) ? 0.25 : 0 };
  });
  const totalDone = doneSet.size;
  const plannedHit = [...plannedSet].filter((d) => d < snap.today && doneSet.has(d)).length;
  const plannedPast = [...plannedSet].filter((d) => d < snap.today).length;

  const saveName = async () => {
    if (name !== null && name.trim() && name.trim() !== habit.name) await app.updateHabit({ ...habit, name: name.trim() });
    setName(null);
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      <View style={{ backgroundColor: t.colors.background, paddingTop: insets.top + t.spacing.sm, paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <IconButton label="Back" onPress={() => router.back()}>
          <ChevronLeft size={20} color={t.colors.ink} />
        </IconButton>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: habit.color, alignItems: "center", justifyContent: "center" }}>
          <HabitIcon name={habit.icon} color={t.colors.onAccent} />
        </View>
        <TextInput
          value={name ?? habit.name}
          onChangeText={setName}
          onBlur={saveName}
          onSubmitEditing={saveName}
          accessibilityLabel="Habit name"
          style={{ flex: 1, fontSize: 20, fontWeight: "800", color: t.colors.ink, paddingVertical: 4 }}
          maxLength={28}
        />
        <IconButton label="Edit habit" onPress={() => setEditing(true)}>
          <Pencil size={16} color={t.colors.ink} />
        </IconButton>
        </View>
      </View>
      <ScrollView stickyHeaderIndices={[2, 4, 6]} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">

        {/* 1: эта неделя */}
        <Animated.View entering={FadeInDown.duration(360)} style={[styles.card, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}>
          <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
            <View style={{ flex: 1 }}>
              <Text style={{ ...t.typography.overline, color: t.colors.inkMuted }}>This week</Text>
              <Text style={{ fontSize: 34, fontWeight: "800", color: t.colors.ink }}>
                {hp.doneCount}
                <Text style={{ fontSize: 20, color: t.colors.inkFaint }}> / {hp.target}</Text>
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ fontSize: 22, fontWeight: "800", color: hp.status === "atRisk" || hp.status === "unreachable" ? t.colors.danger : t.colors.accentDeep }}>{pct(hp.pHit)}</Text>
              <Text style={{ ...t.typography.caption, color: t.colors.inkMuted }}>{statusLabel(hp)}</Text>
            </View>
          </View>
          <View style={{ marginTop: 10 }}>
            <QuotaPips target={hp.target} done={hp.doneCount} planned={hp.probs} color={habit.color} size={16} />
          </View>
          <Text style={{ ...t.typography.caption, color: t.colors.inkMuted, marginTop: 8 }}>Planned: {shortDays(hp.days)}</Text>
          <View style={{ height: 1, backgroundColor: t.colors.border, marginVertical: 14 }} />
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View>
              <Text style={{ ...t.typography.label, color: t.colors.ink }}>This week only</Text>
              <Text style={{ ...t.typography.caption, color: t.colors.inkMuted }}>{override ? `Usually ${habit.target}×` : "Same as usual"}</Text>
            </View>
            <Stepper value={hp.target} min={0} max={7} onChange={(v) => app.setWeekTarget(habit.id, v === habit.target ? null : v)} format={(v) => `${v}×`} />
          </View>
        </Animated.View>

        {/* 2: обычные настройки инлайн */}
        <View style={[styles.card, { backgroundColor: t.colors.surface, borderColor: t.colors.border, gap: 14 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ ...t.typography.label, color: t.colors.ink }}>Usual quota</Text>
            <Stepper value={habit.target} min={1} max={7} onChange={(v) => app.updateHabit({ ...habit, target: v })} format={(v) => `${v}×`} />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ ...t.typography.label, color: t.colors.ink }}>Session</Text>
            <Stepper value={habit.minutes} min={5} max={180} step={5} onChange={(v) => app.updateHabit({ ...habit, minutes: v })} format={(v) => `${v}m`} />
          </View>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {WEEKDAYS.map((w, i) => {
              const on = allowsDay(habit.days, i);
              return (
                <PressableScale
                  key={w}
                  accessibilityLabel={`allow ${w}`}
                  onPress={() => {
                    const next = habit.days ^ (1 << i);
                    if (next === 0) return;
                    haptics.tick();
                    app.updateHabit({ ...habit, days: next });
                  }}
                  style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center", backgroundColor: on ? t.colors.accentSoft : t.colors.surfaceAlt }}
                >
                  <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: "700", color: on ? t.colors.accentDeep : t.colors.inkFaint }}>
                    {w.slice(0, 2)}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        </View>

        {/* 2 */}
        <Sticky title="Reliability by weekday" />
        {/* 4 */}
        <View style={[styles.card, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}>
          <WeekdayOdds odds={odds} selected={wd} onSelect={setWd} color={habit.color} />
          <View style={{ marginTop: 12, padding: 12, borderRadius: 14, backgroundColor: t.colors.surfaceAlt, gap: 4 }}>
            <Text style={{ ...t.typography.label, color: t.colors.ink }}>
              {WEEKDAYS_LONG[wd]}: {pct(sel.mean)} <Text style={{ color: t.colors.inkMuted, fontWeight: "400" }}>(90% range {Math.round(sel.lo * 100)}–{Math.round(sel.hi * 100)}%)</Text>
            </Text>
            <Text style={{ ...t.typography.caption, color: t.colors.inkMuted }}>
              {evidence(app.model, habit.id, wd) < 0.5
                ? `No ${WEEKDAYS_LONG[wd]} record yet — borrowed from the habit's overall ${pct(sel.priorMean)}.`
                : `About ${Math.round(sel.s)} kept and ${Math.round(sel.f)} missed on planned ${WEEKDAYS_LONG[wd]}s (older days fade). Weighted ${Math.round((1 - sel.priorWeight) * 100)}% on this record and ${Math.round(sel.priorWeight * 100)}% on the habit overall (${pct(sel.priorMean)}).`}
            </Text>
            {!allowsDay(habit.days, wd) ? <Text style={{ ...t.typography.caption, color: t.colors.signal }}>Not an allowed day — used only when pinned.</Text> : null}
          </View>
        </View>

        {/* 4 */}
        <Sticky title="Why this week's plan" />
        {/* 6 */}
        <View style={[styles.card, { backgroundColor: t.colors.surface, borderColor: t.colors.border, gap: 6 }]}>
          {explanation && explanation.chosen.length ? (
            explanation.chosen.map((c) => (
              <View key={c.day} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ ...t.typography.label, color: t.colors.ink, width: 44 }}>{WEEKDAYS[weekdayIndex(c.day)]}</Text>
                <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: t.colors.backgroundAlt, overflow: "hidden" }}>
                  <View style={{ width: `${Math.min(100, Math.max(3, c.marginal * 100))}%`, height: 8, backgroundColor: habit.color }} />
                </View>
                <Text style={{ ...t.typography.caption, color: t.colors.inkMuted, width: 88, textAlign: "right" }}>+{Math.round(c.marginal * 100)} pts · {pct(c.p.mean)}</Text>
              </View>
            ))
          ) : (
            <Text style={{ ...t.typography.caption, color: t.colors.inkMuted }}>{hp.status === "met" ? "Quota met — nothing more is planned." : "No days left that fit."}</Text>
          )}
          {explanation?.skipped.map((s) => (
            <Text key={s.day} style={{ ...t.typography.caption, color: t.colors.inkFaint }}>
              {WEEKDAYS[weekdayIndex(s.day)]} — {s.reason}
            </Text>
          ))}
          <Text style={{ ...t.typography.caption, color: t.colors.inkFaint, marginTop: 4 }}>Bars show how much each day adds to the chance of closing the quota.</Text>
        </View>

        {/* 6 */}
        <Sticky title={`Last ${WEEKS} weeks`} />
        {/* 8 */}
        <View style={[styles.card, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ gap: 3, paddingTop: 1 }}>
              {WEEKDAYS.map((w) => (
                <Text key={w} style={{ fontSize: 9, lineHeight: 15, height: 15, color: t.colors.inkFaint }}>
                  {w}
                </Text>
              ))}
            </View>
            <View style={{ width: WEEKS * 18 - 3 }}>
              <Heatmap
                cells={cells}
                cellSize={15}
                gap={3}
                colorForIntensity={(v) => (v < 0 ? "transparent" : v >= 1 ? habit.color : v > 0 ? t.colors.pinSoft : t.colors.backgroundAlt)}
                onCellPress={(c) => {
                  if (c.key > snap.today) return;
                  haptics.tick();
                  app.toggleDone(habit.id, c.key);
                }}
              />
            </View>
          </View>
          <Text style={{ ...t.typography.caption, color: t.colors.inkMuted, marginTop: 10 }}>
            {totalDone} sessions · {plannedPast ? `${plannedHit} of ${plannedPast} planned days kept` : "no planned days closed yet"} · tap a day to fix the record (since {dayLabel(firstWeek)})
          </Text>
        </View>

        <View style={{ paddingHorizontal: t.spacing.lg, marginTop: t.spacing.xl }}>
          <PressableScale
            onPress={() =>
              Alert.alert("Delete habit?", `${habit.name} and its whole history will be removed.`, [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete",
                  style: "destructive",
                  onPress: async () => {
                    router.back();
                    await app.deleteHabit(habit.id);
                  },
                },
              ])
            }
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: 16, backgroundColor: t.colors.dangerSoft }}
          >
            <Trash size={16} color={t.colors.danger} />
            <Text style={{ ...t.typography.label, color: t.colors.danger }}>Delete habit</Text>
          </PressableScale>
        </View>
      </ScrollView>
      <HabitSheet
        visible={editing}
        initial={habit}
        usedColors={snap.habits.map((h) => h.color)}
        onClose={() => setEditing(false)}
        onSave={async (d) => {
          setEditing(false);
          await app.updateHabit({ ...habit, ...d });
          haptics.success();
        }}
      />
    </View>
  );
}

function Sticky({ title }: { title: string }) {
  const t = useTheme();
  return (
    <View style={{ backgroundColor: t.colors.background, paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.xl, paddingBottom: t.spacing.sm }}>
      <SectionTitle title={title} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginTop: 12, padding: 16, borderRadius: 24, borderWidth: 1 },
});
