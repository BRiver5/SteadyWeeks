export const typography = {
  display: { fontSize: 40, fontWeight: "700" as const, lineHeight: 46 },
  title: { fontSize: 24, fontWeight: "600" as const, lineHeight: 30 },
  subtitle: { fontSize: 18, fontWeight: "600" as const, lineHeight: 24 },
  body: { fontSize: 16, fontWeight: "400" as const, lineHeight: 22 },
  caption: { fontSize: 13, fontWeight: "400" as const, lineHeight: 18 },
  label: { fontSize: 13, fontWeight: "600" as const, lineHeight: 18 },
  // Подпись секции капсом (SectionTitle, Field в Sheet).
  overline: { fontSize: 11, fontWeight: "700" as const, lineHeight: 14, letterSpacing: 1.1, textTransform: "uppercase" as const },
  // Шрифт крупных чисел (Stepper, Legend). Если у приложения свой шрифт
  // заголовков — подставить его fontFamily сюда.
  number: { fontFamily: undefined as string | undefined },
};
