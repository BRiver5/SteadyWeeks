import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { ChevronLeft, Target } from "lucide-react-native";
import { useTheme } from "../src/theme";
import { staggerDelay } from "../src/theme/motion";
import { targetFor, useApp, useSnapshot } from "../src/store/appStore";
import { IconButton, Legend, SectionTitle } from "../src/components/Bits";
import { AnimatedRing } from "../src/components/AnimatedRing";
import { AnimatedCounter } from "../src/components/AnimatedCounter";
import { WeekBars } from "../src/components/WeekBars";
import { CategoryRing } from "../src/components/CategoryRing";
import { BarChart } from "../src/components/BarChart";
import { DonutChart } from "../src/components/DonutChart";
import { Heatmap } from "../src/components/Heatmap";
import { QuotaPips } from "../src/components/QuotaPips";
import { EmptyState } from "../src/components/EmptyState";
import { calibration, perfectStreak, reliableExtremes, weekHistory, weekdayRates } from "../src/lib/history";
import { addDays, dayLabel } from "../src/lib/time";
import { WEEKDAYS_LONG, WEEKDAYS } from "../src/lib/types";
import { pct } from "../src/ui/format";

const WEEKS = 12;

export default function StatsScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const app = useApp();
  const snap = useSnapshot();
  const [week, setWeek] = useState<string | null>(null);
  const [habitSel, setHabitSel] = useState<string | null>(null);

  const data = useMemo(() => {
    if (!snap) return null;
    const history = weekHistory(snap.habits, snap.completions, (w, h) => targetFor(app.overrides, w, h), snap.today, WEEKS);
    const streak = perfectStreak(history);
    const cal = calibration(snap.planned, snap.completions, snap.today);
    return { history, streak, cal };
  }, [app.version]);

  if (!snap || !data) return null;
  if (snap.habits.length === 0)
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.background, paddingTop: insets.top + t.spacing.sm, paddingHorizontal: t.spacing.lg }}>
        <IconButton label="Back" onPress={() => router.back()}>
          <ChevronLeft size={20} color={t.colors.ink} />
        </IconButton>
        <EmptyState title="No stats yet" description="Add a habit and check in for a few days — weeks, weekdays and forecast accuracy show up here." />
      </View>
    );

  const { history, streak, cal } = data;
  const range = week ? { from: week, to: addDays(week, 6) } : { from: history[0].week, to: addDays(snap.week, 6) };
  const inRange = snap.completions.filter((c) => c.day >= range.from && c.day <= range.to);
  const slice = habitSel ? inRange.filter((c) => c.habitId === habitSel) : inRange;
  const segments = snap.habits.map((h) => ({ key: h.id, value: inRange.filter((c) => c.habitId === h.id).length, color: h.color }));
  const selWeek = week ? history.find((w) => w.week === week) : null;
  const plannedDone = slice.filter((c) => c.planned).length;
  const extra = slice.length - plannedDone;
  const rates = weekdayRates(snap.planned, snap.completions, snap.today, habitSel ?? undefined);
  const extremes = reliableExtremes(rates);
  const selHabit = habitSel ? snap.habits.find((h) => h.id === habitSel) : null;

  const firstWeek = history[0].week;
  const doneSet = new Set(snap.completions.filter((c) => !habitSel || c.habitId === habitSel).map((c) => c.day + "|" + c.habitId));
  const cells = Array.from({ length: 7 * WEEKS }, (_, i) => {
    const day = addDays(firstWeek, (i % WEEKS) * 7 + Math.floor(i / WEEKS));
    const n = (habitSel ? [habitSel] : snap.habits.map((h) => h.id)).filter((id) => doneSet.has(day + "|" + id)).length;
    const denom = habitSel ? 1 : Math.max(1, snap.habits.length);
    return { key: day, intensity: day > snap.today ? -1 : n / denom };
  });

  const sections = [
    // 1. Итоговые карточки
    <View key="cards" style={{ flexDirection: "row", gap: 10 }}>
      <View style={[styles.card, { flex: 1.1, backgroundColor: t.colors.surface, borderColor: t.colors.border, alignItems: "center" }]}>
        <AnimatedRing progress={snap.plan.expectedHits / snap.habits.length} size={96} strokeWidth={11} color={t.colors.accent} trackColor={t.colors.backgroundAlt}>
          <Text style={{ fontSize: 20, fontWeight: "800", color: t.colors.ink }}>{pct(snap.plan.expectedHits / snap.habits.length)}</Text>
        </AnimatedRing>
        <Text style={{ ...t.typography.caption, color: t.colors.inkMuted, marginTop: 6, textAlign: "center" }}>quotas expected this week</Text>
      </View>
      <View style={{ flex: 1, gap: 10 }}>
        <View style={[styles.card, { backgroundColor: t.colors.surface, borderColor: t.colors.border, paddingVertical: 12 }]}>
          <AnimatedCounter value={streak.current} style={{ fontSize: 26, fontWeight: "800", color: t.colors.ink, padding: 0 }} />
          <Text style={{ ...t.typography.caption, color: t.colors.inkMuted }}>perfect weeks in a row · best {streak.best}</Text>
        </View>
        <View style={[styles.card, { backgroundColor: t.colors.surface, borderColor: t.colors.border, paddingVertical: 12 }]}>
          <AnimatedCounter value={inRange.length} style={{ fontSize: 26, fontWeight: "800", color: t.colors.ink, padding: 0 }} />
          <Text style={{ ...t.typography.caption, color: t.colors.inkMuted }}>sessions {week ? `week of ${dayLabel(week)}` : `in ${WEEKS} weeks`}</Text>
        </View>
      </View>
    </View>,

    // 2. Недели (интерактивно)
    <View key="weeks" style={[styles.card, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}>
      <SectionTitle title="Quotas closed per week" right={week ? <Text onPress={() => setWeek(null)} style={{ ...t.typography.label, color: t.colors.accent }}>All weeks</Text> : undefined} />
      <View style={{ height: 12 }} />
      <WeekBars
        weeks={history.map((w) => ({ key: w.week, label: dayLabel(w.week).replace(" ", " "), hit: w.hits, total: w.total, current: w.week === snap.week }))}
        selected={week}
        onSelect={setWeek}
      />
      <Text style={{ ...t.typography.caption, color: t.colors.inkMuted, marginTop: 10 }}>
        {selWeek ? `${selWeek.hits} of ${selWeek.total} quotas closed · ${selWeek.done} sessions${selWeek.week === snap.week ? " so far" : ""}` : "Tap a week to see it in every section below. This week is in amber."}
      </Text>
    </View>,

    // 3. Кольцо привычек (интерактивно) + план/сверх плана
    <View key="ring" style={[styles.card, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}>
      <SectionTitle title="Sessions by habit" right={habitSel ? <Text onPress={() => setHabitSel(null)} style={{ ...t.typography.label, color: t.colors.accent }}>All habits</Text> : undefined} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 16, marginTop: 12 }}>
        <CategoryRing
          segments={segments}
          selected={habitSel}
          onSelect={setHabitSel}
          size={150}
          center={
            <View style={{ alignItems: "center" }}>
              <Text style={{ fontSize: 22, fontWeight: "800", color: t.colors.ink }}>{slice.length}</Text>
              <Text style={{ fontSize: 10, color: t.colors.inkFaint }}>{selHabit ? selHabit.name : "sessions"}</Text>
            </View>
          }
        />
        <View style={{ flex: 1 }}>
          <Legend rows={snap.habits.map((h) => ({ color: h.color, label: h.name, value: String(segments.find((s) => s.key === h.id)?.value ?? 0), dim: habitSel !== null && habitSel !== h.id }))} />
        </View>
      </View>
      {inRange.length === 0 ? <Text style={{ ...t.typography.caption, color: t.colors.inkMuted, marginTop: 8 }}>No sessions in this range yet.</Text> : null}
    </View>,

    // 4. Квоты выбранной недели
    <View key="quota" style={[styles.card, { backgroundColor: t.colors.surface, borderColor: t.colors.border, gap: 10 }]}>
      <SectionTitle title={week ? `Quotas · week of ${dayLabel(week)}` : "Quotas · this week"} />
      {snap.habits
        .filter((h) => !habitSel || h.id === habitSel)
        .map((h) => {
          const w = week ?? snap.week;
          const done = (history.find((x) => x.week === w)?.perHabit[h.id] ?? 0) as number;
          const target = targetFor(app.overrides, w, h);
          return (
            <View key={h.id} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Text numberOfLines={1} style={{ ...t.typography.label, color: t.colors.ink, width: 96 }}>
                {h.name}
              </Text>
              <View style={{ flex: 1 }}>
                <QuotaPips target={target} done={done} planned={[]} color={h.color} />
              </View>
              <Text style={{ ...t.typography.label, color: done >= target ? t.colors.accentDeep : t.colors.inkMuted }}>
                {done}/{target}
              </Text>
            </View>
          );
        })}
    </View>,

    // 5. Тепловая карта
    <View key="heat" style={[styles.card, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}>
      <SectionTitle title={selHabit ? `${selHabit.name} · ${WEEKS} weeks` : `All habits · ${WEEKS} weeks`} />
      <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
        <View style={{ gap: 3 }}>
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
            colorForIntensity={(v) => {
              if (v < 0) return "transparent";
              if (v === 0) return t.colors.backgroundAlt;
              const c = selHabit?.color ?? t.colors.accent;
              return v >= 0.67 ? c : v >= 0.34 ? c + "AA" : c + "55";
            }}
          />
        </View>
      </View>
    </View>,

    // 6. Надёжность по дням недели
    <View key="weekday" style={[styles.card, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}>
      <SectionTitle title="Planned days you actually kept" />
      <View style={{ height: 12 }} />
      <BarChart data={rates.map((r) => ({ label: WEEKDAYS[r.weekday], value: Math.round(r.rate * 100) }))} color={selHabit?.color ?? t.colors.accent} height={110} />
      <Text style={{ ...t.typography.caption, color: t.colors.inkMuted, marginTop: 10 }}>
        {!extremes
          ? "Needs at least 3 planned days on two weekdays."
          : extremes.reliable
            ? `${WEEKDAYS_LONG[extremes.best.weekday]} (${pct(extremes.best.rate)}) is reliably better than ${WEEKDAYS_LONG[extremes.worst.weekday]} (${pct(extremes.worst.rate)}) — their 95% ranges don't overlap.`
            : `${WEEKDAYS_LONG[extremes.best.weekday]} leads (${pct(extremes.best.rate)}) and ${WEEKDAYS_LONG[extremes.worst.weekday]} trails (${pct(extremes.worst.rate)}), but the gap isn't reliable yet.`}
      </Text>
    </View>,

    // 7. Калибровка прогнозов
    <View key="cal" style={[styles.card, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}>
      <SectionTitle title="Are the odds honest?" right={<Target size={14} color={t.colors.inkFaint} />} />
      {cal.n < 5 ? (
        <Text style={{ ...t.typography.caption, color: t.colors.inkMuted, marginTop: 10 }}>After a few closed planned days this compares the predicted odds with what really happened.</Text>
      ) : (
        <>
          <View style={{ gap: 10, marginTop: 12 }}>
            {cal.bins
              .filter((b) => b.n > 0)
              .map((b) => (
                <View key={b.lo} style={{ gap: 4 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ ...t.typography.caption, color: t.colors.inkMuted }}>
                      Predicted {pct(b.lo)}–{pct(b.hi)} · {b.n} days
                    </Text>
                    <Text style={{ ...t.typography.label, color: t.colors.ink }}>kept {pct(b.actual)}</Text>
                  </View>
                  <View style={{ height: 8, borderRadius: 4, backgroundColor: t.colors.backgroundAlt }}>
                    <View style={{ position: "absolute", left: 0, width: `${b.actual * 100}%`, height: 8, borderRadius: 4, backgroundColor: t.colors.accent }} />
                    <View style={{ position: "absolute", left: `${b.predicted * 100}%`, top: -3, width: 3, height: 14, borderRadius: 2, backgroundColor: t.colors.ink }} />
                  </View>
                </View>
              ))}
          </View>
          <Text style={{ ...t.typography.caption, color: t.colors.inkMuted, marginTop: 10 }}>
            Black tick = predicted, bar = kept. Brier score {cal.brier.toFixed(3)} ·{" "}
            {cal.skill > 0.02 ? `${Math.round(cal.skill * 100)}% better than a flat average` : "not yet better than a flat average"}.
          </Text>
        </>
      )}
    </View>,

    // 8. По плану против сверх плана
    <View key="planned" style={[styles.card, { backgroundColor: t.colors.surface, borderColor: t.colors.border, flexDirection: "row", alignItems: "center", gap: 16 }]}>
      <DonutChart segments={[{ value: plannedDone, color: t.colors.accent }, { value: extra, color: t.colors.pin }]} size={96} strokeWidth={14} />
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={{ ...t.typography.overline, color: t.colors.inkMuted }}>On plan vs extra</Text>
        <Legend
          rows={[
            { color: t.colors.accent, label: "On a planned day", value: String(plannedDone) },
            { color: t.colors.pin, label: "Extra, unplanned", value: String(extra) },
          ]}
        />
      </View>
    </View>,
  ];

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      <ScrollView stickyHeaderIndices={[0]} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <View style={{ backgroundColor: t.colors.background, paddingTop: insets.top + t.spacing.sm, paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.sm, flexDirection: "row", alignItems: "center", gap: 12 }}>
          <IconButton label="Back" onPress={() => router.back()}>
            <ChevronLeft size={20} color={t.colors.ink} />
          </IconButton>
          <View style={{ flex: 1 }}>
            <Text style={{ ...t.typography.subtitle, color: t.colors.ink }}>Stats</Text>
            <Text numberOfLines={1} style={{ ...t.typography.caption, color: t.colors.inkMuted }}>
              {[week ? `Week of ${dayLabel(week)}` : `Last ${WEEKS} weeks`, selHabit?.name].filter(Boolean).join(" · ")}
            </Text>
          </View>
        </View>
        <View style={{ paddingHorizontal: t.spacing.lg, gap: 12, paddingTop: 4 }}>
          {sections.map((s, i) => (
            <Animated.View key={i} entering={FadeInDown.delay(staggerDelay(i, 60)).duration(400)}>
              {s}
            </Animated.View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, borderRadius: 22, borderWidth: 1 },
});
