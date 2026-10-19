# Steady Weeks

**Plan the week, not the streak.**

Привычки с недельной квотой («бег 3× в неделю»). Приложение учится, в какие дни
недели ты реально выполняешь каждую привычку, раскладывает квоты на оставшиеся
дни недели под дневной лимит времени, показывает шанс закрыть каждую квоту,
конфликты с проверенными выходами и режим «что если». Полностью офлайн.

## Особенности

- Накапливаемая модель надёжности «привычка × день недели» с забыванием и
  частичным объединением с уровнем привычки.
- Точный планировщик недели (ветвление с границами, лагранжева граница).
- Конфликты: недостижимая квота, зажатая лимитом привычка, переполненный день —
  с ранжированными выходами, проверенными перепланированием.
- What if: лимит дня, занятый день, квота недели, длина сессии — до/после.
- Доска недели с жестами: закреп удержанием, перенос перетаскиванием.
- Stats: 8 секций, срез по неделе и по привычке, калибровка прогнозов.

## Стек

- Expo SDK 54 + expo-router, TypeScript
- `expo-sqlite` — вся persistence локально, интернет не нужен
- `expo-haptics`, `react-native-reanimated`, `react-native-gesture-handler`, `react-native-svg`

## Запуск

```bash
npm install
npx expo start
```

## Проверки

```bash
npm run verify   # tsc + node --test + check-rules + expo export
```

## Структура проекта

```
app/            экраны: index, plan, whatif, habit/[id], stats, settings
src/lib/        движок: model, planner, changes, conflicts, explain, history, stats
src/data/       repo.ts — доступ к SQLite (через мьютекс)
src/store/      appStore.ts — журнал → модель → план
src/components/ WeekDial, WeekBoard, QuotaPips, OddsBars, WeekdayOdds, WeekBars, HabitSheet + шаблонные
```
