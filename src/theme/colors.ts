// Палитра приложения. Это единственный файл, где должны жить цветовые значения —
// компоненты и экраны берут цвета только отсюда, магические hex-коды в JSX запрещены.
//
// Steady Weeks: нефритовый акцент #138652 (tools/palette-search.js, сектор 153°:
// зелёных нет среди последних десяти записей реестра) на тёплом "меловом" фоне.
// Вторичный тон — охра закрепов/запасных дней.

export const light = {
  background: "#F6F5F0",
  backgroundAlt: "#ECEBE4",
  surface: "#FFFFFF",
  surfaceAlt: "#F3F2EC",
  border: "#E2E0D7",
  ink: "#1C211E",
  inkMuted: "#5F655F",
  inkFaint: "#9DA19A",
  onAccent: "#FFFFFF",
  accent: "#138652",
  accentSoft: "#DCEEE3",
  accentDeep: "#0B5C37",
  // Закреп / запасной день в плане.
  pin: "#A8650F",
  pinSoft: "#F5E7D0",
  danger: "#C03B33",
  dangerSoft: "#F6DEDB",
  success: "#138652",
  // Предупреждение/второе свайп-действие (SwipeRow, бейдж Segmented) — тёмный
  // янтарь, белый текст на нём ≥ 4.5:1.
  signal: "#9A5B0B",
  // Затемнение под шторкой (Sheet) и цвет строки состояния, пока шторка открыта:
  // statusDimmed = background × 0.55 + ink × 0.45.
  scrim: "rgba(28,33,30,0.45)",
  statusDimmed: "#949691",
  // Категориальные цвета привычек — приглушённые, различимые между собой.
  habit: ["#138652", "#2F68B0", "#B4572B", "#7A4DAE", "#A98516", "#B8456C", "#2E8796", "#5E6B26"],
};

export const dark = {
  background: "#101412",
  backgroundAlt: "#161B18",
  surface: "#1C221F",
  surfaceAlt: "#242B27",
  border: "#2E3631",
  ink: "#EEF1EE",
  inkMuted: "#A6ADA7",
  inkFaint: "#6C746E",
  onAccent: "#FFFFFF",
  accent: "#2FB074",
  accentSoft: "#17382A",
  accentDeep: "#7FD9AC",
  pin: "#E0A040",
  pinSoft: "#3A2C16",
  danger: "#F06A62",
  dangerSoft: "#3A1C1A",
  success: "#2FB074",
  signal: "#E0A040",
  scrim: "rgba(0,0,0,0.6)",
  statusDimmed: "#070908",
  habit: ["#2FB074", "#5B93DB", "#D97B4E", "#A07AD6", "#D2AE3E", "#DC6F94", "#4FB3C2", "#93A44A"],
};

export type Palette = typeof light;
