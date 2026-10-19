import { Alert, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Brain, ChevronLeft, Clock, Trash, Vibrate } from "lucide-react-native";
import { useTheme } from "../src/theme";
import { staggerDelay } from "../src/theme/motion";
import { DEFAULT_CAPACITY, useApp } from "../src/store/appStore";
import { IconButton, Stepper } from "../src/components/Bits";
import { Toggle } from "../src/components/Toggle";
import { PressableScale } from "../src/components/PressableScale";
import { WEEKDAYS_LONG } from "../src/lib/types";
import { CELL_DECAY, GLOBAL_MEAN } from "../src/lib/model";

export default function SettingsScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const app = useApp();
  const cap = app.settings.capacity;
  const total = cap.reduce((s, x) => s + x, 0);


  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.colors.background }} contentContainerStyle={{ paddingTop: insets.top + t.spacing.sm, paddingBottom: insets.bottom + 40, paddingHorizontal: t.spacing.lg, gap: t.spacing.xl }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <IconButton label="Back" onPress={() => router.back()}>
          <ChevronLeft size={20} color={t.colors.ink} />
        </IconButton>
        <Text style={{ ...t.typography.subtitle, color: t.colors.ink }}>Settings</Text>
      </View>

      <Group i={0} title={`Time for habits · ${Math.floor(total / 60)} h ${total % 60} min a week`} icon={<Clock size={14} color={t.colors.inkMuted} />}>
        {WEEKDAYS_LONG.map((d, i) => (
          <View key={d} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: t.colors.border }}>
            <Text style={{ ...t.typography.body, color: t.colors.ink }}>{d}</Text>
            <Stepper value={cap[i]} min={0} max={300} step={15} onChange={(v) => app.setCapacity(i, v)} format={(v) => `${v}m`} />
          </View>
        ))}
        <PressableScale
          onPress={async () => {
            for (let i = 0; i < 7; i++) if (cap[i] !== DEFAULT_CAPACITY[i]) await app.setCapacity(i, DEFAULT_CAPACITY[i]);
          }}
          style={{ padding: 14, borderTopWidth: 1, borderTopColor: t.colors.border, alignItems: "center" }}
        >
          <Text style={{ ...t.typography.label, color: t.colors.accent }}>Reset to 1 h weekdays, 1.5 h weekends</Text>
        </PressableScale>
      </Group>

      <Group i={1} title="Feedback" icon={<Vibrate size={14} color={t.colors.inkMuted} />}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ ...t.typography.body, color: t.colors.ink }}>Vibration</Text>
            <Text style={{ ...t.typography.caption, color: t.colors.inkMuted }}>Taps, check-ins and drag & drop</Text>
          </View>
          <Toggle value={app.settings.haptics} onValueChange={(v) => app.setHaptics(v)} />
        </View>
      </Group>

      <Group i={2} title="How the odds work" icon={<Brain size={14} color={t.colors.inkMuted} />}>
        <View style={{ padding: 16, gap: 8 }}>
          <Text style={{ ...t.typography.caption, color: t.colors.inkMuted }}>
            Every planned day that passes teaches the model whether you keep that habit on that weekday. A new habit starts at {Math.round(GLOBAL_MEAN * 100)}% and each weekday leans on the habit's overall record until it has its own. Each new result counts fully, older ones fade by {Math.round((1 - CELL_DECAY) * 100)}% per new result.
          </Text>
          <Text style={{ ...t.typography.caption, color: t.colors.inkMuted }}>
            The planner tries every combination of days for every habit and picks the plan that closes the most quotas within your daily time. Everything stays on this phone.
          </Text>
        </View>
      </Group>

      <Group i={3} title="Data" icon={<Trash size={14} color={t.colors.inkMuted} />}>
        <PressableScale
          onPress={() =>
            Alert.alert("Erase everything?", "All habits, check-ins and the learned odds will be deleted from this phone.", [
              { text: "Cancel", style: "cancel" },
              { text: "Erase", style: "destructive", onPress: () => app.wipe() },
            ])
          }
          style={{ padding: 16 }}
        >
          <Text style={{ ...t.typography.body, color: t.colors.danger, fontWeight: "600" }}>Erase all data</Text>
        </PressableScale>
      </Group>
      <Text style={{ ...t.typography.caption, color: t.colors.inkFaint, textAlign: "center" }}>Steady Weeks 1.0 · works offline</Text>
    </ScrollView>
  );
}

function Group({ title, icon, children, i }: { title: string; icon: React.ReactNode; children: React.ReactNode; i: number }) {
  const t = useTheme();
  return (
    <Animated.View entering={FadeInDown.delay(staggerDelay(i)).duration(380)} style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4 }}>
        {icon}
        <Text style={{ ...t.typography.overline, color: t.colors.inkMuted }}>{title}</Text>
      </View>
      <View style={{ backgroundColor: t.colors.surface, borderRadius: 22, borderWidth: 1, borderColor: t.colors.border, overflow: "hidden" }}>{children}</View>
    </Animated.View>
  );
}
