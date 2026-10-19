import { useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { CalendarRange, ChartColumn, Check, ChevronRight, Pencil, Pin, Plus, Search, Settings2, Trash, TriangleAlert, Undo2 } from "lucide-react-native";
import { useTheme } from "../src/theme";
import { staggerDelay } from "../src/theme/motion";
import { MAX_HABITS, useApp, useSnapshot } from "../src/store/appStore";
import { WeekDial } from "../src/components/WeekDial";
import { QuotaPips } from "../src/components/QuotaPips";
import { PressableScale } from "../src/components/PressableScale";
import { PrimaryButton } from "../src/components/PrimaryButton";
import { SecondaryButton } from "../src/components/SecondaryButton";
import { IconButton, SectionTitle } from "../src/components/Bits";
import { SwipeRow } from "../src/components/SwipeRow";
import { Sheet } from "../src/components/Sheet";
import { HabitSheet } from "../src/components/HabitSheet";
import { SuccessBurst } from "../src/components/SuccessBurst";
import { HabitIcon } from "../src/ui/habitIcons";
import { dialDays, doneOn, shortDays, statusLabel } from "../src/ui/selectors";
import { findConflicts } from "../src/lib/conflicts";
import { addDays, dayLabel } from "../src/lib/time";
import { pct } from "../src/ui/format";
import { haptics } from "../src/services/haptics";
import type { Habit } from "../src/lib/types";
import type { HabitPlan } from "../src/lib/planner";

export default function HomeScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const app = useApp();
  const snap = useSnapshot();
  const [query, setQuery] = useState("");
  const [sheet, setSheet] = useState<"new" | "edit" | "checkin" | "menu" | null>(null);
  const [focus, setFocus] = useState<Habit | null>(null);
  const [burst, setBurst] = useState(false);

  const conflicts = useMemo(() => (app.input && app.plan ? findConflicts(app.input, app.plan) : []), [app.version]);
  if (!snap) return null;
  const { plan, today } = snap;
  const planOf = (id: string) => plan.habits.find((h) => h.habitId === id) as HabitPlan;
  const todayList = snap.habits.filter((h) => planOf(h.id)?.days.includes(today) || doneOn(snap, h.id, today));
  const q = query.trim().toLowerCase();
  const list = snap.habits.filter((h) => !q || h.name.toLowerCase().includes(q));
  const atRisk = plan.habits.filter((h) => h.status === "atRisk" || h.status === "unreachable").length;
  const open = plan.habits.filter((h) => h.status !== "met").length;

  const markDone = async (h: Habit) => {
    const nowDone = await app.toggleDone(h.id, today);
    if (nowDone) {
      haptics.success();
      setBurst(true);
    } else haptics.tap();
  };

  const tomorrow = addDays(today, 1);
  const canMoveTomorrow = plan.days.includes(tomorrow);

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      <ScrollView stickyHeaderIndices={[2, 4]} contentContainerStyle={{ paddingTop: insets.top + t.spacing.md, paddingBottom: insets.bottom + 40 }}>
        {/* 0: верхняя строка */}
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: t.spacing.lg, marginBottom: t.spacing.md }}>
          <View style={{ flex: 1 }}>
            <Text style={{ ...t.typography.overline, color: t.colors.accent }}>Week of {dayLabel(snap.week)}</Text>
            <Text style={{ fontSize: 26, fontWeight: "800", color: t.colors.ink, letterSpacing: -0.4 }}>Steady Weeks</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <IconButton label="Stats" onPress={() => router.push("/stats")}>
              <ChartColumn size={18} color={t.colors.ink} />
            </IconButton>
            <IconButton label="Settings" onPress={() => router.push("/settings")}>
              <Settings2 size={18} color={t.colors.ink} />
            </IconButton>
          </View>
        </View>

        {/* 1: hero-карточка с действием внутри */}
        <Animated.View entering={FadeInDown.duration(420)} style={{ marginHorizontal: t.spacing.lg, backgroundColor: t.colors.surface, borderRadius: 28, padding: t.spacing.lg, borderWidth: 1, borderColor: t.colors.border }}>
          {snap.habits.length === 0 ? (
            <StartChecklist onAdd={() => setSheet("new")} />
          ) : (
            <>
              <View style={{ alignItems: "center" }}>
                <WeekDial days={dialDays(snap)} expected={plan.expectedHits} total={snap.habits.length} />
              </View>
              <View style={{ flexDirection: "row", justifyContent: "center", gap: 16, marginTop: -6, marginBottom: t.spacing.lg }}>
                <Stat label="open" value={String(open)} color={t.colors.ink} />
                <Stat label="at risk" value={String(atRisk)} color={atRisk ? t.colors.danger : t.colors.ink} />
                <Stat label="today" value={`${todayList.filter((h) => doneOn(snap, h.id, today)).length}/${todayList.length}`} color={t.colors.accent} />
              </View>
              <PrimaryButton label="Check in today" onPress={() => setSheet("checkin")} />
              <View style={{ height: 8 }} />
              <SecondaryButton label="Open week plan" onPress={() => router.push("/plan")} />
            </>
          )}
        </Animated.View>

        {/* 2: липкий заголовок "Today" */}
        <StickyTitle title="Today" right={conflicts.length ? <ConflictBadge n={conflicts.length} onPress={() => router.push("/plan")} /> : undefined} />

        {/* 3: сегодняшние заходы со свайпами */}
        <View style={{ paddingHorizontal: t.spacing.lg, gap: 8 }}>
          {snap.habits.length > 0 && todayList.length === 0 ? (
            <Text style={{ ...t.typography.caption, color: t.colors.inkMuted, paddingVertical: 8 }}>Nothing planned today — the planner found better days. Check in anyway if you do something.</Text>
          ) : null}
          {todayList.map((h, i) => {
            const done = doneOn(snap, h.id, today);
            const hp = planOf(h.id);
            const p = hp.days.includes(today) ? hp.probs[hp.days.indexOf(today)] : undefined;
            return (
              <Animated.View key={h.id} entering={FadeInDown.delay(staggerDelay(i)).duration(380)}>
                <SwipeRow
                  right={{ label: done ? "Undo" : "Done", icon: done ? <Undo2 size={18} color={t.colors.onAccent} /> : <Check size={18} color={t.colors.onAccent} />, onTrigger: () => markDone(h) }}
                  left={!done && canMoveTomorrow ? { label: "Tomorrow", icon: <Pin size={18} color={t.colors.onAccent} />, onTrigger: () => app.movePin(h.id, snap.pins.some((x) => x.habitId === h.id && x.day === today) ? today : null, tomorrow) } : undefined}
                >
                  <PressableScale onPress={() => markDone(h)} style={[styles.row, { backgroundColor: done ? t.colors.accentSoft : t.colors.surface, borderColor: done ? t.colors.accentSoft : t.colors.border }]}>
                    <View style={[styles.icon, { backgroundColor: done ? h.color : t.colors.surfaceAlt }]}>
                      {done ? <Check size={18} color={t.colors.onAccent} strokeWidth={3} /> : <HabitIcon name={h.icon} color={h.color} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ ...t.typography.body, fontWeight: "700", color: t.colors.ink, textDecorationLine: done ? "line-through" : "none" }}>{h.name}</Text>
                      <Text style={{ ...t.typography.caption, color: t.colors.inkMuted }}>
                        {h.minutes} min · {done ? "done" : p !== undefined ? `${pct(p)} you usually do it on this day` : "extra session"}
                      </Text>
                    </View>
                  </PressableScale>
                </SwipeRow>
              </Animated.View>
            );
          })}
          {todayList.length > 0 ? <Text style={{ ...t.typography.caption, color: t.colors.inkFaint, textAlign: "center" }}>Swipe right to check off · left to pin it to tomorrow</Text> : null}
        </View>

        {/* 4: липкий заголовок "Habits" */}
        <StickyTitle
          title={`Habits · ${snap.habits.length}/${MAX_HABITS}`}
          right={
            snap.habits.length < MAX_HABITS ? (
              <PressableScale onPress={() => setSheet("new")} style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: t.colors.accent }}>
                <Plus size={14} color={t.colors.onAccent} />
                <Text style={{ ...t.typography.label, color: t.colors.onAccent }}>New habit</Text>
              </PressableScale>
            ) : undefined
          }
        />

        {/* 5: поиск + привычки */}
        <View style={{ paddingHorizontal: t.spacing.lg, gap: 8 }}>
          {snap.habits.length > 3 ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: t.colors.surface, borderRadius: 14, paddingHorizontal: 12, borderWidth: 1, borderColor: t.colors.border }}>
              <Search size={16} color={t.colors.inkFaint} />
              <TextInput value={query} onChangeText={setQuery} placeholder="Filter habits" placeholderTextColor={t.colors.inkFaint} style={{ flex: 1, paddingVertical: 10, color: t.colors.ink }} />
            </View>
          ) : null}
          {list.map((h, i) => {
            const hp = planOf(h.id);
            return (
              <Animated.View key={h.id} entering={FadeInDown.delay(staggerDelay(i)).duration(380)}>
                <PressableScale
                  onPress={() => router.push({ pathname: "/habit/[id]", params: { id: h.id } })}
                  onLongPress={() => {
                    haptics.press();
                    setFocus(h);
                    setSheet("menu");
                  }}
                  style={[styles.row, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}
                >
                  <View style={[styles.icon, { backgroundColor: t.colors.surfaceAlt }]}>
                    <HabitIcon name={h.icon} color={h.color} />
                  </View>
                  <View style={{ flex: 1, gap: 5 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text numberOfLines={1} style={{ ...t.typography.body, fontWeight: "700", color: t.colors.ink, flexShrink: 1 }}>
                        {h.name}
                      </Text>
                      <Text style={{ ...t.typography.caption, color: t.colors.inkFaint }}>
                        {hp.doneCount}/{hp.target}
                      </Text>
                    </View>
                    <QuotaPips target={hp.target} done={hp.doneCount} planned={hp.probs} color={h.color} />
                    <Text numberOfLines={1} style={{ ...t.typography.caption, color: t.colors.inkMuted }}>
                      {hp.status === "met" ? "Done for the week" : `Planned ${shortDays(hp.days)}`}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 2 }}>
                    <Text style={{ fontSize: 17, fontWeight: "800", color: hp.status === "atRisk" || hp.status === "unreachable" ? t.colors.danger : t.colors.ink }}>{pct(hp.pHit)}</Text>
                    <Text numberOfLines={1} style={{ fontSize: 11, color: t.colors.inkFaint }}>
                      {statusLabel(hp)}
                    </Text>
                  </View>
                  <ChevronRight size={16} color={t.colors.inkFaint} />
                </PressableScale>
              </Animated.View>
            );
          })}
          {q && list.length === 0 ? <Text style={{ ...t.typography.caption, color: t.colors.inkMuted }}>No habit matches “{query}”.</Text> : null}
          {snap.habits.length > 0 ? <Text style={{ ...t.typography.caption, color: t.colors.inkFaint, textAlign: "center" }}>Hold a habit for quick actions</Text> : null}
        </View>
      </ScrollView>

      {burst ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
          <SuccessBurst visible size={110} onDone={() => setTimeout(() => setBurst(false), 250)} />
        </View>
      ) : null}

      <Sheet visible={sheet === "checkin"} onClose={() => setSheet(null)} title="Check in" subtitle={`${dayLabel(today)} · tap what you did today`}>
        {snap.habits.map((h) => {
          const done = doneOn(snap, h.id, today);
          const planned = planOf(h.id).days.includes(today);
          return (
            <PressableScale key={h.id} onPress={() => markDone(h)} style={[styles.row, { backgroundColor: done ? t.colors.accentSoft : t.colors.surfaceAlt, borderColor: "transparent" }]}>
              <View style={[styles.icon, { backgroundColor: done ? h.color : t.colors.surface }]}>
                {done ? <Check size={18} color={t.colors.onAccent} strokeWidth={3} /> : <HabitIcon name={h.icon} color={h.color} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ ...t.typography.body, fontWeight: "700", color: t.colors.ink }}>{h.name}</Text>
                <Text style={{ ...t.typography.caption, color: t.colors.inkMuted }}>{planned ? "Planned today" : done ? "Done" : "Not planned — counts as extra"}</Text>
              </View>
              <Text style={{ ...t.typography.label, color: done ? t.colors.accentDeep : t.colors.inkFaint }}>{done ? "Done" : "Tap"}</Text>
            </PressableScale>
          );
        })}
      </Sheet>

      <Sheet visible={sheet === "menu" && !!focus} onClose={() => setSheet(null)} title={focus?.name ?? ""} subtitle="Quick actions">
        {focus ? (
          <>
            <MenuRow icon={<Pencil size={18} color={t.colors.ink} />} label="Edit habit" onPress={() => setSheet("edit")} />
            <MenuRow
              icon={<Pin size={18} color={t.colors.pin} />}
              label={snap.pins.some((p) => p.habitId === focus.id && p.day === today) ? "Unpin from today" : "Pin to today"}
              onPress={async () => {
                await app.togglePin(focus.id, today);
                setSheet(null);
              }}
            />
            <MenuRow icon={<CalendarRange size={18} color={t.colors.ink} />} label="See it on the week plan" onPress={() => { setSheet(null); router.push({ pathname: "/plan", params: { habit: focus.id } }); }} />
            <MenuRow
              icon={<Trash size={18} color={t.colors.danger} />}
              label="Delete habit"
              danger
              onPress={() =>
                Alert.alert("Delete habit?", `${focus.name} and its whole history will be removed.`, [
                  { text: "Cancel", style: "cancel" },
                  { text: "Delete", style: "destructive", onPress: async () => { setSheet(null); await app.deleteHabit(focus.id); } },
                ])
              }
            />
          </>
        ) : null}
      </Sheet>

      <HabitSheet
        visible={sheet === "new" || sheet === "edit"}
        initial={sheet === "edit" ? focus : null}
        usedColors={snap.habits.map((h) => h.color)}
        onClose={() => setSheet(null)}
        onSave={async (d) => {
          setSheet(null);
          if (focus && sheet === "edit") await app.updateHabit({ ...focus, ...d });
          else await app.addHabit(d);
          haptics.success();
          setBurst(true);
        }}
      />
    </View>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: "center", minWidth: 64 }}>
      <Text style={{ fontSize: 18, fontWeight: "800", color }}>{value}</Text>
      <Text style={{ ...t.typography.overline, color: t.colors.inkFaint }}>{label}</Text>
    </View>
  );
}

function StickyTitle({ title, right }: { title: string; right?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ backgroundColor: t.colors.background, paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.xl, paddingBottom: t.spacing.sm }}>
      <SectionTitle title={title} right={right} />
    </View>
  );
}

function ConflictBadge({ n, onPress }: { n: number; onPress: () => void }) {
  const t = useTheme();
  return (
    <PressableScale onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: t.colors.dangerSoft }}>
      <TriangleAlert size={13} color={t.colors.danger} />
      <Text numberOfLines={1} style={{ ...t.typography.label, color: t.colors.danger }}>
        {n === 1 ? "1 conflict" : `${n} conflicts`}
      </Text>
    </PressableScale>
  );
}

function MenuRow({ icon, label, onPress, danger }: { icon: React.ReactNode; label: string; onPress: () => void; danger?: boolean }) {
  const t = useTheme();
  return (
    <PressableScale onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: t.colors.surfaceAlt }}>
      {icon}
      <Text style={{ ...t.typography.body, fontWeight: "600", color: danger ? t.colors.danger : t.colors.ink }}>{label}</Text>
    </PressableScale>
  );
}

// Пустое состояние — карточка-чеклист "с чего начать", а не иллюстрация.
function StartChecklist({ onAdd }: { onAdd: () => void }) {
  const t = useTheme();
  const steps = ["Add a habit with a weekly quota, like Run 3× a week.", "The planner spreads it over the days you are most likely to show up.", "Check in when you do it — the odds learn from every planned day."];
  return (
    <View style={{ gap: 14 }}>
      <Text style={{ ...t.typography.title, color: t.colors.ink }}>Plan the week, not the streak</Text>
      {steps.map((s, i) => (
        <View key={i} style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
          <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: t.colors.accentSoft, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 12, fontWeight: "800", color: t.colors.accentDeep }}>{i + 1}</Text>
          </View>
          <Text style={{ ...t.typography.body, color: t.colors.inkMuted, flex: 1 }}>{s}</Text>
        </View>
      ))}
      <PrimaryButton label="Add your first habit" onPress={onAdd} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 20, borderWidth: 1 },
  icon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
});
