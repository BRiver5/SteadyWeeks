import { Bike, BookOpen, Brain, Dumbbell, Footprints, Guitar, Languages, Leaf, PenLine, Sprout, type LucideIcon } from "lucide-react-native";

export const HABIT_ICONS: Record<string, LucideIcon> = {
  run: Footprints,
  read: BookOpen,
  gym: Dumbbell,
  mind: Brain,
  language: Languages,
  music: Guitar,
  bike: Bike,
  write: PenLine,
  plant: Sprout,
  leaf: Leaf,
};

export function HabitIcon({ name, size = 18, color }: { name: string; size?: number; color: string }) {
  const Icon = HABIT_ICONS[name] ?? Leaf;
  return <Icon size={size} color={color} />;
}

// Пресеты для шторки новой привычки: один тап вместо ввода всех полей.
export const PRESETS: { name: string; icon: string; target: number; minutes: number; days: number }[] = [
  { name: "Run", icon: "run", target: 3, minutes: 35, days: 0b1111111 },
  { name: "Read", icon: "read", target: 5, minutes: 25, days: 0b1111111 },
  { name: "Gym", icon: "gym", target: 3, minutes: 60, days: 0b0111111 },
  { name: "Meditate", icon: "mind", target: 5, minutes: 15, days: 0b1111111 },
  { name: "Spanish", icon: "language", target: 4, minutes: 20, days: 0b0011111 },
  { name: "Guitar", icon: "music", target: 3, minutes: 30, days: 0b1111111 },
  { name: "Cycle", icon: "bike", target: 2, minutes: 60, days: 0b1100000 },
  { name: "Journal", icon: "write", target: 4, minutes: 15, days: 0b1111111 },
];
