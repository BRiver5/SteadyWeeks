// Локальные уведомления. Никаких точных будильников (SCHEDULE_EXACT_ALARM /
// USE_EXACT_ALARM) — эти разрешения заблокированы в app.json и предназначены
// только для приложений-будильников/календарей. Погрешность в пару минут для
// напоминания не критична.
//
// Модуль expo-notifications подгружается ЛЕНИВО и НЕ в Expo Go: с SDK 53 сам
// статический импорт в Expo Go на Android падает ошибкой про push-уведомления
// (проверено на Churnly — экран не открывался). В установленной сборке (AAB) всё
// работает штатно. В Expo Go функции ниже молча ничего не делают, а
// notificationsAvailable = false — покажи это в Settings честной подписью
// ("Works in the installed app"), а не сломанным переключателем.

import Constants, { ExecutionEnvironment } from "expo-constants";

type NotificationsModule = typeof import("expo-notifications");

export const notificationsAvailable = Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

let mod: NotificationsModule | null = null;
function load(): NotificationsModule | null {
  if (!notificationsAvailable) return null;
  if (!mod) {
    mod = require("expo-notifications") as NotificationsModule;
    mod.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
  }
  return mod;
}

export async function requestNotificationPermission(): Promise<boolean> {
  const N = load();
  if (!N) return false;
  const current = await N.getPermissionsAsync();
  if (current.granted) return true;
  const result = await N.requestPermissionsAsync();
  return result.granted;
}

export async function scheduleDaily(params: {
  id: string;
  hour: number;
  minute: number;
  title: string;
  body: string;
}): Promise<string | null> {
  const N = load();
  if (!N) return null;
  await N.cancelScheduledNotificationAsync(params.id).catch(() => {});
  return N.scheduleNotificationAsync({
    identifier: params.id,
    content: { title: params.title, body: params.body },
    trigger: {
      type: N.SchedulableTriggerInputTypes.DAILY,
      hour: params.hour,
      minute: params.minute,
    },
  });
}

export async function scheduleInterval(params: {
  id: string;
  seconds: number;
  title: string;
  body: string;
  repeats?: boolean;
}): Promise<string | null> {
  const N = load();
  if (!N) return null;
  await N.cancelScheduledNotificationAsync(params.id).catch(() => {});
  return N.scheduleNotificationAsync({
    identifier: params.id,
    content: { title: params.title, body: params.body },
    trigger: {
      type: N.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: params.seconds,
      repeats: params.repeats ?? false,
    },
  });
}

export async function cancelAll(): Promise<void> {
  const N = load();
  if (!N) return;
  await N.cancelAllScheduledNotificationsAsync();
}
