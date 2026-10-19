import { useEffect, useState } from "react";
import { AppState, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { getDb } from "../src/db/client";
import { useTheme } from "../src/theme";
import { useUi } from "../src/store/uiStore";
import { useApp } from "../src/store/appStore";
import { todayLocal } from "../src/lib/time";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const theme = useTheme();
  const storeReady = useApp((s) => s.ready);

  useEffect(() => {
    getDb()
      .then(() => useApp.getState().refresh())
      .then(() => setReady(true))
      .finally(() => SplashScreen.hideAsync().catch(() => {}));
  }, []);

  // После горячей перезагрузки модуля стор пустой — пересобрать.
  useEffect(() => {
    if (ready && !storeReady) useApp.getState().refresh();
  }, [ready, storeReady]);

  // Приложение открыли на следующий день — закрыть вчерашний день в модели и перепланировать.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (st) => {
      if (st === "active" && useApp.getState().ready && useApp.getState().today !== todayLocal()) useApp.getState().refresh();
    });
    return () => sub.remove();
  }, []);

  if (!ready || !storeReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style={theme.scheme === "dark" ? "light" : "dark"} />
        <Stack
          screenOptions={{
            headerShown: false,
            animation: "slide_from_right",
            contentStyle: { backgroundColor: theme.colors.background },
          }}
        />
        <StatusBackdrop color={theme.colors.background} dimmedColor={theme.colors.statusDimmed} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// Подложка под строкой состояния: приложение рисуется edge-to-edge, и
// прокручиваемый контент иначе проезжает под часами. Пока открыта шторка
// (src/components/Sheet.tsx) — затемняется вместе с экраном.
function StatusBackdrop({ color, dimmedColor }: { color: string; dimmedColor: string }) {
  const insets = useSafeAreaInsets();
  const dimmed = useUi((s) => s.sheets > 0);
  return <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, height: insets.top, backgroundColor: dimmed ? dimmedColor : color }} />;
}
