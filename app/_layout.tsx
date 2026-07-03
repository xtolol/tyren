import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { useFonts } from "expo-font";
import { useRouter, useSegments, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Linking } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useAuthStore } from "@/src/stores/useAuthStore";
import { supabase } from "@/src/lib/supabase";
import { palette } from "@/src/theme";

async function handleDeepLink(url: string) {
  // Supabase appends tokens as query params or, in the implicit flow,
  // as URL fragment params (tyren://#access_token=...) — check both.
  const parsed = new URL(url);
  const fragmentParams = new URLSearchParams(parsed.hash.replace(/^#/, ''));
  const getParam = (key: string) =>
    parsed.searchParams.get(key) ?? fragmentParams.get(key);

  const accessToken = getParam('access_token');
  const refreshToken = getParam('refresh_token');
  const code = getParam('code');

  if (accessToken && refreshToken) {
    await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  } else if (code) {
    await supabase.auth.exchangeCodeForSession(code);
  }
}

function AuthGuard() {
  const router = useRouter();
  const segments = useSegments();
  const { session, initialized, initialize } = useAuthStore();

  useEffect(() => {
    const unsubscribe = initialize();

    // Handle deep link that launched the app
    Linking.getInitialURL().then((url) => { if (url) handleDeepLink(url); });

    // Handle deep link while app is already open
    const sub = Linking.addEventListener('url', ({ url }) => handleDeepLink(url));

    return () => {
      unsubscribe();
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (!initialized) return;
    const onAuthScreen = (segments[0] as string) === 'auth';
    if (!session && !onAuthScreen) {
      router.replace('/auth' as never);
    } else if (session && onAuthScreen) {
      router.replace('/' as never);
    }
  }, [session, initialized, segments]);

  return null;
}

export default function RootLayout() {
  // The whole design system's type: serif titles, pixel numerals, UI sans.
  const [fontsLoaded] = useFonts({
    "InstrumentSerif-Regular": require("@/assets/images/fonts/InstrumentSerif-Regular.ttf"),
    "Silkscreen": require("@/assets/images/fonts/Silkscreen-Regular.ttf"),
    "Silkscreen-Bold": require("@/assets/images/fonts/Silkscreen-Bold.ttf"),
  });
  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: palette.bg }}>
      <BottomSheetModalProvider>
        <StatusBar style="light" translucent backgroundColor="transparent" />
        <AuthGuard />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: palette.bg },
          }}
        />
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}
