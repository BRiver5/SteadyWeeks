import { useEffect, useState } from "react";
import { View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { getDb } from "../src/db/client";
import { useTheme } from "../src/theme";
import { useUi } from "../src/store/uiStore";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const theme = useTheme();

  useEffect(() => {
    getDb()
      .then(() => setReady(true))
      .finally(() => SplashScreen.hideAsync().catch(() => {}));
  }, []);

  // Если в приложении есть zustand-стор с данными: после горячей перезагрузки
  // модуля он пустой — здесь проверить store.ready и вызвать refresh() ещё раз,
  // иначе экраны получат null (проверено на Churnly).
  if (!ready) return null;

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
