import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { ChevronLeft, GitCompareArrows, Lightbulb, Pin, TriangleAlert, Wand } from "lucide-react-native";
import { useTheme } from "../src/theme";
import { staggerDelay } from "../src/theme/motion";
import { useApp, useSnapshot } from "../src/store/appStore";
import { WeekBoard } from "../src/components/WeekBoard";
import { OddsBars } from "../src/components/OddsBars";
import { IconButton, SectionTitle } from "../src/components/Bits";
import { PressableScale } from "../src/components/PressableScale";
import { SuccessBurst } from "../src/components/SuccessBurst";
import { HabitIcon } from "../src/ui/habitIcons";
import { boardDays, statusLabel } from "../src/ui/selectors";
import type { Fix } from "../src/lib/conflicts";
import { explainHabit } from "../src/lib/explain";
import { weekdayIndex } from "../src/lib/time";
import { WEEKDAYS_LONG } from "../src/lib/types";
import { pct } from "../src/ui/format";
import { haptics } from "../src/services/haptics";

export default function PlanScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ habit?: string }>();
  const app = useApp();
  const snap = useSnapshot();
  const [selected, setSelected] = useState<string | null>(params.habit ?? null);
  const [burst, setBurst] = useState(false);

  const conflicts = app.conflicts ?? [];
  const sel = selected ?? snap?.plan.habits.find((h) => h.status !== "met")?.habitId ?? snap?.habits[0]?.id ?? null;
  const explanation = useMemo(() => (app.input && app.plan && sel ? explainHabit(app.input, app.plan, app.model, sel) : null), [app.version, sel]);
  if (!snap) return null;
  const habitById = (id: string) => snap.habits.find((h) => h.id === id);
  const selHabit = sel ? habitById(sel) : undefined;
  const selPlan = sel ? snap.plan.habits.find((h) => h.habitId === sel) : undefined;

  const applyFix = async (f: Fix) => {
    for (const c of f.changes) await app.applyChange(c);
    haptics.success();
    setBurst(true);
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      <View style={{ backgroundColor: t.colors.background, paddingTop: insets.top + t.spacing.sm, paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <IconButton label="Back" onPress={() => router.back()}>
          <ChevronLeft size={20} color={t.colors.ink} />
        </IconButton>
        <View style={{ flex: 1 }}>
          <Text style={{ ...t.typography.subtitle, color: t.colors.ink }}>Week plan</Text>
          <Text style={{ ...t.typography.caption, color: t.colors.inkMuted }}>
            {pct(snap.plan.expectedHits / Math.max(1, snap.habits.length))} of quotas expected · {snap.plan.exact ? "best plan, proven" : "best plan found in budget"}
          </Text>
        </View>
        <PressableScale onPress={() => router.push("/whatif")} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: t.colors.ink }}>
          <GitCompareArrows size={14} color={t.colors.surface} />
          <Text numberOfLines={1} style={{ ...t.typography.label, color: t.colors.surface }}>
            What{" "}if
          </Text>
        </PressableScale>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>

        <Animated.View entering={FadeInDown.duration(380)} style={[styles.card, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}>
          {snap.habits.length === 0 ? (
            <Text style={{ ...t.typography.body, color: t.colors.inkMuted }}>Add a habit on the home screen to see the week plan.</Text>
          ) : (
            <>
              <WeekBoard
                days={boardDays(snap)}
                selectedHabit={sel}
                onSelectHabit={setSelected}
                onTogglePin={(h, d) => app.togglePin(h, d)}
                onMove={(h, from, to, wasPinned) => app.movePin(h, wasPinned ? from : null, to)}
                onDayPress={(d) => app.toggleBusy(weekdayIndex(d))}
              />
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
                <Pin size={12} color={t.colors.pin} />
                <Text style={{ ...t.typography.caption, color: t.colors.inkFaint, flex: 1 }}>Tap a habit to explain it · hold to pin · hold and drag to move · tap a weekday to mark it busy</Text>
              </View>
            </>
          )}
        </Animated.View>

        {conflicts.length > 0 ? (
          <View style={{ paddingHorizontal: t.spacing.lg, marginTop: t.spacing.xl, gap: 10 }}>
            <SectionTitle title="Conflicts" />
            {conflicts.map((c, i) => (
              <Animated.View key={c.id} entering={FadeInDown.delay(staggerDelay(i)).duration(380)} style={[styles.card, { marginHorizontal: 0, backgroundColor: t.colors.surface, borderColor: t.colors.dangerSoft }]}>
                <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
                  <TriangleAlert size={18} color={t.colors.danger} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ ...t.typography.body, fontWeight: "700", color: t.colors.ink }}>{c.title}</Text>
                    <Text style={{ ...t.typography.caption, color: t.colors.inkMuted, marginTop: 2 }}>{c.reason}</Text>
                  </View>
                </View>
                {c.fixes.length ? (
                  <View style={{ marginTop: 12, gap: 6 }}>
                    <Text style={{ ...t.typography.overline, color: t.colors.inkFaint }}>Ways out, checked by re-planning</Text>
                    {c.fixes.map((f, j) => (
                      <PressableScale key={j} onPress={() => applyFix(f)} style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 12, backgroundColor: j === 0 ? t.colors.accentSoft : t.colors.surfaceAlt }}>
                        <Wand size={15} color={j === 0 ? t.colors.accentDeep : t.colors.inkMuted} />
                        <Text style={{ ...t.typography.label, color: t.colors.ink, flex: 1 }}>{f.label}</Text>
                        <Text style={{ ...t.typography.label, color: f.gain > 0 ? t.colors.accentDeep : t.colors.inkFaint }}>{f.gain > 0 ? `+${f.gain.toFixed(2)}` : "frees day"}</Text>
                      </PressableScale>
                    ))}
                  </View>
                ) : (
                  <Text style={{ ...t.typography.caption, color: t.colors.inkFaint, marginTop: 8 }}>No single change helps this week.</Text>
                )}
              </Animated.View>
            ))}
          </View>
        ) : null}

        {selHabit && selPlan && explanation ? (
          <View style={{ paddingHorizontal: t.spacing.lg, marginTop: t.spacing.xl, gap: 10 }}>
            <SectionTitle title="Why these days" right={<Text numberOfLines={1} style={{ ...t.typography.label, color: t.colors.inkMuted }}>{statusLabel(selPlan)}</Text>} />
            <Animated.View key={sel} entering={FadeInDown.duration(320)} style={[styles.card, { marginHorizontal: 0, backgroundColor: t.colors.surface, borderColor: t.colors.border }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.colors.surfaceAlt, alignItems: "center", justifyContent: "center" }}>
                  <HabitIcon name={selHabit.icon} color={selHabit.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ ...t.typography.body, fontWeight: "700", color: t.colors.ink }}>{selHabit.name}</Text>
                  <Text style={{ ...t.typography.caption, color: t.colors.inkMuted }}>
                    {explanation.need === 0
                      ? "Quota already met this week."
                      : `Needs ${explanation.need} more · ${explanation.chosen.length} planned${explanation.buffer ? ` (incl. ${explanation.buffer} spare)` : ""} · ${pct(explanation.pHit)} to hit`}
                  </Text>
                </View>
              </View>
              {explanation.chosen.map((c) => (
                <View key={c.day} style={{ marginTop: 12, gap: 4 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={{ ...t.typography.label, color: t.colors.ink, flex: 1 }}>
                      {WEEKDAYS_LONG[weekdayIndex(c.day)]}
                      {c.pinned ? "  · pinned" : ""}
                    </Text>
                    <Text style={{ ...t.typography.label, color: t.colors.accentDeep }}>{pct(c.p.mean)}</Text>
                  </View>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: t.colors.backgroundAlt, flexDirection: "row", overflow: "hidden" }}>
                    <View style={{ width: `${c.p.priorMean * c.p.priorWeight * 100}%`, backgroundColor: t.colors.inkFaint }} />
                    <View style={{ width: `${Math.max(0, c.p.mean - c.p.priorMean * c.p.priorWeight) * 100}%`, backgroundColor: selHabit.color }} />
                  </View>
                  <Text style={{ ...t.typography.caption, color: t.colors.inkMuted }}>
                    {Math.round(c.p.priorWeight * 100)}% from the habit overall ({pct(c.p.priorMean)}), {Math.round((1 - c.p.priorWeight) * 100)}% from your {WEEKDAYS_LONG[weekdayIndex(c.day)].slice(0, 3)} record (≈{Math.round(c.p.s)} kept / {Math.round(c.p.f)} missed, recent days weigh more). Adds +{Math.round(c.marginal * 100)} pts to the quota odds.
                  </Text>
                </View>
              ))}
              {explanation.skipped.length ? (
                <View style={{ marginTop: 14, gap: 4 }}>
                  <Text style={{ ...t.typography.overline, color: t.colors.inkFaint }}>Not used</Text>
                  {explanation.skipped.map((s) => (
                    <Text key={s.day} style={{ ...t.typography.caption, color: t.colors.inkMuted }}>
                      <Text style={{ fontWeight: "700", color: t.colors.ink }}>{WEEKDAYS_LONG[weekdayIndex(s.day)].slice(0, 3)}</Text> — {s.reason}
                    </Text>
                  ))}
                </View>
              ) : null}
            </Animated.View>
          </View>
        ) : null}

        {snap.habits.length > 0 ? (
          <View style={{ paddingHorizontal: t.spacing.lg, marginTop: t.spacing.xl, gap: 10 }}>
            <SectionTitle title="How many quotas you'll close" />
            <View style={[styles.card, { marginHorizontal: 0, backgroundColor: t.colors.surface, borderColor: t.colors.border }]}>
              <OddsBars dist={snap.plan.hitDist} />
              <View style={{ flexDirection: "row", gap: 8, marginTop: 12, alignItems: "flex-start" }}>
                <Lightbulb size={14} color={t.colors.pin} />
                <Text style={{ ...t.typography.caption, color: t.colors.inkMuted, flex: 1 }}>
                  Each habit's chance is exact for its planned days; habits are treated as independent. Tap a bar for that outcome.
                </Text>
              </View>
            </View>
          </View>
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

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, padding: 16, borderRadius: 24, borderWidth: 1 },
});
